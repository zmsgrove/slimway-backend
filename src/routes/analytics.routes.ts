import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /analytics/overview?branch_ids=id1,id2  (or ?branch_id=id)
router.get('/overview', async (req: Request, res: Response) => {
  try {
    // Parse branch IDs: ?branch_ids=a,b,c takes priority over single ?branch_id
    let branchIds: string[] = []
    const branchIdsParam = req.query.branch_ids as string | undefined
    if (branchIdsParam) {
      branchIds = branchIdsParam.split(',').map(s => s.trim()).filter(Boolean)
    } else {
      const single = (req.query.branch_id as string) || await resolveBranchId(req.user!)
      if (single) branchIds = [single]
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().slice(0, 10)
    const in7days  = new Date(today.getTime() + 7  * 86400000).toISOString()
    const in30days = new Date(today.getTime() + 30 * 86400000).toISOString()
    const todayIso = today.toISOString()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyBranch = (q: any) => {
      if (branchIds.length === 1) return q.eq('branch_id', branchIds[0])
      if (branchIds.length > 1)  return q.in('branch_id', branchIds)
      return q
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cnt = async (table: string, filters: Record<string, any> = {}): Promise<number> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any).from(table).select('id', { count: 'exact', head: true })
      q = applyBranch(q)
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
      q = applyBranch(q)
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

    // Visits today
    let visitsToday = 0
    if (branchIds.length > 0) {
      let q = supabase.from('schedule_slots').select('booking_id').eq('date', todayStr).not('booking_id', 'is', null)
      q = applyBranch(q) as typeof q
      const { data: slots } = await q
      visitsToday = slots?.length ?? 0
    }

    // Low stock items
    let lowStockItems = 0
    if (branchIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any).from('warehouse_items').select('quantity, min_quantity').not('min_quantity', 'is', null).is('deleted_at', null)
      q = applyBranch(q)
      const { data: items } = await q
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lowStockItems = (items ?? []).filter((it: any) => it.quantity <= it.min_quantity).length
    }

    // Per-branch breakdown (only when multiple branches)
    interface BranchRow {
      branch_id: string
      branch_name: string
      clients_total: number
      subscriptions_active: number
      leads_new: number
    }
    let byBranch: BranchRow[] = []
    if (branchIds.length > 1) {
      const { data: branchNames } = await supabase.from('branches').select('id, name').in('id', branchIds)
      const nameMap = Object.fromEntries((branchNames ?? []).map((b: { id: string; name: string }) => [b.id, b.name]))

      byBranch = await Promise.all(branchIds.map(async (bid) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = async (table: string, filters: Record<string, any> = {}) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q = (supabase as any).from(table).select('id', { count: 'exact', head: true }).eq('branch_id', bid)
          for (const [k, v] of Object.entries(filters)) q = q.eq(k, v)
          const { count: n } = await q
          return n ?? 0
        }
        const [cl, sa, ln] = await Promise.all([
          c('clients', { is_deleted: false }),
          c('subscriptions', { status: 'active' }),
          c('leads', { status: 'new' }),
        ])
        return { branch_id: bid, branch_name: nameMap[bid] ?? bid, clients_total: cl, subscriptions_active: sa, leads_new: ln }
      }))
    }

    return res.json({
      clients_total:               clientsTotal,
      subscriptions_active:        subsActive,
      subscriptions_expiring_soon: subsExpiring7,
      subscriptions_expiring_30d:  subsExpiring30,
      slots_today:                 slotsToday,
      visits_today:                visitsToday,
      leads_new:                   leadsNew,
      active_shifts:               activeShifts,
      low_stock_items:             lowStockItems,
      by_branch:                   byBranch,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

export default router
