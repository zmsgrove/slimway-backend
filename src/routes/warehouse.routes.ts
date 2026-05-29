import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireRole } from '../middleware/role.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /warehouse/export — должен быть ДО /:id
router.get('/export', async (req: Request, res: Response) => {
  try {
    const branchId = (req.query.branch_id as string) || await resolveBranchId(req.user!)
    const { from, to } = req.query
    let query = supabase
      .from('warehouse_movements')
      .select(`*, warehouse_items(name, category)`)
      .order('created_at', { ascending: false })
    if (branchId) query = query.eq('branch_id', branchId)
    if (from) query = query.gte('created_at', from as string)
    if (to)   query = query.lte('created_at', to as string)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// GET /warehouse
router.get('/', async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    let query = supabase
      .from('warehouse_items')
      .select('*, catalog_items(name, category, unit, sku)')
      .order('name')
    if (branchId) query = query.eq('branch_id', branchId)
    query = query.is('deleted_at', null)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    const withLowStock = (data || []).map((item: Record<string, unknown>) => ({
      ...item,
      low_stock: item.min_quantity != null && (item.quantity as number) <= (item.min_quantity as number),
    }))
    return res.json(withLowStock)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /warehouse — только developer/owner
router.post('/', requireRole('owner'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch', code: 'NO_BRANCH' })
    const { name, sku, category, unit, quantity, min_quantity, price } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name required', code: 'VALIDATION_ERROR' })
    const { data, error } = await supabase
      .from('warehouse_items')
      .insert({
        branch_id:    branchId,
        name:         name.trim(),
        sku:          sku?.trim() || null,
        category:     category || 'other',
        unit:         unit?.trim() || null,
        quantity:     quantity ?? 0,
        min_quantity: min_quantity ?? null,
        price:        price ?? null,
      })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /warehouse/intake — приход из каталога, auto-create warehouse_item если нет
router.post('/intake', requireRole('owner', 'franchisee'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch', code: 'NO_BRANCH' })
    const { catalog_item_id, quantity, notes, supplier } = req.body
    if (!catalog_item_id) return res.status(400).json({ error: 'catalog_item_id required' })
    if (!quantity || quantity <= 0) return res.status(400).json({ error: 'quantity must be positive' })

    const { data: catalogItem, error: catErr } = await supabase
      .from('catalog_items')
      .select('*')
      .eq('id', catalog_item_id)
      .single()
    if (catErr || !catalogItem) return res.status(404).json({ error: 'Catalog item not found' })

    // Find or create warehouse_item
    const { data: existing } = await supabase
      .from('warehouse_items')
      .select('id, quantity')
      .eq('branch_id', branchId)
      .eq('catalog_item_id', catalog_item_id)
      .single()

    let warehouseItemId: string
    if (existing) {
      warehouseItemId = existing.id as string
      await supabase
        .from('warehouse_items')
        .update({ quantity: (existing.quantity as number) + quantity })
        .eq('id', warehouseItemId)
    } else {
      const { data: newItem, error: createErr } = await supabase
        .from('warehouse_items')
        .insert({
          branch_id:       branchId,
          catalog_item_id: catalog_item_id,
          name:            catalogItem.name,
          sku:             catalogItem.sku ?? null,
          category:        catalogItem.category ?? 'other',
          unit:            catalogItem.unit ?? null,
          quantity,
          price:           catalogItem.price ?? null,
        })
        .select('id')
        .single()
      if (createErr || !newItem) return res.status(500).json({ error: createErr?.message ?? 'Failed to create item' })
      warehouseItemId = newItem.id as string
    }

    const { data: movement, error: mvErr } = await supabase
      .from('warehouse_movements')
      .insert({
        item_id:    warehouseItemId,
        branch_id:  branchId,
        type:       'in',
        quantity,
        notes:      notes || null,
        supplier:   supplier || null,
        created_by: req.user!.id,
      })
      .select()
      .single()
    if (mvErr) return res.status(500).json({ error: mvErr.message })
    return res.status(201).json(movement)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// GET /warehouse/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('warehouse_items')
      .select('*')
      .eq('id', req.params.id)
      .single()
    if (error || !data) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' })
    return res.json({
      ...data,
      low_stock: data.min_quantity != null && data.quantity <= data.min_quantity,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// PATCH /warehouse/:id — только developer/owner
router.patch('/:id', requireRole('owner'), async (req: Request, res: Response) => {
  try {
    const allowed = ['name', 'sku', 'category', 'unit', 'quantity', 'min_quantity', 'price']
    const patch: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in req.body) patch[key] = req.body[key]
    }
    const { data, error } = await supabase
      .from('warehouse_items')
      .update(patch)
      .eq('id', req.params.id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// DELETE /warehouse/:id — soft delete
router.delete('/:id', requireRole('owner'), async (req: Request, res: Response) => {
  try {
    const { error } = await supabase
      .from('warehouse_items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /warehouse/:id/movement — developer/owner/franchisee
router.post('/:id/movement', requireRole('owner', 'franchisee'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch', code: 'NO_BRANCH' })
    const { type, quantity, notes } = req.body
    if (!type || !['in', 'out'].includes(type)) return res.status(400).json({ error: 'type must be in|out' })
    if (!quantity || quantity <= 0) return res.status(400).json({ error: 'quantity must be positive' })

    const { data: item, error: itemErr } = await supabase
      .from('warehouse_items')
      .select('quantity')
      .eq('id', req.params.id)
      .single()
    if (itemErr || !item) return res.status(404).json({ error: 'Item not found' })

    const newQty = type === 'in'
      ? (item.quantity as number) + quantity
      : (item.quantity as number) - quantity
    if (newQty < 0) return res.status(400).json({ error: 'Insufficient quantity', code: 'INSUFFICIENT_QTY' })

    const [moveResult] = await Promise.all([
      supabase
        .from('warehouse_movements')
        .insert({
          item_id:    req.params.id,
          branch_id:  branchId,
          type,
          quantity,
          notes:      notes || null,
          created_by: req.user!.id,
        })
        .select()
        .single(),
      supabase
        .from('warehouse_items')
        .update({ quantity: newQty })
        .eq('id', req.params.id),
    ])

    if (moveResult.error) return res.status(500).json({ error: moveResult.error.message })
    return res.status(201).json(moveResult.data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// GET /warehouse/:id/movements
router.get('/:id/movements', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('warehouse_movements')
      .select('*')
      .eq('item_id', req.params.id)
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

export default router
