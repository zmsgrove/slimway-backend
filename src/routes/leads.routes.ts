import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { resolveBranchId } from '../utils/resolveBranchId'
import { logAction } from '../utils/logAction'

const router = Router()

// GET /leads — список лидов филиала
router.get('/', async (req: Request, res: Response) => {
  try {
    const { branch_id } = req.user!
    const { status, archived } = req.query

    let query = supabase
      .from('leads')
      .select('*, lead_comments(id)')
      .order('created_at', { ascending: false })

    if (branch_id) query = query.eq('branch_id', branch_id)

    if (archived === 'true') {
      query = query.not('archived_at', 'is', null)
    } else {
      query = query.is('archived_at', null)
    }

    if (status) query = query.eq('status', status as string)

    const { data, error } = await query
    if (error) {
      console.error('[leads GET /]', error)
      return res.status(500).json({ error: error.message, code: error.code })
    }
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /leads — создать лид
router.post('/', async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    const { full_name, phone, source, notes, assigned_to } = req.body

    if (!full_name) {
      return res.status(400).json({ error: 'full_name required', code: 'VALIDATION_ERROR' })
    }
    if (!branchId) {
      return res.status(400).json({ error: 'No branch resolved. Pass ?branch_id= for developer/owner.', code: 'NO_BRANCH' })
    }

    const { data, error } = await supabase
      .from('leads')
      .insert({
        branch_id: branchId,
        full_name,
        phone: phone || null,
        source: source || 'manual',
        notes: notes || null,
        assigned_to: assigned_to || null,
        created_by: req.user!.id,
        status: 'new',
      })
      .select()
      .single()

    if (error) {
      console.error('[leads POST /]', error)
      return res.status(500).json({ error: error.message, code: error.code })
    }
    return res.status(201).json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// GET /leads/:id — один лид с комментариями
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params

  const { data, error } = await supabase
    .from('leads')
    .select('*, lead_comments(*, profiles(full_name))')
    .eq('id', id)
    .single()

  if (error) return res.status(404).json({ error: 'Lead not found' })
  return res.json(data)
})

// PATCH /leads/:id — обновить лид
router.patch('/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const { full_name, phone, source, notes, assigned_to, status, client_id } = req.body

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (full_name   !== undefined) updates.full_name   = full_name
  if (phone       !== undefined) updates.phone       = phone
  if (source      !== undefined) updates.source      = source
  if (notes       !== undefined) updates.notes       = notes
  if (assigned_to !== undefined) updates.assigned_to = assigned_to
  if (status      !== undefined) updates.status      = status
  if (client_id   !== undefined) updates.client_id   = client_id

  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// PATCH /leads/:id/status — сменить статус
router.patch('/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params
  const { status } = req.body

  if (!status) {
    return res.status(400).json({ error: 'status required', code: 'VALIDATION_ERROR' })
  }

  // Load lead first
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (leadErr || !lead) return res.status(404).json({ error: 'Lead not found' })

  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  let newClientId: string | null = null

  // success + no client yet → create draft client
  if (status === 'success' && !lead.client_id) {
    const { data: newClient, error: clientErr } = await supabase
      .from('clients')
      .insert({
        branch_id: lead.branch_id,
        full_name: lead.full_name,
        phone:     lead.phone ?? null,
        status:    'draft',
      })
      .select('id')
      .single()

    if (!clientErr && newClient) {
      newClientId = newClient.id
      updates.client_id = newClientId
    }
  }

  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // audit log
  if (newClientId) {
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', req.user!.id).single()
    await logAction({
      branch_id:   lead.branch_id,
      entity_type: 'client',
      entity_id:   newClientId,
      action:      'create_from_lead',
      actor_id:    req.user!.id,
      actor_name:  profile?.full_name ?? req.user!.email,
      details:     { lead_id: id, lead_name: lead.full_name },
    })
  }

  return res.json({ ...data, client_id: newClientId ?? data.client_id })
})

// DELETE /leads/:id — удалить лид
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params

  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(204).send()
})

// POST /leads/:id/comments — добавить комментарий
router.post('/:id/comments', async (req: Request, res: Response) => {
  const { id } = req.params
  const { text } = req.body

  if (!text?.trim()) {
    return res.status(400).json({ error: 'text required', code: 'VALIDATION_ERROR' })
  }

  const { data, error } = await supabase
    .from('lead_comments')
    .insert({
      lead_id:   id,
      author_id: req.user!.id,
      text:      text.trim(),
    })
    .select('*, profiles(full_name)')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
})

export default router
