import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { supabase } from '../config/supabase'
import { requireClientAuth } from '../middleware/client-auth.middleware'

const router = Router()

// ─── POST /api/client/auth ────────────────────────────────────────────────────

router.post('/auth', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body
    if (!phone) {
      return res.status(400).json({ error: 'phone required', code: 'VALIDATION_ERROR' })
    }

    const authHeader = req.headers.authorization ?? ''
    const urlToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!urlToken) {
      return res.status(400).json({ error: 'Portal token required', code: 'NO_TOKEN' })
    }

    const { data: tokenRow } = await supabase
      .from('client_tokens')
      .select('branch_id')
      .eq('token', urlToken)
      .maybeSingle()

    if (!tokenRow?.branch_id) {
      return res.status(404).json({ error: 'Invalid portal token', code: 'INVALID_TOKEN' })
    }

    const normalized = String(phone).replace(/\s+/g, '')

    const { data: client, error } = await supabase
      .from('clients')
      .select('id, full_name, branch_id')
      .eq('branch_id', tokenRow.branch_id)
      .eq('is_deleted', false)
      .ilike('phone', `%${normalized.slice(-9)}%`)
      .single()

    if (error || !client) {
      return res.status(404).json({ error: 'Клиент не найден', code: 'NOT_FOUND' })
    }

    const token = randomUUID()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const { error: insertErr } = await supabase.from('client_tokens').insert({
      token,
      client_id: client.id,
      branch_id: client.branch_id,
      expires_at: expiresAt,
    })

    if (insertErr) {
      console.error('[client/auth] insert token error:', insertErr)
      return res.status(500).json({ error: insertErr.message })
    }

    return res.json({ token, client_id: client.id, client_name: client.full_name })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// ─── GET /api/client/me ───────────────────────────────────────────────────────

