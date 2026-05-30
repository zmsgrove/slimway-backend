import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireRole } from '../middleware/role.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'
import { logAction } from '../utils/logAction'

const router = Router()

// POST /bookings-v2
router.post('/', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const [branchId, created_by] = [await resolveBranchId(req.user!), req.user!.id]
  const { client_id, subscription_id, slot_1_schedule_slot_id, date } = req.body

  if (!client_id || !subscription_id || !slot_1_schedule_slot_id || !date) {
    return res.status(400).json({
      error: 'client_id, subscription_id, slot_1_schedule_slot_id, date required',
      code: 'VALIDATION_ERROR',
    })
  }

  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', subscription_id)
    .single()

  if (subErr || !sub) return res.status(404).json({ error: 'Subscription not found', code: 'NOT_FOUND' })
  if (sub.status !== 'active') return res.status(400).json({ error: 'Subscription is not active', code: 'SUB_INACTIVE' })
  if (sub.slot_1_sessions_left <= 0) return res.status(400).json({ error: 'No sessions left on slot 1', code: 'NO_SESSIONS' })

  const { data: slot1, error: slot1Err } = await supabase
    .from('schedule_slots')
    .select('*')
    .eq('id', slot_1_schedule_slot_id)
    .single()

  if (slot1Err || !slot1) return res.status(404).json({ error: 'Slot 1 not found', code: 'SLOT_NOT_FOUND' })
  if (slot1.status !== 'free') return res.status(409).json({ error: 'Slot 1 is not free', code: 'SLOT_BUSY', slot_status: slot1.status })

  let slot2Id: string | null = null

  if (sub.slot_2_type) {
    if ((sub.slot_2_sessions_left ?? 0) <= 0) {
      return res.status(400).json({ error: 'No sessions left on slot 2', code: 'NO_SESSIONS_SLOT2' })
    }

    const { data: devicesOfType } = await supabase
      .from('devices')
      .select('id')
      .eq('branch_id', branchId ?? sub.branch_id)
      .eq('type', sub.slot_2_type)
      .eq('status', 'active')

    const deviceIds = (devicesOfType ?? []).map((d: { id: string }) => d.id)

    if (deviceIds.length === 0) {
      return res.status(409).json({
        error: 'No devices of required type for slot 2',
        code: 'NO_DEVICE_TYPE',
        slot_2_type: sub.slot_2_type,
      })
    }

    const { data: freeSlot2 } = await supabase
      .from('schedule_slots')
      .select('*')
      .eq('date', date)
      .eq('time_start', slot1.time_end)
      .eq('status', 'free')
      .in('device_id', deviceIds)
      .order('time_start', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!freeSlot2) {
      const { data: nextAvailable } = await supabase
        .from('schedule_slots')
        .select('date, time_start')
        .gte('date', date)
        .eq('status', 'free')
        .in('device_id', deviceIds)
        .order('date', { ascending: true })
        .order('time_start', { ascending: true })
        .limit(1)
        .maybeSingle()

      return res.status(409).json({
        error: 'No free slot 2 available right after slot 1',
        code: 'NO_SLOT2',
        next_available: nextAvailable ?? null,
        slot_2_type: sub.slot_2_type,
        required_time: slot1.time_end,
      })
    }

    slot2Id = freeSlot2.id
  }

  const { data: booking, error: bookErr } = await supabase
    .from('bookings_v2')
    .insert({
      client_id,
      subscription_id,
      branch_id: branchId ?? sub.branch_id,
      date,
      slot_1_schedule_slot_id,
      slot_2_schedule_slot_id: slot2Id,
      created_by,
    })
    .select()
    .single()

  if (bookErr || !booking) {
    if (bookErr?.code === '23505') {
      return res.status(409).json({ error: 'Slot already booked (unique conflict)', code: 'SLOT_CONFLICT', detail: bookErr.details })
    }
    return res.status(500).json({ error: bookErr?.message ?? 'Booking failed', code: bookErr?.code })
  }

  await supabase.from('schedule_slots').update({ status: 'booked', booking_id: booking.id }).eq('id', slot_1_schedule_slot_id)
  if (slot2Id) {
    await supabase.from('schedule_slots').update({ status: 'booked', booking_id: booking.id }).eq('id', slot2Id)
  }

  await supabase.from('subscriptions').update({ slot_1_sessions_left: sub.slot_1_sessions_left - 1 }).eq('id', subscription_id)
  if (slot2Id && sub.slot_2_sessions_left !== null) {
    await supabase.from('subscriptions').update({ slot_2_sessions_left: (sub.slot_2_sessions_left ?? 1) - 1 }).eq('id', subscription_id)
  }

  return res.status(201).json(booking)
})

