import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requirePermission } from '../middleware/permission.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /supplier-orders
router.get('/', requirePermission('warehouse', 'view'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    let query = supabase
      .from('supplier_orders')
      .select('*, suppliers(id, name), supplier_order_items(*)')
      .order('created_at', { ascending: false })
    if (branchId) query = query.eq('branch_id', branchId)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data ?? [])
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// POST /supplier-orders
router.post('/', requirePermission('warehouse', 'create'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch', code: 'NO_BRANCH' })
    const { supplier_id, notes, ordered_at, items } = req.body as {
      supplier_id?: string
      notes?: string
      ordered_at?: string
      items?: Array<{ item_name: string; quantity: number; unit_price?: number }>
    }

    const { data: order, error: orderErr } = await supabase
      .from('supplier_orders')
      .insert({
        branch_id:   branchId,
        supplier_id: supplier_id || null,
        notes:       notes || null,
        ordered_at:  ordered_at || new Date().toISOString().slice(0, 10),
        created_by:  req.user!.id,
      })
      .select('*, suppliers(id, name)')
      .single()

    if (orderErr) return res.status(500).json({ error: orderErr.message })

    if (Array.isArray(items) && items.length > 0) {
      const rows = items.map(i => ({
        order_id:   order.id,
        item_name:  i.item_name,
        quantity:   i.quantity ?? 1,
        unit_price: i.unit_price ?? null,
      }))
      await supabase.from('supplier_order_items').insert(rows)
    }

    return res.status(201).json(order)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// PATCH /supplier-orders/:id
router.patch('/:id', requirePermission('warehouse', 'create'), async (req: Request, res: Response) => {
  try {
    const { status, notes, delivered_at, total_amount } = req.body
    const patch: Record<string, unknown> = {}
    if (status       !== undefined) patch.status       = status
    if (notes        !== undefined) patch.notes        = notes
    if (delivered_at !== undefined) patch.delivered_at = delivered_at
    if (total_amount !== undefined) patch.total_amount = total_amount
    if (status === 'delivered' && !patch.delivered_at) {
      patch.delivered_at = new Date().toISOString().slice(0, 10)
    }

    const { data, error } = await supabase
      .from('supplier_orders')
      .update(patch)
      .eq('id', req.params.id)
      .select('*, suppliers(id, name), supplier_order_items(*)')
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// DELETE /supplier-orders/:id
router.delete('/:id', requirePermission('warehouse', 'create'), async (req: Request, res: Response) => {
  try {
    const { error } = await supabase.from('supplier_orders').delete().eq('id', req.params.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// POST /supplier-orders/:id/items
router.post('/:id/items', requirePermission('warehouse', 'create'), async (req: Request, res: Response) => {
  try {
    const { item_name, quantity, unit_price } = req.body
    if (!item_name?.trim()) return res.status(400).json({ error: 'item_name required' })
    const { data, error } = await supabase
      .from('supplier_order_items')
      .insert({ order_id: req.params.id, item_name: item_name.trim(), quantity: quantity ?? 1, unit_price: unit_price ?? null })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

export default router
