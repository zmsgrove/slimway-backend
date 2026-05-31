import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requirePermission } from '../middleware/permission.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'
import { logAction } from '../utils/logAction'

const router = Router()

// GET /leads
router.get('/', requirePermission('leads', 'view'), async (req: Request, res: Response) => {
  try {
    const { branch_id } = req.user!
    const { status, archived, from, to } = req.query

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
    if (from) query = query.gte('created_at', `${from as string}T00:00:00`)
    if (to)   query = query.lte('created_at', `${to as string}T23:59:59`)

    const { data, error } = await query
    if (error) {
      console.error('[leads GET /]', error)
      return res.status(500).json({ error: error.message, code: error.code })
    }

    // Enrich with assignee profile names (assigned_to stores profile_id)
    const profileIds = [...new Set(data.filter(l => l.assigned_to).map(l => l.assigned_to as string))]
    let profileMap: Record<string, string> = {}
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', profileIds)
      if (profiles) {
        for (const p of profiles) profileMap[p.id] = p.full_name
      }
    }
    const enriched = data.map(l => ({
      ...l,
      assigned_profile: l.assigned_to ? { full_name: profileMap[l.assigned_to] ?? null } : null,
    }))
    return res.json(enriched)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /leads
router.post('/', requirePermission('leads', 'create'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    const { full_name, phone, source, notes, assigned_to, desired_template_id } = req.body

    if (!full_name) {
      return res.status(400).json({ error: 'full_name required', code: 'VALIDATION_ERROR' })
    }
    if (!branchId) {
      return res.status(400).json({ error: 'No branch resolved. Pass ?branch_id= for developer/owner.', code: 'NO_BRANCH' })
    }

    const assignedTo = (typeof assigned_to === 'string' ? assigned_to.trim() : '') || null

    let resolvedAssignedTo: string | null = null
    if (assignedTo) {
      const { data: emp } = await supabase
        .from('employees')
        .select('profile_id')
        .eq('id', assignedTo)
        .single()
      resolvedAssignedTo = (emp?.profile_id as string | null) ?? null
    }

    const { data, error } = await supabase
      .from('leads')
      .insert({
        branch_id: branchId,
        full_name,
        phone: phone || null,
        source: source || 'manual',
        notes: notes || null,
        assigned_to: resolvedAssignedTo,
        created_by: req.user!.id,
        status: 'new',
        desired_template_id: desired_template_id || null,
        status_changed_at: new Date().toISOString(),
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

// GET /leads/:id
router.get('/:id', requirePermission('leads', 'view'), async (req: Request, res: Response) => {
  const { id } = req.params

  const { data, error } = await supabase
    .from('leads')
    .select('*, lead_comments(*, profiles(full_name))')
    .eq('id', id)
    .single()

  if (error) return res.status(404).json({ error: 'Lead not found' })

  // Enrich with assignee profile name (assigned_to stores profile_id)
  let assignedProfile: { full_name: string } | null = null
  if (data.assigned_to) {
    const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', data.assigned_to).single()
    if (prof) assignedProfile = { full_name: prof.full_name }
  }

  return res.json({ ...data, assigned_profile: assignedProfile })
})

// PATCH /leads/:id
router.patch('/:id', requirePermission('leads', 'edit'), async (req: Request, res: Response) => {
  const { id } = req.params
  const { full_name, phone, source, notes, assigned_to, status, client_id, desired_template_id, fail_reason } = req.body

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (full_name           !== undefined) updates.full_name           = full_name
  if (phone               !== undefined) updates.phone               = phone
  if (source              !== undefined) updates.source              = source
  if (notes               !== undefined) updates.notes               = notes
  if (desired_template_id !== undefined) updates.desired_template_id = desired_template_id
  if (fail_reason         !== undefined) updates.fail_reason         = fail_reason
  if (assigned_to !== undefined) {
    if (assigned_to) {
      const { data: emp } = await supabase
        .from('employees')
        .select('profile_id')
        .eq('id', String(assigned_to).trim())
        .single()
      updates.assigned_to = (emp?.profile_id as string | null) ?? null
    } else {
      updates.assigned_to = null
    }
  }
  if (status    !== undefined) updates.status    = status
  if (client_id !== undefined) updates.client_id = client_id

  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// PATCH /leads/:id/status
router.patch('/:id/status', requirePermission('leads', 'edit'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { status, fail_reason } = req.body

    if (!status) {
      return res.status(400).json({ error: 'status required', code: 'VALIDATION_ERROR' })
    }

    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single()

    if (leadErr || !lead) return res.status(404).json({ error: 'Lead not found' })

    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString(), status_changed_at: new Date().toISOString() }
    if (status === 'fail' && fail_reason !== undefined) updates.fail_reason = fail_reason
    let newClientId: string | null = null
    let clientRecord: { id: string; full_name: string; phone: string | null } | null = null

    if (status === 'success' && !lead.client_id) {
      console.log('[leads PATCH status] status=success, attempting client auto-create for lead:', id, 'full_name:', lead.full_name, 'branch_id:', lead.branch_id)
      try {
        const insertPayload = {
          branch_id: lead.branch_id,
          full_name: lead.full_name,
          phone:     lead.phone ?? null,
          status:    'draft',
        }
        console.log('[leads PATCH status] clients INSERT payload:', insertPayload)

        const { data: newClient, error: clientErr } = await supabase
          .from('clients')
          .insert(insertPayload)
          .select('id, full_name, phone')
          .single()

        if (!clientErr && newClient) {
          console.log('[leads PATCH status] client created OK:', newClient.id, newClient.full_name)
          newClientId = newClient.id
          clientRecord = { id: newClient.id, full_name: newClient.full_name, phone: newClient.phone }
          updates.client_id = newClientId
        } else if (clientErr) {
          console.error('[leads PATCH status] client auto-create failed:', JSON.stringify(clientErr))
        }
      } catch (clientEx) {
        console.error('[leads PATCH status] client auto-create exception:', clientEx)
      }
    } else if (status === 'success' && lead.client_id) {
      console.log('[leads PATCH status] status=success, client already exists:', lead.client_id)
    }

    const { data, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[leads] status update failed:', error)
      return res.status(500).json({ error: error.message })
    }

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

    return res.json({ lead: { ...data, client_id: newClientId ?? data.client_id }, client: clientRecord })
  } catch (ex) {
    console.error('[leads] PATCH /:id/status unhandled exception:', ex)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /leads/:id
router.delete('/:id', requirePermission('leads', 'delete'), async (req: Request, res: Response) => {
  const { id } = req.params

  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(204).send()
})

// POST /leads/:id/comments
router.post('/:id/comments', requirePermission('leads', 'view'), async (req: Request, res: Response) => {
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
