import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'

const router = Router()

// GET /badges — sidebar badge counters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { branch_id } = req.user!

    // New leads count
    let leadsQ = supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new')
      .is('archived_at', null)
    if (branch_id) leadsQ = leadsQ.eq('branch_id', branch_id)
    const { count: leads_new } = await leadsQ

    // Overdue tasks count (deadline < now and status not done/closed)
    const now = new Date().toISOString()
    let tasksQ = supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .lt('deadline', now)
      .not('status', 'in', '("done","closed")')
      .not('deadline', 'is', null)
    if (branch_id) tasksQ = tasksQ.eq('branch_id', branch_id)
    const { count: tasks_overdue } = await tasksQ

    // Low stock items
    let warehouseQ = supabase
      .from('warehouse_items')
      .select('quantity, min_quantity')
      .is('deleted_at', null)
    if (branch_id) warehouseQ = warehouseQ.eq('branch_id', branch_id)
    const { data: items } = await warehouseQ
    const low_stock_items = (items ?? []).filter(
      (i: { quantity: number; min_quantity: number | null }) =>
        i.min_quantity !== null && i.quantity <= i.min_quantity
    ).length

    const { count: notifications_unread } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', req.user!.id)
      .eq('is_read', false)

    return res.json({
      leads_new:            leads_new            ?? 0,
      tasks_overdue:        tasks_overdue        ?? 0,
      low_stock_items:      low_stock_items       ?? 0,
      notifications_unread: notifications_unread  ?? 0,
    })
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

export default router
