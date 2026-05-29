import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /analytics/overview
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const branchId = (req.query.branch_id as string) || await resolveBranchId(req.user!)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().slice(0, 10)
    const in7days  = new Date(today.getTime() + 7  * 86400000).toISOString()
    const in30days = new Date(today.getTime() + 30 * 86400000).toISOString()
    const todayIso = today.toISOString()

    // Helper: count rows with optional branch filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cnt = async (table: string, filters: Record<string, any> = {}): Promise<number> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any).from(table).select('id', { count: 'exact', head: true })
      if (branchId) q = q.eq('branch_id', branchId)
      for (const [k, v] of Object.entries(filters)) {
        q = q.eq(k, v)
      }
      const { count: n } = await q
      return n ?? 0
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cntRange = async (table: string, field: string, from: string, to: string, filters: Record<string, any> = {}): Promise<number> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any).from(table).select('id', { count: 'exact', head: true }).gte(field, from).lte(field, to)
      if (branchId) q = q.eq('branch_id', branchId)
      for (const [k, v] of Object.entries(filters)) {
        q = q.eq(k, v)
      }
      const { count: n } = await q
      return n ?? 0
    }

    const [
      clientsTotal,
      subsActive,
      slotsToday,
      leadsNew,
      activeShifts,
      subsExpiring7,
      subsExpiring30,
    ] = await Promise.all([
      cnt('clients',       { is_deleted: false }),
      cnt('subscriptions', { status: 'active' }),
      cnt('schedule_slots', { date: todayStr }),
      cnt('leads',         { status: 'new' }),
      cnt('shifts',        { status: 'active' }),
      cntRange('subscriptions', 'date_end', todayIso, in7days,  { status: 'active' }),
      cntRange('subscriptions', 'date_end', todayIso, in30days, { status: 'active' }),
    ])

    let visitsToday = 0
    if (branchId) {
      const { data: slots } = await supabase
        .from('schedule_slots')
        .select('booking_id')
        .eq('branch_id', branchId)
        .eq('date', todayStr)
        .not('booking_id', 'is', null)
      visitsToday = slots?.length ?? 0
    }

    let lowStockItems = 0
    if (branchId) {
      const { data: items } = await supabase
        .from('warehouse_items' as 'devices')
        .select('quantity, min_quantity')
        .eq('branch_id', branchId)
        .not('min_quantity', 'is', null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lowStockItems = (items ?? []).filter((it: any) => it.quantity <= it.min_quantity).length
    }

    return res.json({
      clients_total:                clientsTotal,
      subscriptions_active:         subsActive,
      subscriptions_expiring_soon:  subsExpiring7,
      subscriptions_expiring_30d:   subsExpiring30,
      slots_today:                  slotsToday,
      visits_today:                 visitsToday,
      leads_new:                    leadsNew,
      active_shifts:                activeShifts,
      low_stock_items:              lowStockItems,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

export default router
