import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'

const router = Router()

// GET /badges — sidebar counters + dashboard metric data
router.get('/', async (req: Request, res: Response) => {
  try {
    const { branch_id, id: profileId } = req.user!

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr  = today.toISOString().slice(0, 10)
    const todayIso  = today.toISOString()

    const yesterday = new Date(today.getTime() - 86400000)
    const yesterdayStr = yesterday.toISOString().slice(0, 10)

    // Month boundaries
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()
    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString()
    const prevMonthEnd   = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999).toISOString()

    // 7-day ago
    const days7ago    = new Date(today.getTime() - 6 * 86400000)
    const days7agoStr = days7ago.toISOString().slice(0, 10)
    const days7agoIso = days7ago.toISOString()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyBranch = (q: any) => branch_id ? q.eq('branch_id', branch_id) : q

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cnt = async (table: string, filters: Record<string, any> = {}): Promise<number> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any).from(table).select('id', { count: 'exact', head: true })
      q = applyBranch(q)
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v)
      const { count: n } = await q
      return n ?? 0
    }

    const now = new Date().toISOString()

    const [
      leads_new,
      tasks_overdue,
      notifications_unread,
      clients_total,
      clients_new_month,
      clients_new_prev_month,
      subscriptions_active,
      subscriptions_expiring_7d,
      subscriptions_sold_month,
      subscriptions_sold_prev_month,
      leads_total_month,
      leads_converted_month,
      tasks_my_today,
      employees_on_shift,
      schedule_slots_today,
      schedule_slots_booked_today,
    ] = await Promise.all([
      // leads new (unarchived)
      (async () => {
        let q = supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'new').is('archived_at', null)
        if (branch_id) q = q.eq('branch_id', branch_id)
        const { count: n } = await q; return n ?? 0
      })(),
      // tasks overdue
      (async () => {
        let q = supabase.from('tasks').select('id', { count: 'exact', head: true })
          .lt('deadline', now).not('status', 'in', '("done","closed")').not('deadline', 'is', null)
        if (branch_id) q = q.eq('branch_id', branch_id)
        const { count: n } = await q; return n ?? 0
      })(),
      // notifications unread (personal)
      (async () => {
        const { count: n } = await supabase.from('notifications').select('id', { count: 'exact', head: true })
          .eq('profile_id', profileId).eq('is_read', false)
        return n ?? 0
      })(),
      // clients total
      cnt('clients', { is_deleted: false }),
      // clients new this month
      (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (supabase as any).from('clients').select('id', { count: 'exact', head: true })
          .eq('is_deleted', false).gte('created_at', monthStart)
        q = applyBranch(q)
        const { count: n } = await q; return n ?? 0
      })(),
      // clients new prev month
      (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (supabase as any).from('clients').select('id', { count: 'exact', head: true })
          .eq('is_deleted', false).gte('created_at', prevMonthStart).lte('created_at', prevMonthEnd)
        q = applyBranch(q)
        const { count: n } = await q; return n ?? 0
      })(),
      // subscriptions active
      cnt('subscriptions', { status: 'active' }),
      // subscriptions expiring 7d
      (async () => {
        const in7 = new Date(today.getTime() + 7 * 86400000).toISOString()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (supabase as any).from('subscriptions').select('id', { count: 'exact', head: true })
          .eq('status', 'active').gte('date_end', todayIso).lte('date_end', in7)
        q = applyBranch(q)
        const { count: n } = await q; return n ?? 0
      })(),
      // subscriptions sold this month
      (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (supabase as any).from('subscriptions').select('id', { count: 'exact', head: true })
          .gte('created_at', monthStart)
        q = applyBranch(q)
        const { count: n } = await q; return n ?? 0
      })(),
      // subscriptions sold prev month
      (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (supabase as any).from('subscriptions').select('id', { count: 'exact', head: true })
          .gte('created_at', prevMonthStart).lte('created_at', prevMonthEnd)
        q = applyBranch(q)
        const { count: n } = await q; return n ?? 0
      })(),
      // leads total this month
      (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (supabase as any).from('leads').select('id', { count: 'exact', head: true })
          .gte('created_at', monthStart)
        q = applyBranch(q)
        const { count: n } = await q; return n ?? 0
      })(),
      // leads converted this month
      (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (supabase as any).from('leads').select('id', { count: 'exact', head: true })
          .eq('status', 'success').gte('status_changed_at', monthStart)
        q = applyBranch(q)
        const { count: n } = await q; return n ?? 0
      })(),
      // my tasks due today
      (async () => {
        const { count: n } = await supabase.from('tasks').select('id', { count: 'exact', head: true })
          .eq('assigned_to', profileId).eq('status', 'today')
        return n ?? 0
      })(),
      // employees on shift today
      (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (supabase as any).from('shifts').select('id', { count: 'exact', head: true })
          .eq('date', todayStr).eq('status', 'active')
        q = applyBranch(q)
        const { count: n } = await q; return n ?? 0
      })(),
      // schedule slots today total
      (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (supabase as any).from('schedule_slots').select('id', { count: 'exact', head: true })
          .eq('date', todayStr)
        q = applyBranch(q)
        const { count: n } = await q; return n ?? 0
      })(),
      // schedule slots booked today
      (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (supabase as any).from('schedule_slots').select('id', { count: 'exact', head: true })
          .eq('date', todayStr).not('booking_id', 'is', null)
        q = applyBranch(q)
        const { count: n } = await q; return n ?? 0
      })(),
    ])

    // visits today / yesterday
    let visits_today = 0, visits_yesterday = 0
    if (branch_id) {
      const [vtRes, vyRes] = await Promise.all([
        supabase.from('schedule_slots').select('id', { count: 'exact', head: true })
          .eq('branch_id', branch_id).eq('date', todayStr).not('booking_id', 'is', null),
        supabase.from('schedule_slots').select('id', { count: 'exact', head: true })
          .eq('branch_id', branch_id).eq('date', yesterdayStr).not('booking_id', 'is', null),
      ])
      visits_today     = vtRes.count ?? 0
      visits_yesterday = vyRes.count ?? 0
    }

    // revenue this month / prev month
    let revenue_month = 0, revenue_prev_month = 0
    if (branch_id) {
      const [rmRes, rpmRes] = await Promise.all([
        supabase.from('subscriptions').select('price').eq('branch_id', branch_id)
          .gte('created_at', monthStart).not('price', 'is', null),
        supabase.from('subscriptions').select('price').eq('branch_id', branch_id)
          .gte('created_at', prevMonthStart).lte('created_at', prevMonthEnd).not('price', 'is', null),
      ])
      revenue_month      = (rmRes.data ?? []).reduce((s: number, r: { price: number | null }) => s + (r.price ?? 0), 0)
      revenue_prev_month = (rpmRes.data ?? []).reduce((s: number, r: { price: number | null }) => s + (r.price ?? 0), 0)
    }

    // low stock items
    let low_stock_items = 0
    if (branch_id) {
      const { data: wItems } = await supabase.from('warehouse_items')
        .select('quantity, min_quantity').eq('branch_id', branch_id).is('deleted_at', null)
      low_stock_items = (wItems ?? []).filter(
        (i: { quantity: number; min_quantity: number | null }) => i.min_quantity !== null && i.quantity <= i.min_quantity
      ).length
    }

    // pending bookings
    let pending_bookings = 0
    if (branch_id) {
      const { count: n } = await supabase.from('bookings_v2')
        .select('id', { count: 'exact', head: true }).eq('branch_id', branch_id).eq('status', 'pending')
      pending_bookings = n ?? 0
    }

    // sparklines (7 days)
    const visits_by_day:  number[] = Array(7).fill(0)
    const clients_by_day: number[] = Array(7).fill(0)
    const revenue_by_day: number[] = Array(7).fill(0)
    if (branch_id) {
      const [vsData, clData, rvData] = await Promise.all([
        supabase.from('schedule_slots').select('date').eq('branch_id', branch_id)
          .gte('date', days7agoStr).lte('date', todayStr).not('booking_id', 'is', null),
        supabase.from('clients').select('created_at').eq('branch_id', branch_id)
          .eq('is_deleted', false).gte('created_at', days7agoIso).lte('created_at', todayIso),
        supabase.from('subscriptions').select('created_at, price').eq('branch_id', branch_id)
          .gte('created_at', days7agoIso).lte('created_at', todayIso).not('price', 'is', null),
      ])

      for (const row of vsData.data ?? []) {
        const r = row as { date: string }
        const diff = Math.round((new Date(r.date).getTime() - days7ago.getTime()) / 86400000)
        if (diff >= 0 && diff < 7) visits_by_day[diff]++
      }
      for (const row of clData.data ?? []) {
        const r = row as { created_at: string }
        const diff = Math.round((new Date(r.created_at.slice(0, 10)).getTime() - days7ago.getTime()) / 86400000)
        if (diff >= 0 && diff < 7) clients_by_day[diff]++
      }
      for (const row of rvData.data ?? []) {
        const r = row as { created_at: string; price: number | null }
        const diff = Math.round((new Date(r.created_at.slice(0, 10)).getTime() - days7ago.getTime()) / 86400000)
        if (diff >= 0 && diff < 7) revenue_by_day[diff] = (revenue_by_day[diff] ?? 0) + (r.price ?? 0)
      }
    }

    return res.json({
      // sidebar counters (backward compat)
      leads_new,
      tasks_overdue,
      low_stock_items,
      notifications_unread,
      // clients
      clients_total,
      clients_new_month,
      clients_new_prev_month,
      // subscriptions
      subscriptions_active,
      subscriptions_expiring_7d,
      subscriptions_sold_month,
      subscriptions_sold_prev_month,
      // revenue
      revenue_month,
      revenue_prev_month,
      // visits
      visits_today,
      visits_yesterday,
      // leads
      leads_total_month,
      leads_converted_month,
      // tasks
      tasks_my_today,
      // schedule
      employees_on_shift,
      schedule_slots_today,
      schedule_slots_booked_today,
      // other
      pending_bookings,
      // sparklines (7 days, index 0 = 6 days ago, index 6 = today)
      visits_by_day,
      clients_by_day,
      revenue_by_day,
    })
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

export default router
