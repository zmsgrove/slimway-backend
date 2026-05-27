import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireRole } from '../middleware/role.middleware'

const router = Router()

// GET /subscription-templates — шаблоны абонементов филиала
router.get('/', async (req: Request, res: Response) => {
  const { branch_id } = req.user!

  let query = supabase
    .from('subscription_templates')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (branch_id) query = query.eq('branch_id', branch_id)

  const { data, error } = await query
  if (error) {
    console.error('Supabase error:', error)
    return res.status(500).json({ error: error.message, details: error })
  }
  return res.json(data)
})

// POST /subscription-templates — создать шаблон
router.post('/', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const { branch_id } = req.user!
  const {
    name,
    slot_1_type, slot_1_duration_min, slot_1_sessions_total,
    slot_2_type, slot_2_duration_min, slot_2_sessions_total,
    validity_days, price,
  } = req.body

  if (!name || !slot_1_type || !slot_1_duration_min || !slot_1_sessions_total) {
    return res.status(400).json({ error: 'name, slot_1_type, slot_1_duration_min, slot_1_sessions_total required', code: 'VALIDATION_ERROR' })
  }

  const payload: Record<string, unknown> = {
    branch_id,
    name,
    slot_1_type,
    slot_1_duration_min,
    slot_1_sessions_total,
    validity_days: validity_days ?? 30,
    price: price ?? null,
    is_active: true,
  }
  if (slot_2_type) {
    payload.slot_2_type = slot_2_type
    payload.slot_2_duration_min = slot_2_duration_min ?? null
    payload.slot_2_sessions_total = slot_2_sessions_total ?? null
  }

  const { data, error } = await supabase.from('subscription_templates').insert(payload).select().single()
  if (error) {
    console.error('Supabase error:', error)
    return res.status(500).json({ error: error.message, details: error })
  }
  return res.status(201).json(data)
})

// PATCH /subscription-templates/:id
router.patch('/:id', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const { id } = req.params
  const { name, validity_days, price, is_active } = req.body

  const patch: Record<string, unknown> = {}
  if (name !== undefined)          patch.name = name
  if (validity_days !== undefined) patch.validity_days = validity_days
  if (price !== undefined)         patch.price = price
  if (is_active !== undefined)     patch.is_active = is_active

  const { data, error } = await supabase.from('subscription_templates').update(patch).eq('id', id).select().single()
  if (error) {
    console.error('Supabase error:', error)
    return res.status(500).json({ error: error.message, details: error })
  }
  return res.json(data)
})

// DELETE /subscription-templates/:id — soft delete (deactivate)
router.delete('/:id', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const { id } = req.params
  const { error } = await supabase.from('subscription_templates').update({ is_active: false }).eq('id', id)
  if (error) {
    console.error('Supabase error:', error)
    return res.status(500).json({ error: error.message, details: error })
  }
  return res.status(204).send()
})

export default router
