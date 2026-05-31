import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'

const router = Router()

// GET /api/public/booking/:slug
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params

    const { data: link, error } = await supabase
      .from('booking_links')
      .select('*, branches(id, name, city)')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()

    if (error || !link) return res.status(404).json({ error: 'Booking page not found', code: 'NOT_FOUND' })

    const { data: templates } = await supabase
      .from('branch_subscription_templates')
      .select('subscription_templates(*)')
      .eq('branch_id', link.branch_id)

    return res.json({
      branch_id: link.branch_id,
      branch:    link.branches,
      slug:      link.slug,
      templates: (templates ?? []).map((t: Record<string, unknown>) => t.subscription_templates),
    })
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// GET /api/public/booking/:slug/slots?date=
router.get('/:slug/slots', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params
    const { date } = req.query
    if (!date) return res.status(400).json({ error: 'date required', code: 'VALIDATION_ERROR' })

    const { data: link } = await supabase
      .from('booking_links')
      .select('branch_id')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()

    if (!link) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' })

    const { data: slots, error } = await supabase
      .from('schedule_slots')
      .select('id, time_start, time_end, status, devices(id, type, number, device_group)')
      .eq('branch_id', link.branch_id)
      .eq('date', date as string)
      .eq('status', 'free')
      .order('time_start', { ascending: true })

    if (error) return res.status(500).json({ error: error.message })
    return res.json(slots ?? [])
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// POST /api/public/booking/:slug/book — requires client token in Authorization header
router.post('/:slug/book', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Client token required', code: 'UNAUTHORIZED' })
    }
    const token = auth.slice(7)

    const { data: tokenRow } = await supabase
      .from('client_tokens')
      .select('client_id, expires_at')
      .eq('token', token)
      .single()

    if (!tokenRow || new Date(tokenRow.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Invalid or expired token', code: 'UNAUTHORIZED' })
    }

    const { data: client } = await supabase
      .from('clients')
      .select('id, branch_id')
      .eq('id', tokenRow.client_id)
      .single()

    if (!client) return res.status(401).json({ error: 'Client not found', code: 'UNAUTHORIZED' })

    const { data: link } = await supabase
      .from('booking_links')
      .select('branch_id')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()

    if (!link || link.branch_id !== client.branch_id) {
      return res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' })
    }

    const { subscription_id, slot_1_schedule_slot_id, date } = req.body
    if (!subscription_id || !slot_1_schedule_slot_id || !date) {
      return res.status(400).json({ error: 'subscription_id, slot_1_schedule_slot_id, date required', code: 'VALIDATION_ERROR' })
    }

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', subscription_id)
      .eq('client_id', client.id)
      .single()

    if (!sub || sub.status !== 'active' || sub.slot_1_sessions_left <= 0) {
      return res.status(400).json({ error: 'Subscription not available', code: 'SUB_INVALID' })
    }

    const { data: slot1 } = await supabase
      .from('schedule_slots')
      .select('*')
      .eq('id', slot_1_schedule_slot_id)
      .single()

    if (!slot1 || slot1.status !== 'free') {
      return res.status(409).json({ error: 'Slot is not free', code: 'SLOT_BUSY' })
    }

    const { data: booking, error: bErr } = await supabase
      .from('bookings_v2')
      .insert({ client_id: client.id, subscription_id, slot_1_schedule_slot_id, date, branch_id: client.branch_id })
      .select()
      .single()

    if (bErr || !booking) return res.status(500).json({ error: bErr?.message ?? 'Failed to create booking' })

    await supabase.from('schedule_slots').update({ status: 'booked', booking_id: booking.id }).eq('id', slot_1_schedule_slot_id)
    await supabase.from('subscriptions').update({ slot_1_sessions_left: sub.slot_1_sessions_left - 1 }).eq('id', subscription_id)

    return res.status(201).json(booking)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

export default router
