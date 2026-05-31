import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireRole } from '../middleware/role.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /schedule-slots?date=YYYY-MM-DD
router.get('/', async (req: Request, res: Response) => {
  const { branch_id } = req.user!
  const { date, device_id } = req.query

  let query = supabase
    .from('schedule_slots')
    .select('*, devices(id, type, number, device_group, status)')
    .order('time_start', { ascending: true })

  if (branch_id)  query = query.eq('branch_id', branch_id)
  if (date)       query = query.eq('date', date as string)
  if (device_id)  query = query.eq('device_id', device_id as string)

  const { data: slots, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  // booking_id has no FK constraint, so join attended status manually
  const bookingIds = (slots ?? [])
    .map((s: { booking_id: string | null }) => s.booking_id)
    .filter(Boolean) as string[]

  if (bookingIds.length > 0) {
    const { data: bookings } = await supabase
      .from('bookings_v2')
      .select('id, attended')
      .in('id', bookingIds)

    if (bookings) {
      const attendedMap = new Map(bookings.map((b: { id: string; attended: boolean | null }) => [b.id, b.attended]))
      for (const slot of slots ?? []) {
        if (slot.booking_id) {
          slot.bookings_v2 = { attended: attendedMap.get(slot.booking_id) ?? null }
        }
      }
    }
  }

  return res.json(slots)
})

// POST /schedule-slots/bulk — массовое создание ячеек (upsert, пропускает дубли)
router.post('/bulk', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const branchId = await resolveBranchId(req.user!)
  const { slots } = req.body as {
    slots?: Array<{ device_id: string; date: string; time_start: string; time_end: string; branch_id?: string; status?: string }>
  }

  if (!Array.isArray(slots) || slots.length === 0) {
    return res.status(400).json({ error: 'slots array required', code: 'VALIDATION_ERROR' })
  }

  const rows = slots.map(s => ({
    branch_id: s.branch_id || branchId,
    device_id: s.device_id,
    date:       s.date,
    time_start: s.time_start,
    time_end:   s.time_end,
    status:     s.status === 'blocked' ? 'blocked' : 'free',
  }))

  // Upsert: on conflict (device_id, date, time_start) — skip
  const { data, error } = await supabase
    .from('schedule_slots')
    .upsert(rows, { onConflict: 'device_id,date,time_start', ignoreDuplicates: true })
    .select('id')

  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json({ created: (data ?? []).length })
})

// POST /schedule-slots — создать ячейку
router.post('/', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const branchId = await resolveBranchId(req.user!)
  const { device_id, date, time_start, time_end, status } = req.body

  if (!device_id || !date || !time_start || !time_end) {
    return res.status(400).json({
      error: 'device_id, date, time_start, time_end required',
      code: 'VALIDATION_ERROR',
    })
  }

  const { data, error } = await supabase
    .from('schedule_slots')
    .insert({ branch_id: branchId, device_id, date, time_start, time_end, status: status ?? 'free' })
    .select('*, devices(id, type, number, device_group, status)')
    .single()

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Slot already exists for this device/date/time', code: 'SLOT_EXISTS' })
    }
    return res.status(500).json({ error: error.message })
  }
  return res.status(201).json(data)
})

// PATCH /schedule-slots/:id — обновить статус ячейки
router.patch('/:id', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const { id } = req.params
  const { status } = req.body

  const { data, error } = await supabase
    .from('schedule_slots')
    .update({ status })
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// DELETE /schedule-slots/:id — удалить ячейку (только если free)
router.delete('/:id', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const { id } = req.params

  const { data: slot } = await supabase
    .from('schedule_slots')
    .select('status')
    .eq('id', id)
    .single()

  if (slot && slot.status !== 'free') {
    return res.status(409).json({ error: 'Cannot delete a non-free slot', code: 'SLOT_NOT_FREE' })
  }

  const { error } = await supabase.from('schedule_slots').delete().eq('id', id)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(204).send()
})

// GET /schedule-slots/waitlist?date=
router.get('/waitlist', async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    const { date, device_type } = req.query
    let query = supabase
      .from('slot_waitlist')
      .select('*, clients(id, full_name, phone)')
      .order('created_at', { ascending: true })
    if (branchId) query = query.eq('branch_id', branchId)
    if (date) query = query.eq('date', date as string)
    if (device_type) query = query.eq('device_type', device_type as string)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data ?? [])
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// POST /schedule-slots/waitlist
router.post('/waitlist', async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch' })
    const { client_id, device_type, date, time_start, notes } = req.body as Record<string, string>
    if (!client_id || !device_type || !date) return res.status(400).json({ error: 'client_id, device_type, date required' })
    const { data, error } = await supabase
      .from('slot_waitlist')
      .insert({ branch_id: branchId, client_id, device_type, date, time_start: time_start ?? null, notes: notes ?? null })
      .select('*, clients(id, full_name, phone)')
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// DELETE /schedule-slots/waitlist/:id
router.delete('/waitlist/:id', async (req: Request, res: Response) => {
  try {
    const { error } = await supabase.from('slot_waitlist').delete().eq('id', req.params.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

export default router
