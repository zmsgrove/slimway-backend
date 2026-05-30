import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireRole } from '../middleware/role.middleware'

const router = Router()

// POST /bookings — записать клиента на тренировку
router.post('/', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const { schedule_id, client_id, membership_id } = req.body

  if (!schedule_id || !client_id) {
    return res.status(400).json({ error: 'schedule_id, client_id required', code: 'VALIDATION_ERROR' })
  }

  // Проверяем вместимость
  const { data: session } = await supabase
    .from('schedule')
    .select('capacity, bookings(count)')
    .eq('id', schedule_id)
    .single()

  if (session) {
    const booked = (session.bookings as any[])[0]?.count || 0
    if (booked >= session.capacity) {
      return res.status(409).json({ error: 'Session is full', code: 'SESSION_FULL' })
    }
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert({ schedule_id, client_id, membership_id, status: 'booked' })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Client already booked', code: 'ALREADY_BOOKED' })
    }
    return res.status(500).json({ error: error.message })
  }

  return res.status(201).json(data)
})

// PATCH /bookings/:id/attend — отметить посещение + списать занятие
router.patch('/:id/attend', requireRole('owner', 'franchisee', 'admin', 'staff'), async (req: Request, res: Response) => {
  const { id } = req.params

  // Получаем booking с membership
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('*, memberships(id, used_sessions, total_sessions, type)')
    .eq('id', id)
    .single()

  if (bookingError || !booking) {
    return res.status(404).json({ error: 'Booking not found', code: 'NOT_FOUND' })
  }

  // Обновляем статус booking
  const { error: updateError } = await supabase
    .from('bookings')
    .update({ status: 'attended' })
    .eq('id', id)

  if (updateError) return res.status(500).json({ error: updateError.message })

  // Списываем занятие если абонемент по сессиям
  const membership = (booking.memberships as any)
  if (membership && membership.type === 'sessions') {
    await supabase
      .from('memberships')
      .update({ used_sessions: (membership.used_sessions || 0) + 1 })
      .eq('id', membership.id)
  }

  return res.json({ success: true })
})

// DELETE /bookings/:id — отменить запись
router.delete('/:id', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const { id } = req.params

  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', id)

  if (error) return res.status(500).json({ error: error.message })
  return res.status(204).send()
})

export default router
