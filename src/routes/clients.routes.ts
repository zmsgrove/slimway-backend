import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { supabase } from '../config/supabase'
import { requirePermission } from '../middleware/permission.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /clients
router.get('/', requirePermission('clients', 'view'), async (req: Request, res: Response) => {
  const { branch_id } = req.user!
  const { search, from, to } = req.query

  let query = supabase
    .from('clients')
    .select('*, memberships(id, status, end_date, used_sessions, total_sessions)')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })

  if (branch_id) query = query.eq('branch_id', branch_id)
  if (search) query = query.ilike('full_name', `%${search}%`)
  if (from) query = query.gte('created_at', `${from as string}T00:00:00`)
  if (to)   query = query.lte('created_at', `${to as string}T23:59:59`)

  const { data, error } = await query

  if (error) {
    console.error('Supabase error:', error)
    return res.status(500).json({ error: error.message, details: error })
  }
  return res.json(data)
})

// GET /clients/:id — full detail with history
router.get('/:id', requirePermission('clients', 'view'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { branch_id } = req.user!

    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .eq('is_deleted', false)
      .single()

    if (error || !client) return res.status(404).json({ error: 'Client not found', code: 'NOT_FOUND' })
    if (branch_id && client.branch_id !== branch_id) {
      return res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' })
    }

    const [membershipsRes, bookingsRes, subsRes, leadsRes] = await Promise.all([
      supabase.from('memberships').select('id, status, end_date, used_sessions, total_sessions').eq('client_id', id),
      supabase.from('bookings_v2').select('*').eq('client_id', id).order('date', { ascending: false }).limit(100),
      supabase.from('subscriptions').select('*').eq('client_id', id).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('leads').select('id').eq('client_id', id),
    ])

    // Enrich bookings with slot + device info
    const bookings = (bookingsRes.data ?? []) as Record<string, unknown>[]
    const slotIds = bookings.map(b => b.slot_1_schedule_slot_id as string).filter(Boolean)
    let slotsMap: Record<string, Record<string, unknown>> = {}
    if (slotIds.length > 0) {
      const { data: slotsData } = await supabase
        .from('schedule_slots')
        .select('id, date, time_start, time_end, device_id')
        .in('id', slotIds)
      const slots = (slotsData ?? []) as Record<string, unknown>[]
      const deviceIds = slots.map(s => s.device_id as string).filter(Boolean)
      let devicesMap: Record<string, Record<string, unknown>> = {}
      if (deviceIds.length > 0) {
        const { data: devicesData } = await supabase
          .from('devices').select('id, type, number').in('id', deviceIds)
        devicesMap = Object.fromEntries(((devicesData ?? []) as Record<string, unknown>[]).map(d => [d.id as string, d]))
      }
      slotsMap = Object.fromEntries(slots.map(s => [s.id as string, { ...s, device: devicesMap[s.device_id as string] ?? null }]))
    }
    const bookingsWithSlots = bookings.map(b => ({
      ...b,
      slot: slotsMap[b.slot_1_schedule_slot_id as string] ?? null,
    }))

    // Lead comments
    const leadIds = ((leadsRes.data ?? []) as Record<string, unknown>[]).map(l => l.id as string)
    let leadComments: Record<string, unknown>[] = []
    if (leadIds.length > 0) {
      const { data: commentsData } = await supabase
        .from('lead_comments')
        .select('id, lead_id, author_id, text, created_at, profiles(full_name)')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false })
      leadComments = (commentsData ?? []) as Record<string, unknown>[]
    }

    return res.json({
      ...client,
      memberships:  membershipsRes.data ?? [],
      bookings:     bookingsWithSlots,
      subscriptions: subsRes.data ?? [],
      lead_comments: leadComments,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /clients
router.post('/', requirePermission('clients', 'create'), async (req: Request, res: Response) => {
  const branchId = await resolveBranchId(req.user!)
  const { full_name, phone, email, birth_date, notes, source, tags } = req.body

  if (!full_name) return res.status(400).json({ error: 'full_name is required', code: 'VALIDATION_ERROR' })

  const { data, error } = await supabase
    .from('clients')
    .insert({ full_name, phone, email, birth_date, notes, source: source || null, tags: tags || null, branch_id: branchId })
    .select()
    .single()

  if (error) {
    console.error('Supabase error:', error)
    return res.status(500).json({ error: error.message, details: error })
  }
  return res.status(201).json(data)
})

// PATCH /clients/:id
router.patch('/:id', requirePermission('clients', 'edit'), async (req: Request, res: Response) => {
  const { id } = req.params
  const { full_name, phone, email, birth_date, notes, status, tags, source, avatar_url } = req.body

  const patch: Record<string, unknown> = {}
  if (full_name  !== undefined) patch.full_name  = full_name
  if (phone      !== undefined) patch.phone      = phone
  if (email      !== undefined) patch.email      = email
  if (birth_date !== undefined) patch.birth_date = birth_date
  if (notes      !== undefined) patch.notes      = notes
  if (status     !== undefined) patch.status     = status
  if (tags       !== undefined) patch.tags       = tags
  if (source     !== undefined) patch.source     = source
  if (avatar_url !== undefined) patch.avatar_url = avatar_url

  const { data, error } = await supabase
    .from('clients')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Supabase error:', error)
    return res.status(500).json({ error: error.message, details: error })
  }
  return res.json(data)
})

// DELETE /clients/:id — soft delete
router.delete('/:id', requirePermission('clients', 'delete'), async (req: Request, res: Response) => {
  const { id } = req.params

  const { error } = await supabase
    .from('clients')
    .update({ is_deleted: true })
    .eq('id', id)

  if (error) {
    console.error('Supabase error:', error)
    return res.status(500).json({ error: error.message, details: error })
  }
  return res.status(204).send()
})

// POST /clients/:id/freeze
router.post('/:id/freeze', requirePermission('clients', 'edit'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { freeze_until } = req.body as { freeze_until?: string }
    if (!freeze_until) return res.status(400).json({ error: 'freeze_until required', code: 'VALIDATION_ERROR' })

    const { data, error } = await supabase
      .from('clients')
      .update({ status: 'frozen', freeze_until })
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// POST /clients/:id/unfreeze
router.post('/:id/unfreeze', requirePermission('clients', 'edit'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const { data, error } = await supabase
      .from('clients')
      .update({ status: null, freeze_until: null })
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// POST /clients/:id/portal-token — generate/return client portal token
router.post('/:id/portal-token', requirePermission('clients', 'view'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const branchId = await resolveBranchId(req.user!)

    const { data: client } = await supabase.from('clients').select('id, branch_id').eq('id', id).single()
    if (!client) return res.status(404).json({ error: 'Client not found', code: 'NOT_FOUND' })
    if (branchId && client.branch_id !== branchId) return res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' })

    const existing = await supabase
      .from('client_tokens')
      .select('token, expires_at')
      .eq('client_id', id)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing.data?.token) {
      return res.json({ token: existing.data.token })
    }

    const token = randomUUID()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await supabase.from('client_tokens').insert({
      client_id: id,
      branch_id: branchId,
      token,
      expires_at: expiresAt,
    })
    if (error) {
      console.error('[portal-token]', error)
      return res.status(500).json({ error: error.message })
    }
    const portalUrl = `${process.env.FRONTEND_URL || 'https://slimway-frontend.onrender.com'}/client/${token}`
    return res.json({ token, url: portalUrl })
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

export default router