router.get('/me', requireClientAuth, async (req: Request, res: Response) => {
  try {
    const { id, branch_id } = req.client!
    const { data, error } = await supabase
      .from('clients')
      .select('*, memberships(id, status, end_date, used_sessions, total_sessions)')
      .eq('id', id)
      .eq('branch_id', branch_id)
      .single()

    if (error || !data) return res.status(404).json({ error: 'Client not found' })
    return res.json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// ─── GET /api/client/subscriptions ───────────────────────────────────────────

router.get('/subscriptions', requireClientAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.client!
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('client_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) return res.status(500).json({ error: error.message })
    return res.json(data ?? [])
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// ─── GET /api/client/bookings ─────────────────────────────────────────────────

router.get('/bookings', requireClientAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.client!
    const { data, error } = await supabase
      .from('bookings_v2')
      .select('*, schedule_slots!slot_1_schedule_slot_id(id, date, time_start, time_end, devices(type, number))')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return res.status(500).json({ error: error.message })
    return res.json(data ?? [])
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// ─── GET /api/client/schedule?date= ──────────────────────────────────────────

router.get('/schedule', requireClientAuth, async (req: Request, res: Response) => {
  try {
    const { branch_id } = req.client!
    const { date } = req.query
    if (!date) return res.status(400).json({ error: 'date required', code: 'VALIDATION_ERROR' })

    const { data, error } = await supabase
      .from('schedule_slots')
      .select('*, devices(id, type, number, device_group)')
      .eq('branch_id', branch_id)
      .eq('date', date as string)
      .eq('status', 'free')
      .order('time_start', { ascending: true })

    if (error) return res.status(500).json({ error: error.message })
    return res.json(data ?? [])
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// ─── POST /api/client/bookings ────────────────────────────────────────────────

router.post('/bookings', requireClientAuth, async (req: Request, res: Response) => {
  try {
    const { id: client_id, branch_id } = req.client!
    const { subscription_id, slot_1_schedule_slot_id, date } = req.body

    if (!subscription_id || !slot_1_schedule_slot_id || !date) {
      return res.status(400).json({ error: 'subscription_id, slot_1_schedule_slot_id, date required', code: 'VALIDATION_ERROR' })
    }

    const { data: sub, error: subErr } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', subscription_id)
      .eq('client_id', client_id)
      .single()

    if (subErr || !sub) return res.status(404).json({ error: 'Subscription not found', code: 'NOT_FOUND' })
    if (sub.status !== 'active') return res.status(400).json({ error: 'Subscription is not active', code: 'SUB_INACTIVE' })
    if (sub.slot_1_sessions_left <= 0) return res.status(400).json({ error: 'No sessions left', code: 'NO_SESSIONS' })

    const { data: slot1 } = await supabase
      .from('schedule_slots')
      .select('*')
      .eq('id', slot_1_schedule_slot_id)
      .single()

    if (!slot1) return res.status(404).json({ error: 'Slot not found', code: 'SLOT_NOT_FOUND' })
    if (slot1.status !== 'free') return res.status(409).json({ error: 'Slot is not free', code: 'SLOT_BUSY' })

    let slot2Id: string | null = null

    if (sub.slot_2_type) {
      if ((sub.slot_2_sessions_left ?? 0) <= 0) {
        return res.status(400).json({ error: 'No sessions left on slot 2', code: 'NO_SESSIONS_SLOT2' })
      }
      const { data: devices } = await supabase
        .from('devices')
        .select('id')
        .eq('branch_id', branch_id)
        .eq('type', sub.slot_2_type)
        .eq('status', 'active')

      const deviceIds = (devices ?? []).map((d: { id: string }) => d.id)
      if (deviceIds.length > 0) {
        const { data: freeSlot2 } = await supabase
          .from('schedule_slots')
          .select('id')
          .eq('date', date)
          .eq('time_start', slot1.time_end)
          .eq('status', 'free')
          .in('device_id', deviceIds)
          .limit(1)
          .maybeSingle()
        slot2Id = (freeSlot2 as { id: string } | null)?.id ?? null
      }
    }

    const { data: booking, error: bErr } = await supabase
      .from('bookings_v2')
      .insert({
        client_id,
        subscription_id,
        slot_1_schedule_slot_id,
        slot_2_schedule_slot_id: slot2Id,
        date,
        branch_id,
        created_by: null,
      })
      .select()
      .single()

    if (bErr || !booking) return res.status(500).json({ error: bErr?.message ?? 'Failed to create booking' })

    await supabase.from('schedule_slots').update({ status: 'booked', booking_id: booking.id }).eq('id', slot_1_schedule_slot_id)
    if (slot2Id) await supabase.from('schedule_slots').update({ status: 'booked', booking_id: booking.id }).eq('id', slot2Id)
    await supabase.from('subscriptions').update({ slot_1_sessions_left: sub.slot_1_sessions_left - 1 }).eq('id', subscription_id)
    if (sub.slot_2_type && slot2Id) {
      await supabase.from('subscriptions').update({ slot_2_sessions_left: (sub.slot_2_sessions_left ?? 1) - 1 }).eq('id', subscription_id)
    }

    return res.status(201).json(booking)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// ─── DELETE /api/client/bookings/:id ─────────────────────────────────────────

router.delete('/bookings/:id', requireClientAuth, async (req: Request, res: Response) => {
  try {
    const { id: client_id } = req.client!
    const { id } = req.params

    const { data: booking } = await supabase
      .from('bookings_v2')
      .select('*, subscriptions(slot_1_sessions_left, slot_2_sessions_left, slot_2_type), slot_1_schedule_slot_id')
      .eq('id', id)
      .eq('client_id', client_id)
      .single()

    if (!booking) return res.status(404).json({ error: 'Booking not found', code: 'NOT_FOUND' })

    const slotDate = booking.date ? new Date(booking.date + 'T00:00:00') : null
    if (slotDate) {
      const diffHours = (slotDate.getTime() - Date.now()) / (1000 * 60 * 60)
      if (diffHours < 24) {
        return res.status(400).json({ error: 'Cannot cancel booking less than 24h before', code: 'TOO_LATE' })
      }
    }

    await supabase.from('bookings_v2').delete().eq('id', id)
    await supabase.from('schedule_slots').update({ status: 'free', booking_id: null }).eq('booking_id', id)

    if (booking.subscription_id) {
      const sub = booking.subscriptions as { slot_1_sessions_left: number; slot_2_sessions_left: number | null; slot_2_type: string | null } | null
      if (sub) {
        await supabase.from('subscriptions').update({ slot_1_sessions_left: sub.slot_1_sessions_left + 1 }).eq('id', booking.subscription_id)
        if (sub.slot_2_type) {
          await supabase.from('subscriptions').update({ slot_2_sessions_left: (sub.slot_2_sessions_left ?? 0) + 1 }).eq('id', booking.subscription_id)
        }
      }
    }

    return res.status(204).send()
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// ─── GET /api/client/messages ─────────────────────────────────────────────────

router.get('/messages', requireClientAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.client!
    const { data, error } = await supabase
      .from('client_messages')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: true })
      .limit(100)

    if (error) return res.status(500).json({ error: error.message })

    await supabase
      .from('client_messages')
      .update({ is_read: true })
      .eq('client_id', id)
      .eq('sender', 'manager')
      .eq('is_read', false)

    return res.json(data ?? [])
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// ─── POST /api/client/messages ────────────────────────────────────────────────

router.post('/messages', requireClientAuth, async (req: Request, res: Response) => {
  try {
    const { id, branch_id } = req.client!
    const { text } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'text required', code: 'VALIDATION_ERROR' })

    const { data, error } = await supabase
      .from('client_messages')
      .insert({ client_id: id, branch_id, sender: 'client', text: text.trim(), is_read: false })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// ─── GET /api/client/activity ─────────────────────────────────────────────────

router.get('/activity', requireClientAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.client!

    const [bookingsRes, subsRes] = await Promise.all([
      supabase
        .from('bookings_v2')
        .select('id, date, attended, created_at, schedule_slots!slot_1_schedule_slot_id(time_start, devices(type, number))')
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('subscriptions')
        .select('id, name, price, created_at, status')
        .eq('client_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    type BookingEntry = { id: string; date: string; attended: boolean | null; created_at: string; schedule_slots: unknown }
    type SubEntry = { id: string; name: string; price: number | null; created_at: string; status: string }

    const activity = [
      ...((bookingsRes.data ?? []) as BookingEntry[]).map(b => ({
        id:         `booking_${b.id}`,
        type:       'booking' as const,
        date:       b.date,
        created_at: b.created_at,
        attended:   b.attended,
        slot:       b.schedule_slots,
      })),
      ...((subsRes.data ?? []) as SubEntry[]).map(s => ({
        id:         `sub_${s.id}`,
        type:       'subscription' as const,
        date:       s.created_at.slice(0, 10),
        created_at: s.created_at,
        name:       s.name,
        price:      s.price,
        status:     s.status,
      })),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at))

    return res.json(activity)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

export default router
