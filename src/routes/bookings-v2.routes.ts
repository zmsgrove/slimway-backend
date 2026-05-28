import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireRole } from '../middleware/role.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// POST /bookings-v2 — забронировать слоты
// Body: { client_id, subscription_id, slot_1_schedule_slot_id, date }
router.post('/', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const [branchId, created_by] = [await resolveBranchId(req.user!), req.user!.id]
  const { client_id, subscription_id, slot_1_schedule_slot_id, date } = req.body

  if (!client_id || !subscription_id || !slot_1_schedule_slot_id || !date) {
    return res.status(400).json({
      error: 'client_id, subscription_id, slot_1_schedule_slot_id, date required',
      code: 'VALIDATION_ERROR',
    })
  }

  // 1. Загружаем абонемент
  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', subscription_id)
    .single()

  if (subErr || !sub) return res.status(404).json({ error: 'Subscription not found', code: 'NOT_FOUND' })
  if (sub.status !== 'active') return res.status(400).json({ error: 'Subscription is not active', code: 'SUB_INACTIVE' })
  if (sub.slot_1_sessions_left <= 0) return res.status(400).json({ error: 'No sessions left on slot 1', code: 'NO_SESSIONS' })

  // 2. Проверяем слот 1
  const { data: slot1, error: slot1Err } = await supabase
    .from('schedule_slots')
    .select('*')
    .eq('id', slot_1_schedule_slot_id)
    .single()

  if (slot1Err || !slot1) return res.status(404).json({ error: 'Slot 1 not found', code: 'SLOT_NOT_FOUND' })
  console.log('slot1 status check:', { id: slot_1_schedule_slot_id, status: slot1.status, slot1 })
  if (slot1.status !== 'free') return res.status(409).json({ error: 'Slot 1 is not free', code: 'SLOT_BUSY', slot_status: slot1.status })

  // 3. Если абонемент двухслотовый — ищем слот 2
  let slot2Id: string | null = null

  if (sub.slot_2_type) {
    if ((sub.slot_2_sessions_left ?? 0) <= 0) {
      return res.status(400).json({ error: 'No sessions left on slot 2', code: 'NO_SESSIONS_SLOT2' })
    }

    // Находим тренажёры нужного типа в этом филиале
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

    // Ищем свободный слот 2: time_start = slot1.time_end, тот же день
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
      // Ищем ближайший доступный слот 2 на сегодня или позже
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

  // 4. Создаём бронь
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
    console.log('booking conflict:', bookErr)
    // unique constraint violation — slot already booked
    if (bookErr?.code === '23505') {
      return res.status(409).json({ error: 'Slot already booked (unique conflict)', code: 'SLOT_CONFLICT', detail: bookErr.details })
    }
    return res.status(500).json({ error: bookErr?.message ?? 'Booking failed', code: bookErr?.code })
  }

  // 5. Блокируем слоты
  await supabase
    .from('schedule_slots')
    .update({ status: 'booked', booking_id: booking.id })
    .eq('id', slot_1_schedule_slot_id)

  if (slot2Id) {
    await supabase
      .from('schedule_slots')
      .update({ status: 'booked', booking_id: booking.id })
      .eq('id', slot2Id)
  }

  // 6. Списываем сеансы
  await supabase
    .from('subscriptions')
    .update({ slot_1_sessions_left: sub.slot_1_sessions_left - 1 })
    .eq('id', subscription_id)

  if (slot2Id && sub.slot_2_sessions_left !== null) {
    await supabase
      .from('subscriptions')
      .update({ slot_2_sessions_left: (sub.slot_2_sessions_left ?? 1) - 1 })
      .eq('id', subscription_id)
  }

  return res.status(201).json(booking)
})

// GET /bookings-v2/:id — детали брони с клиентом, абонементом, слотами
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

  // Загружаем бронь с датой и временем
  const { data: booking } = await supabase
    .from('bookings_v2')
    .select('*, schedule_slots!slot_1_schedule_slot_id(date, time_start)')
    .eq('id', id)
    .single()

  if (!booking) return res.status(404).json({ error: 'Booking not found', code: 'NOT_FOUND' })

  // Проверяем 24 часа
  const slot = (booking as any).schedule_slots
  if (slot) {
    const slotDateTime = new Date(`${slot.date}T${slot.time_start}`)
    const diffMs = slotDateTime.getTime() - Date.now()
    if (diffMs < 24 * 60 * 60 * 1000) {
      return res.status(409).json({ error: 'Cannot cancel less than 24h before slot', code: 'TOO_LATE' })
    }
  }

  // Освобождаем слоты
  await supabase
    .from('schedule_slots')
    .update({ status: 'free', booking_id: null })
    .eq('booking_id', id)

  // Возвращаем сеансы
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

  const { error } = await supabase.from('bookings_v2').delete().eq('id', id)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(204).send()
})

export default router
