import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requirePermission } from '../middleware/permission.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /subscription-templates
// developer/owner → all global templates (not deleted)
// franchisee/staff → only templates connected to their branch (not deleted)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { role } = req.user!
    const branchId = await resolveBranchId(req.user!)

    if (role === 'developer' || role === 'owner') {
      const { data, error } = await supabase
        .from('subscription_templates')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) return res.status(500).json({ error: error.message })
      return res.json(data)
    }

    // franchisee/staff — only branch-connected templates
    if (!branchId) return res.json([])
    const { data, error } = await supabase
      .from('branch_subscription_templates')
      .select('subscription_templates(*)')
      .eq('branch_id', branchId)
    if (error) return res.status(500).json({ error: error.message })
    const templates = (data || [])
      .map((r: Record<string, unknown>) => r.subscription_templates)
      .filter((t: unknown) => {
        if (!t || typeof t !== 'object') return false
        return (t as Record<string, unknown>).deleted_at == null
      })
    return res.json(templates)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /subscription-templates — only developer/owner, creates global template (branch_id = null)
router.post('/', requirePermission('subscriptions', 'create'), async (req: Request, res: Response) => {
  try {
    const {
      name,
      slot_1_type, slot_1_duration_min, slot_1_sessions_total,
      slot_2_type, slot_2_duration_min, slot_2_sessions_total,
      slot_3_type, slot_3_duration_min, slot_3_sessions_total,
      slot_4_type, slot_4_duration_min, slot_4_sessions_total,
      validity_days, price, is_trial, finish_slot,
    } = req.body

    if (!name?.trim() || !slot_1_type || !slot_1_duration_min || !slot_1_sessions_total) {
      return res.status(400).json({ error: 'name, slot_1_type, slot_1_duration_min, slot_1_sessions_total required', code: 'VALIDATION_ERROR' })
    }

    const payload: Record<string, unknown> = {
      branch_id:             null,
      name:                  name.trim(),
      slot_1_type,
      slot_1_duration_min,
      slot_1_sessions_total,
      validity_days:         validity_days ?? 30,
      price:                 price ?? null,
      is_active:             true,
      is_trial:              is_trial ?? false,
      finish_slot:           finish_slot ?? null,
    }
    if (slot_2_type) {
      payload.slot_2_type            = slot_2_type
      payload.slot_2_duration_min    = slot_2_duration_min ?? null
      payload.slot_2_sessions_total  = slot_2_sessions_total ?? null
    }
    if (slot_3_type) {
      payload.slot_3_type            = slot_3_type
      payload.slot_3_duration_min    = slot_3_duration_min ?? null
      payload.slot_3_sessions_total  = slot_3_sessions_total ?? null
    }
    if (slot_4_type) {
      payload.slot_4_type            = slot_4_type
      payload.slot_4_duration_min    = slot_4_duration_min ?? null
      payload.slot_4_sessions_total  = slot_4_sessions_total ?? null
    }

    const { data, error } = await supabase.from('subscription_templates').insert(payload).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// PATCH /subscription-templates/:id
router.patch('/:id', requirePermission('subscriptions', 'edit'), async (req: Request, res: Response) => {
  try {
    const { name, validity_days, price, is_active, is_trial, finish_slot,
            slot_1_type, slot_1_duration_min, slot_1_sessions_total,
            slot_2_type, slot_2_duration_min, slot_2_sessions_total,
            slot_3_type, slot_3_duration_min, slot_3_sessions_total,
            slot_4_type, slot_4_duration_min, slot_4_sessions_total } = req.body
    const patch: Record<string, unknown> = {}
    if (name          !== undefined) patch.name          = name
    if (validity_days !== undefined) patch.validity_days = validity_days
    if (price         !== undefined) patch.price         = price
    if (is_active     !== undefined) patch.is_active     = is_active
    if (is_trial      !== undefined) patch.is_trial      = is_trial
    if (finish_slot   !== undefined) patch.finish_slot   = finish_slot
    if (slot_1_type   !== undefined) patch.slot_1_type   = slot_1_type
    if (slot_1_duration_min   !== undefined) patch.slot_1_duration_min   = slot_1_duration_min
    if (slot_1_sessions_total !== undefined) patch.slot_1_sessions_total = slot_1_sessions_total
    if (slot_2_type   !== undefined) patch.slot_2_type   = slot_2_type
    if (slot_2_duration_min   !== undefined) patch.slot_2_duration_min   = slot_2_duration_min
    if (slot_2_sessions_total !== undefined) patch.slot_2_sessions_total = slot_2_sessions_total
    if (slot_3_type   !== undefined) patch.slot_3_type   = slot_3_type
    if (slot_3_duration_min   !== undefined) patch.slot_3_duration_min   = slot_3_duration_min
    if (slot_3_sessions_total !== undefined) patch.slot_3_sessions_total = slot_3_sessions_total
    if (slot_4_type   !== undefined) patch.slot_4_type   = slot_4_type
    if (slot_4_duration_min   !== undefined) patch.slot_4_duration_min   = slot_4_duration_min
    if (slot_4_sessions_total !== undefined) patch.slot_4_sessions_total = slot_4_sessions_total

    const { data, error } = await supabase.from('subscription_templates').update(patch).eq('id', req.params.id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// DELETE /subscription-templates/:id (soft delete via deleted_at)
router.delete('/:id', requirePermission('subscriptions', 'delete'), async (req: Request, res: Response) => {
  try {
    const { error } = await supabase
      .from('subscription_templates')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

export default router
