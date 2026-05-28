import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireRole } from '../middleware/role.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'
import { logAction } from '../utils/logAction'

const router = Router()

// GET /subscriptions
router.get('/', async (req: Request, res: Response) => {
  try {
    const { branch_id } = req.user!
    const { client_id, status } = req.query

    let query = supabase
      .from('subscriptions')
      .select('*, clients(full_name, phone)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (branch_id) query = query.eq('branch_id', branch_id)
    if (client_id) query = query.eq('client_id', client_id as string)
    if (status)    query = query.eq('status', status as string)

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// GET /subscriptions/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const { data, error } = await supabase
      .from('subscriptions')
      .select('*, clients(full_name, phone)')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error) return res.status(404).json({ error: 'Subscription not found', code: 'NOT_FOUND' })
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /subscriptions
router.post('/', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    const {
      client_id, name,
      slot_1_type, slot_1_duration_min, slot_1_sessions_total,
      slot_2_type, slot_2_duration_min, slot_2_sessions_total,
      date_start, date_end, price,
    } = req.body

    if (!client_id || !name || !slot_1_type || !slot_1_duration_min || !slot_1_sessions_total || !date_start) {
      return res.status(400).json({
        error: 'client_id, name, slot_1_type, slot_1_duration_min, slot_1_sessions_total, date_start required',
        code: 'VALIDATION_ERROR',
      })
    }

    const payload: Record<string, unknown> = {
      client_id, branch_id: branchId, name,
      slot_1_type, slot_1_duration_min,
      slot_1_sessions_total, slot_1_sessions_left: slot_1_sessions_total,
      date_start, date_end: date_end ?? null,
      price: price ?? null,
      status: 'active',
    }

    if (slot_2_type) {
      payload.slot_2_type = slot_2_type
      payload.slot_2_duration_min = slot_2_duration_min ?? null
      payload.slot_2_sessions_total = slot_2_sessions_total ?? null
      payload.slot_2_sessions_left = slot_2_sessions_total ?? null
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .insert(payload)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// PATCH /subscriptions/:id
router.patch('/:id', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { status, date_end, slot_1_sessions_left, slot_2_sessions_left } = req.body

    const patch: Record<string, unknown> = {}
    if (status               !== undefined) patch.status               = status
    if (date_end             !== undefined) patch.date_end             = date_end
    if (slot_1_sessions_left !== undefined) patch.slot_1_sessions_left = slot_1_sessions_left
    if (slot_2_sessions_left !== undefined) patch.slot_2_sessions_left = slot_2_sessions_left

    const { data, error } = await supabase
      .from('subscriptions')
      .update(patch)
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// DELETE /subscriptions/:id — soft delete (developer, owner, franchisee)
router.delete('/:id', requireRole('owner', 'franchisee'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const { data: sub, error: subErr } = await supabase
      .from('subscriptions')
      .select('id, name, client_id, branch_id')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (subErr || !sub) {
      return res.status(404).json({ error: 'Subscription not found', code: 'NOT_FOUND' })
    }

    const now = new Date().toISOString()

    const { error } = await supabase
      .from('subscriptions')
      .update({ status: 'cancelled', deleted_at: now, deleted_by: req.user!.id })
      .eq('id', id)

    if (error) return res.status(500).json({ error: error.message })

    // audit log with client_id as entity_id for client history tab
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', req.user!.id).single()
    await logAction({
      branch_id:   sub.branch_id,
      entity_type: 'subscription',
      entity_id:   sub.client_id,
      action:      'delete_subscription',
      actor_id:    req.user!.id,
      actor_name:  profile?.full_name ?? req.user!.email,
      details:     { subscription_id: id, subscription_name: sub.name },
    })

    return res.status(204).send()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

export default router
