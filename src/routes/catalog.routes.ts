import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireRole } from '../middleware/role.middleware'

const router = Router()

// GET /catalog — все позиции каталога (глобальный)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('catalog_items')
      .select('*')
      .order('name')
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data || [])
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /catalog — только developer/owner
router.post('/', requireRole('owner'), async (req: Request, res: Response) => {
  try {
    const { name, sku, category, unit, description, price } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name required', code: 'VALIDATION_ERROR' })
    const { data, error } = await supabase
      .from('catalog_items')
      .insert({
        name:        name.trim(),
        sku:         sku?.trim() || null,
        category:    category || 'other',
        unit:        unit?.trim() || null,
        description: description?.trim() || null,
        price:       price ?? null,
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

// PATCH /catalog/:id — только developer/owner
router.patch('/:id', requireRole('owner'), async (req: Request, res: Response) => {
  try {
    const allowed = ['name', 'sku', 'category', 'unit', 'description', 'price']
    const patch: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in req.body) patch[key] = req.body[key]
    }
    const { data, error } = await supabase
      .from('catalog_items')
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

// DELETE /catalog/:id — только developer/owner
router.delete('/:id', requireRole('owner'), async (req: Request, res: Response) => {
  try {
    const { error } = await supabase.from('catalog_items').delete().eq('id', req.params.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

export default router
