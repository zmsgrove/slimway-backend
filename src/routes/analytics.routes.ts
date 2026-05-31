import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requirePermission } from '../middleware/permission.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /analytics/overview?branch_ids=id1,id2  (or ?branch_id=id)
router.get('/overview', requirePermission('analytics', 'view'), async (req: Request, res: Response) => {
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

    // Extended charts data
    // clients_by_month — last 6 months (new clients per month)
    const now = new Date()
    const months6ago = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()
    const clientsByMonthData: { clients_by_month: { month: string; count: number }[] } = { clients_by_month: [] }
    if (branchIds.length > 0) {
      let q = supabase.from('clients').select('created_at').eq('is_deleted', false).gte('created_at', months6ago)
      q = applyBranch(q) as typeof q
      const { data: clientRows } = await q
      const monthCounts: Record<string, number> = {}
      for (const c of clientRows ?? []) {
        const m = (c as { created_at: string }).created_at.slice(0, 7)
        monthCounts[m] = (monthCounts[m] ?? 0) + 1
      }
      clientsByMonthData.clients_by_month = Object.entries(monthCounts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => ({ month, count }))
    }

    // revenue_by_month — last 6 months (subscription price sum per month)
    const revenueByMonthData: { revenue_by_month: { month: string; revenue: number }[] } = { revenue_by_month: [] }
    if (branchIds.length > 0) {
      let q = supabase.from('subscriptions').select('created_at, price').gte('created_at', months6ago).not('price', 'is', null)
      q = applyBranch(q) as typeof q
      const { data: subRows } = await q
      const revMap: Record<string, number> = {}
      for (const s of subRows ?? []) {
        const row = s as { created_at: string; price: number | null }
        const m = row.created_at.slice(0, 7)
        revMap[m] = (revMap[m] ?? 0) + (row.price ?? 0)
      }
      revenueByMonthData.revenue_by_month = Object.entries(revMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, revenue]) => ({ month, revenue }))
    }

    // leads_by_source
    const leadsBySourceData: { leads_by_source: { source: string; count: number }[] } = { leads_by_source: [] }
    if (branchIds.length > 0) {
      let q = supabase.from('leads').select('source')
      q = applyBranch(q) as typeof q
      const { data: leadRows } = await q
      const srcMap: Record<string, number> = {}
      for (const l of leadRows ?? []) {
        const src = (l as { source: string }).source ?? 'other'
        srcMap[src] = (srcMap[src] ?? 0) + 1
      }
      leadsBySourceData.leads_by_source = Object.entries(srcMap).map(([source, count]) => ({ source, count }))
    }

    // leads_conversion (success / total)
    let leadsConversion = 0
    if (branchIds.length > 0) {
      const [total, success] = await Promise.all([
        cnt('leads', {}),
        cnt('leads', { status: 'success' }),
      ])
      leadsConversion = total > 0 ? Math.round((success / total) * 100) : 0
    }

    // avg_ltv — average sum of subscription prices per client
    let avgLtv = 0
    if (branchIds.length > 0) {
      let q = supabase.from('subscriptions').select('client_id, price').not('price', 'is', null)
      q = applyBranch(q) as typeof q
      const { data: ltv_rows } = await q
      const clientRevenue: Record<string, number> = {}
      for (const row of ltv_rows ?? []) {
        const r = row as { client_id: string; price: number }
        clientRevenue[r.client_id] = (clientRevenue[r.client_id] ?? 0) + (r.price ?? 0)
      }
      const vals = Object.values(clientRevenue)
      avgLtv = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
    }

    // leads_funnel — counts per status
    const leadsFunnelData: { leads_funnel: { status: string; count: number }[] } = { leads_funnel: [] }
    if (branchIds.length > 0) {
      const funnelStatuses = ['new', 'in_work', 'waiting', 'success', 'fail']
      const funnelCounts = await Promise.all(funnelStatuses.map(s => cnt('leads', { status: s })))
      leadsFunnelData.leads_funnel = funnelStatuses.map((s, i) => ({ status: s, count: funnelCounts[i] }))
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
      ...clientsByMonthData,
      ...revenueByMonthData,
      ...leadsBySourceData,
      leads_conversion:            leadsConversion,
      avg_ltv:                     avgLtv,
      ...leadsFunnelData,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// GET /analytics/heatmap — booking frequency by hour × device type for last 30 days
router.get('/heatmap', requirePermission('analytics', 'view'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    const days = parseInt(req.query.days as string) || 30
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - days)
    const fromStr = fromDate.toISOString().slice(0, 10)

    let q = supabase
      .from('schedule_slots')
      .select('time_start, devices(type), bookings_v2(attended)')
      .not('booking_id', 'is', null)
      .gte('date', fromStr)

    if (branchId) q = q.eq('branch_id', branchId) as typeof q

    const { data: slots, error } = await q
    if (error) return res.status(500).json({ error: error.message })

    // Aggregate: { device_type: { hour: count } }
    const matrix: Record<string, Record<string, number>> = {}
    for (const slot of (slots ?? []) as Record<string, unknown>[]) {
      const devType = (slot.devices as { type: string } | null)?.type ?? 'unknown'
      const hour = (slot.time_start as string).slice(0, 2)
      if (!matrix[devType]) matrix[devType] = {}
      matrix[devType][hour] = (matrix[devType][hour] ?? 0) + 1
    }

    const result = Object.entries(matrix).map(([device_type, hours]) => ({
      device_type,
      hours: Object.entries(hours).map(([hour, count]) => ({ hour, count })).sort((a, b) => a.hour.localeCompare(b.hour)),
    }))

    return res.json(result)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

export default router
