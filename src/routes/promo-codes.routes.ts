import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requirePermission } from '../middleware/permission.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /promo-codes
router.get('/', requirePermission('subscriptions', 'view'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    let query = supabase.from('promo_codes').select('*').order('created_at', { ascending: false })
    if (branchId) query = query.eq('branch_id', branchId)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data ?? [])
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// GET /promo-codes/validate/:code — validate a promo code (used at purchase)
router.get('/validate/:code', requirePermission('subscriptions', 'view'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    const code = req.params.code.toUpperCase().trim()

    const { data, error } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle()

    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Промокод не найден', code: 'NOT_FOUND' })
    if (branchId && data.branch_id !== branchId) return res.status(404).json({ error: 'Промокод не найден', code: 'NOT_FOUND' })
    if (data.max_uses !== null && data.uses_count >= data.max_uses) return res.status(400).json({ error: 'Промокод исчерпан', code: 'EXHAUSTED' })
    if (data.expires_at && new Date(data.expires_at) < new Date()) return res.status(400).json({ error: 'Промокод истёк', code: 'EXPIRED' })

    return res.json({ valid: true, discount_type: data.discount_type, discount_value: data.discount_value, id: data.id })
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// POST /promo-codes
router.post('/', requirePermission('subscriptions', 'edit'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch' })
    const { code, discount_type, discount_value, max_uses, expires_at } = req.body
    if (!code?.trim()) return res.status(400).json({ error: 'code required' })
    if (!discount_type || !['fixed', 'percent'].includes(discount_type)) return res.status(400).json({ error: 'discount_type must be fixed or percent' })
    if (discount_value === undefined || discount_value < 0) return res.status(400).json({ error: 'discount_value required' })

    const { data, error } = await supabase
      .from('promo_codes')
      .insert({
        branch_id: branchId,
        code: code.trim().toUpperCase(),
        discount_type,
        discount_value,
        max_uses: max_uses ?? null,
        expires_at: expires_at ?? null,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Промокод с таким кодом уже существует', code: 'DUPLICATE' })
      return res.status(500).json({ error: error.message })
    }
    return res.status(201).json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// PATCH /promo-codes/:id
router.patch('/:id', requirePermission('subscriptions', 'edit'), async (req: Request, res: Response) => {
  try {
    const { discount_type, discount_value, max_uses, expires_at, is_active } = req.body
    const patch: Record<string, unknown> = {}
    if (discount_type  !== undefined) patch.discount_type  = discount_type
    if (discount_value !== undefined) patch.discount_value = discount_value
    if (max_uses       !== undefined) patch.max_uses       = max_uses
    if (expires_at     !== undefined) patch.expires_at     = expires_at
    if (is_active      !== undefined) patch.is_active      = is_active

    const { data, error } = await supabase
      .from('promo_codes')
      .update(patch)
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// DELETE /promo-codes/:id
router.delete('/:id', requirePermission('subscriptions', 'edit'), async (req: Request, res: Response) => {
  try {
    const { error } = await supabase.from('promo_codes').delete().eq('id', req.params.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

export default router
