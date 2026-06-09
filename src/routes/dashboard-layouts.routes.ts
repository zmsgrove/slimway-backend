import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// Default layouts per role
const DEFAULT_WIDGETS: Record<string, string[]> = {
  developer:   ['clients_total','subscriptions_active','revenue_month','visits_today','leads_new','subscriptions_expiring','tasks_overdue','low_stock','leads_conversion','employees_on_shift','schedule_occupancy','chart_clients','chart_revenue','chart_visits','leads_funnel','leads_sources','birthdays','schedule_today','my_tasks','recent_leads','recent_clients'],
  owner:       ['clients_total','subscriptions_active','revenue_month','visits_today','leads_new','subscriptions_expiring','tasks_overdue','low_stock','leads_conversion','employees_on_shift','schedule_occupancy','chart_clients','chart_revenue','chart_visits','leads_funnel','leads_sources','birthdays','schedule_today','my_tasks','recent_leads','recent_clients'],
  franchisee:  ['clients_total','subscriptions_active','revenue_month','visits_today','leads_new','subscriptions_expiring','leads_conversion','employees_on_shift','schedule_occupancy','chart_clients','chart_revenue','chart_visits','leads_funnel','leads_sources','birthdays','schedule_today','my_tasks','recent_leads'],
  admin:       ['clients_total','subscriptions_active','visits_today','leads_new','subscriptions_expiring','tasks_overdue','leads_conversion','schedule_occupancy','chart_clients','chart_visits','leads_funnel','leads_sources','birthdays','schedule_today','my_tasks','recent_leads','recent_clients'],
  staff:       ['clients_total','subscriptions_active','visits_today','leads_new','schedule_occupancy','schedule_today','my_tasks','recent_leads','recent_clients'],
  technical:   ['schedule_today','schedule_occupancy'],
}

const DEFAULT_LAYOUT: Record<string, { x: number; y: number; w: number; h: number }> = {
  clients_total:        { x: 0,  y: 0,  w: 3, h: 2 },
  subscriptions_active: { x: 3,  y: 0,  w: 3, h: 2 },
  revenue_month:        { x: 6,  y: 0,  w: 3, h: 2 },
  visits_today:         { x: 9,  y: 0,  w: 3, h: 2 },
  leads_new:            { x: 0,  y: 2,  w: 3, h: 2 },
  subscriptions_expiring:{ x: 3, y: 2,  w: 3, h: 2 },
  tasks_overdue:        { x: 6,  y: 2,  w: 3, h: 2 },
  low_stock:            { x: 9,  y: 2,  w: 3, h: 2 },
  leads_conversion:     { x: 0,  y: 4,  w: 3, h: 2 },
  employees_on_shift:   { x: 3,  y: 4,  w: 3, h: 2 },
  schedule_occupancy:   { x: 6,  y: 4,  w: 6, h: 2 },
  chart_clients:        { x: 0,  y: 6,  w: 6, h: 4 },
  chart_revenue:        { x: 6,  y: 6,  w: 6, h: 4 },
  chart_visits:         { x: 0,  y: 10, w: 6, h: 4 },
  leads_funnel:         { x: 6,  y: 10, w: 6, h: 4 },
  leads_sources:        { x: 0,  y: 14, w: 6, h: 4 },
  birthdays:            { x: 6,  y: 14, w: 6, h: 4 },
  schedule_today:       { x: 0,  y: 18, w: 6, h: 4 },
  my_tasks:             { x: 6,  y: 18, w: 6, h: 4 },
  recent_leads:         { x: 0,  y: 22, w: 6, h: 4 },
  recent_clients:       { x: 6,  y: 22, w: 6, h: 4 },
}

// GET /dashboard-layouts
router.get('/', async (req: Request, res: Response) => {
  try {
    const profileId = req.user!.id
    const role      = req.user!.role ?? 'staff'
    const branchId  = await resolveBranchId(req.user!)

    const { data, error } = await supabase
      .from('dashboard_layouts')
      .select('layout, widgets')
      .eq('profile_id', profileId)
      .eq('branch_id', branchId ?? '')
      .maybeSingle()

    if (error) return res.status(500).json({ error: error.message })

    if (data) {
      return res.json({ layout: data.layout, widgets: data.widgets })
    }

    // Return default for role
    const widgets = DEFAULT_WIDGETS[role] ?? DEFAULT_WIDGETS['staff']
    const layout  = widgets.map(id => ({
      i: id,
      ...(DEFAULT_LAYOUT[id] ?? { x: 0, y: 99, w: 3, h: 2 }),
    }))
    return res.json({ layout, widgets })
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// POST /dashboard-layouts (upsert)
router.post('/', async (req: Request, res: Response) => {
  try {
    const profileId = req.user!.id
    const branchId  = await resolveBranchId(req.user!)
    const { layout, widgets } = req.body as { layout: unknown; widgets: unknown }

    if (!Array.isArray(layout) || !Array.isArray(widgets)) {
      return res.status(400).json({ error: 'layout and widgets must be arrays' })
    }

    const { error } = await supabase
      .from('dashboard_layouts')
      .upsert(
        { profile_id: profileId, branch_id: branchId ?? '', layout, widgets },
        { onConflict: 'profile_id,branch_id' }
      )

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

export default router
