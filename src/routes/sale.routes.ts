import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requirePermission } from '../middleware/permission.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'
import { logAction } from '../utils/logAction'

const router = Router()

// POST /sale/checkout
router.post('/checkout', requirePermission('subscriptions', 'create'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch', code: 'NO_BRANCH' })

    const { client_id, items, promo_code, payment_method } = req.body as {
      client_id: string
      items: Array<{ type: 'subscription' | 'warehouse'; template_id?: string; item_id?: string; quantity: number }>
      promo_code?: string
      payment_method: 'cash' | 'card'
    }

    if (!client_id) return res.status(400).json({ error: 'client_id required', code: 'VALIDATION_ERROR' })
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items required', code: 'VALIDATION_ERROR' })
    if (!payment_method) return res.status(400).json({ error: 'payment_method required', code: 'VALIDATION_ERROR' })

    // Проверяем клиента
    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .select('id, full_name')
      .eq('id', client_id)
      .eq('branch_id', branchId)
      .maybeSingle()

    if (clientErr || !client) return res.status(404).json({ error: 'Клиент не найден', code: 'CLIENT_NOT_FOUND' })

    // Загружаем шаблоны абонементов
    const subItems = items.filter(i => i.type === 'subscription' && i.template_id)
    const wItems   = items.filter(i => i.type === 'warehouse'    && i.item_id)

    let templates: Record<string, any> = {}
    if (subItems.length > 0) {
      const { data: tpls } = await supabase
        .from('subscription_templates')
        .select('*')
        .in('id', subItems.map(i => i.template_id!))
      for (const t of tpls ?? []) templates[t.id] = t
    }

    let warehouseItems: Record<string, any> = {}
    if (wItems.length > 0) {
      const { data: wData } = await supabase
        .from('warehouse_items')
        .select('*')
        .in('id', wItems.map(i => i.item_id!))
        .eq('branch_id', branchId)
      for (const w of wData ?? []) warehouseItems[w.id] = w
    }

    // Считаем итоговую сумму
    let subtotal = 0
    for (const item of items) {
      if (item.type === 'subscription' && item.template_id) {
        const tpl = templates[item.template_id]
        if (tpl?.price) subtotal += Number(tpl.price) * (item.quantity ?? 1)
      } else if (item.type === 'warehouse' && item.item_id) {
        const wi = warehouseItems[item.item_id]
        if (wi?.price) subtotal += Number(wi.price) * (item.quantity ?? 1)
        // Проверяем остаток на складе
        if (wi && wi.quantity < (item.quantity ?? 1)) {
          return res.status(400).json({ error: `Недостаточно товара «${wi.name}» на складе`, code: 'INSUFFICIENT_STOCK' })
        }
      }
    }

    // Проверяем промокод
    let promoData: any = null
    let discount = 0

    if (promo_code) {
      const code = promo_code.toUpperCase().trim()
      const { data: promo, error: promoErr } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('code', code)
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .maybeSingle()

      if (promoErr || !promo) return res.status(404).json({ error: 'Промокод не найден', code: 'PROMO_NOT_FOUND' })
      if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
        return res.status(400).json({ error: 'Промокод истёк', code: 'PROMO_EXPIRED' })
      }
      if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) {
        return res.status(400).json({ error: 'Промокод исчерпан', code: 'PROMO_EXHAUSTED' })
      }
      if (promo.max_uses_per_client !== null) {
        const { count } = await supabase
          .from('promo_code_usages')
          .select('id', { count: 'exact', head: true })
          .eq('promo_code_id', promo.id)
          .eq('client_id', client_id)
        if ((count ?? 0) >= promo.max_uses_per_client) {
          return res.status(400).json({ error: 'Вы уже использовали этот промокод максимальное количество раз', code: 'PROMO_PER_CLIENT_LIMIT' })
        }
      }

      promoData = promo
      if (promo.discount_type === 'percent') {
        discount = Math.round(subtotal * promo.discount_value / 100)
      } else {
        discount = Math.min(subtotal, Number(promo.discount_value))
      }
    }

    const total = Math.max(0, subtotal - discount)
    const today = new Date().toISOString().slice(0, 10)
    const createdItems: any[] = []

    // Создаём абонементы
    for (const item of subItems) {
      const tpl = templates[item.template_id!]
      if (!tpl) continue

      const payload: Record<string, unknown> = {
        client_id, branch_id: branchId,
        name: tpl.name,
        slot_1_type: tpl.slot_1_type,
        slot_1_duration_min: tpl.slot_1_duration_min,
        slot_1_sessions_total: tpl.slot_1_sessions_total,
        slot_1_sessions_left: tpl.slot_1_sessions_total,
        date_start: today,
        status: 'active',
        price: tpl.price ?? null,
      }
      if (tpl.validity_days) {
        const end = new Date()
        end.setDate(end.getDate() + tpl.validity_days)
        payload.date_end = end.toISOString().slice(0, 10)
      }
      if (tpl.slot_2_type) {
        payload.slot_2_type = tpl.slot_2_type
        payload.slot_2_duration_min = tpl.slot_2_duration_min ?? null
        payload.slot_2_sessions_total = tpl.slot_2_sessions_total ?? null
        payload.slot_2_sessions_left = tpl.slot_2_sessions_total ?? null
      }

      const { data: sub } = await supabase.from('subscriptions').insert(payload).select('id, name').single()
      if (sub) createdItems.push({ type: 'subscription', id: sub.id, name: sub.name })
    }

    // Списываем товары со склада
    for (const item of wItems) {
      const wi = warehouseItems[item.item_id!]
      if (!wi) continue

      await supabase.from('warehouse_movements').insert({
        item_id: wi.id,
        branch_id: branchId,
        type: 'out',
        quantity: item.quantity,
        notes: `Продажа: ${(client as any).full_name}`,
        performed_by: req.user!.id,
      })
      await supabase.from('warehouse_items')
        .update({ quantity: wi.quantity - item.quantity })
        .eq('id', wi.id)

      createdItems.push({ type: 'warehouse', id: wi.id, name: wi.name, quantity: item.quantity })
    }

    // Записываем применение промокода и инкрементируем счётчик
    if (promoData) {
      await supabase.from('promo_code_usages').insert({ promo_code_id: promoData.id, client_id })
      await supabase.from('promo_codes')
        .update({ uses_count: (promoData.uses_count ?? 0) + 1 })
        .eq('id', promoData.id)
    }

    // Логируем операцию
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', req.user!.id).single()
    await logAction({
      branch_id:   branchId,
      entity_type: 'sale',
      entity_id:   client_id,
      action:      'checkout',
      actor_id:    req.user!.id,
      actor_name:  (profile as any)?.full_name ?? req.user!.email,
      details: {
        client_id, total, discount, payment_method,
        promo_code: promo_code ?? null,
        items_count: createdItems.length,
      },
    })

    return res.json({
      success: true,
      total,
      discount,
      subtotal,
      payment_method,
      client: { id: client_id, full_name: (client as any).full_name },
      items_created: createdItems,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    console.error('[POST /sale/checkout]', e)
    return res.status(500).json({ error: msg })
  }
})

export default router