// GET /bookings-v2/:id
router.get('/:id', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const { data: booking, error: bookErr } = await supabase
      .from('bookings_v2')
      .select('*')
      .eq('id', id)
      .single()

    if (bookErr || !booking) return res.status(404).json({ error: 'Booking not found', code: 'NOT_FOUND' })

    const [{ data: client }, { data: sub }, { data: slot1 }] = await Promise.all([
      supabase.from('clients').select('id, full_name, phone').eq('id', booking.client_id).single(),
      supabase.from('subscriptions').select('id, name').eq('id', booking.subscription_id).single(),
      supabase.from('schedule_slots').select('*, devices(*)').eq('id', booking.slot_1_schedule_slot_id).single(),
    ])

    let slot2 = null
    if (booking.slot_2_schedule_slot_id) {
      const { data } = await supabase
        .from('schedule_slots')
        .select('*, devices(*)')
        .eq('id', booking.slot_2_schedule_slot_id)
        .single()
      slot2 = data
    }

    return res.json({ booking, client, subscription: sub, slot_1: slot1, slot_2: slot2 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// DELETE /bookings-v2/:id — отменить бронь
router.delete('/:id', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const { id } = req.params

  const { data: booking } = await supabase
    .from('bookings_v2')
    .select('*, schedule_slots!slot_1_schedule_slot_id(date, time_start)')
    .eq('id', id)
    .single()

  if (!booking) return res.status(404).json({ error: 'Booking not found', code: 'NOT_FOUND' })

  const slot = (booking as Record<string, unknown>).schedule_slots as { date: string; time_start: string } | null
  if (slot) {
    const slotDateTime = new Date(`${slot.date}T${slot.time_start}`)
    const diffMs = slotDateTime.getTime() - Date.now()
    if (diffMs < 24 * 60 * 60 * 1000) {
      const role = req.user!.role
      if (!['developer', 'owner', 'franchisee'].includes(role)) {
        return res.status(409).json({ error: 'Cannot cancel less than 24h before slot', code: 'TOO_LATE' })
      }
    }
  }

  await supabase.from('schedule_slots').update({ status: 'free', booking_id: null }).eq('booking_id', id)

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('slot_1_sessions_left, slot_2_sessions_left, slot_2_type')
    .eq('id', booking.subscription_id)
    .single()

  if (sub) {
    const patch: Record<string, number> = {
      slot_1_sessions_left: (sub.slot_1_sessions_left ?? 0) + 1,
    }
    if (booking.slot_2_schedule_slot_id && sub.slot_2_type && sub.slot_2_sessions_left !== null) {
      patch.slot_2_sessions_left = (sub.slot_2_sessions_left ?? 0) + 1
    }
    await supabase.from('subscriptions').update(patch).eq('id', booking.subscription_id)
  }

  // audit log
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', req.user!.id).single()
  await logAction({
    branch_id:   booking.branch_id as string,
    entity_type: 'booking',
    entity_id:   booking.client_id as string,
    action:      'cancel_booking',
    actor_id:    req.user!.id,
    actor_name:  profile?.full_name ?? req.user!.email,
    details:     { booking_id: id, date: booking.date },
  })

  const { error } = await supabase.from('bookings_v2').delete().eq('id', id)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(204).send()
})

// PATCH /bookings-v2/:id — отметить посещаемость
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { attended } = req.body

    if (attended === undefined) {
      return res.status(400).json({ error: 'attended required', code: 'VALIDATION_ERROR' })
    }

    const { data, error } = await supabase
      .from('bookings_v2')
      .update({ attended })
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// PATCH /bookings-v2/:id/reschedule — перенести бронь
router.patch('/:id/reschedule', async (req: Request, res: Response) => {
  const { id } = req.params
  const { new_slot_1_id, new_slot_2_id } = req.body

  if (!new_slot_1_id) {
    return res.status(400).json({ error: 'new_slot_1_id required', code: 'VALIDATION_ERROR' })
  }

  const { data: booking, error: bookErr } = await supabase
    .from('bookings_v2')
    .select('*')
    .eq('id', id)
    .single()

  if (bookErr || !booking) return res.status(404).json({ error: 'Booking not found', code: 'NOT_FOUND' })

  // Check timing restriction
  const { data: oldSlot1 } = await supabase
    .from('schedule_slots')
    .select('date, time_start')
    .eq('id', booking.slot_1_schedule_slot_id)
    .single()

  if (oldSlot1) {
    const slotDateTime = new Date(`${oldSlot1.date}T${oldSlot1.time_start}`)
    const diffMs = slotDateTime.getTime() - Date.now()
    if (diffMs < 24 * 60 * 60 * 1000) {
      const role = req.user!.role
      if (!['developer', 'owner', 'franchisee'].includes(role)) {
        return res.status(409).json({ error: 'Cannot reschedule less than 24h before slot', code: 'TOO_LATE' })
      }
    }
  }

  // Validate new slot 1
  const { data: newSlot1, error: ns1Err } = await supabase
    .from('schedule_slots')
    .select('*')
    .eq('id', new_slot_1_id)
    .single()

  if (ns1Err || !newSlot1) return res.status(404).json({ error: 'New slot 1 not found', code: 'SLOT_NOT_FOUND' })
  if (newSlot1.status !== 'free') return res.status(409).json({ error: 'New slot 1 is not free', code: 'SLOT_BUSY' })

  let resolvedSlot2Id: string | null = new_slot_2_id ?? null

  // If subscription has slot_2 and new_slot_2_id not provided — auto-find
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('slot_2_type, branch_id')
    .eq('id', booking.subscription_id)
    .single()

  if (sub?.slot_2_type && !resolvedSlot2Id) {
    const { data: devicesOfType } = await supabase
      .from('devices')
      .select('id')
      .eq('branch_id', booking.branch_id)
      .eq('type', sub.slot_2_type)
      .eq('status', 'active')

    const deviceIds = (devicesOfType ?? []).map((d: { id: string }) => d.id)

    if (deviceIds.length > 0) {
      const { data: freeSlot2 } = await supabase
        .from('schedule_slots')
        .select('id')
        .eq('date', newSlot1.date)
        .eq('time_start', newSlot1.time_end)
        .eq('status', 'free')
        .in('device_id', deviceIds)
        .limit(1)
        .maybeSingle()

      if (freeSlot2) resolvedSlot2Id = freeSlot2.id
    }
  }

  // If slot_2 required but not found
  if (sub?.slot_2_type && !resolvedSlot2Id) {
    return res.status(409).json({
      error: 'No free slot 2 available right after new slot 1',
      code: 'NO_SLOT2',
      slot_2_type: sub.slot_2_type,
    })
  }

  // Free old slots
  await supabase.from('schedule_slots')
    .update({ status: 'free', booking_id: null })
    .eq('booking_id', id)

  // Book new slots
  await supabase.from('schedule_slots')
    .update({ status: 'booked', booking_id: id })
    .eq('id', new_slot_1_id)

  if (resolvedSlot2Id) {
    await supabase.from('schedule_slots')
      .update({ status: 'booked', booking_id: id })
      .eq('id', resolvedSlot2Id)
  }

  // Update booking
  const { data: updated, error: updateErr } = await supabase
    .from('bookings_v2')
    .update({
      slot_1_schedule_slot_id: new_slot_1_id,
      slot_2_schedule_slot_id: resolvedSlot2Id,
      date: newSlot1.date,
    })
    .eq('id', id)
    .select()
    .single()

  if (updateErr) return res.status(500).json({ error: updateErr.message })

  // audit log
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', req.user!.id).single()
  await logAction({
    branch_id:   booking.branch_id as string,
    entity_type: 'booking',
    entity_id:   booking.client_id as string,
    action:      'reschedule_booking',
    actor_id:    req.user!.id,
    actor_name:  profile?.full_name ?? req.user!.email,
    details:     {
      booking_id: id,
      old_slot_1: booking.slot_1_schedule_slot_id,
      new_slot_1: new_slot_1_id,
      new_date:   newSlot1.date,
    },
  })

  return res.json(updated)
})

export default router
