import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requirePermission } from '../middleware/permission.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /timesheet?month=YYYY-MM
router.get('/', requirePermission('employees', 'view'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch', code: 'NO_BRANCH' })

    const month = String(req.query.month ?? '')
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month param required (YYYY-MM)', code: 'VALIDATION_ERROR' })
    }

    const { data, error } = await supabase
      .from('timesheet')
      .select('*, employees(id, full_name, position)')
      .eq('branch_id', branchId)
      .gte('date', `${month}-01`)
      .lte('date', `${month}-31`)
      .order('date', { ascending: true })

    if (error) return res.status(500).json({ error: error.message })
    return res.json(data ?? [])
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// POST /timesheet/generate — build entries from shifts for the month
router.post('/generate', requirePermission('employees', 'edit'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch', code: 'NO_BRANCH' })

    const { month } = req.body
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month required (YYYY-MM)', code: 'VALIDATION_ERROR' })
    }

    const dateFrom = `${month}-01`
    const dateTo   = `${month}-31`

    const { data: shifts, error: shiftsErr } = await supabase
      .from('shifts')
      .select('id, employee_id, date, time_start, time_end, status, shift_checkins(*)')
      .eq('branch_id', branchId)
      .gte('date', dateFrom)
      .lte('date', dateTo)

    if (shiftsErr) return res.status(500).json({ error: shiftsErr.message })

    if (!shifts || shifts.length === 0) {
      return res.json({ inserted: 0, message: 'No shifts found for this period' })
    }

    const entries = shifts.map((s: any) => {
      let status = 'pending'
      let hours: number | null = null

      if (s.status === 'cancelled') {
        status = 'absent'
      } else if (s.shift_checkins && s.shift_checkins.length > 0) {
        const checkin = s.shift_checkins[0]
        if (s.time_start && checkin.checked_in_at) {
          const scheduledStart = new Date(`${s.date}T${s.time_start}`)
          const actualStart    = new Date(checkin.checked_in_at)
          const diffMin = (actualStart.getTime() - scheduledStart.getTime()) / 60000
          status = diffMin > 15 ? 'late' : 'present'
        } else {
          status = 'present'
        }

        if (s.time_start && s.time_end) {
          const [sh, sm] = s.time_start.split(':').map(Number)
          const [eh, em] = s.time_end.split(':').map(Number)
          hours = parseFloat(((eh * 60 + em - sh * 60 - sm) / 60).toFixed(2))
        }
      } else {
        status = 'absent'
      }

      return {
        branch_id:   branchId,
        employee_id: s.employee_id,
        date:        s.date,
        status,
        hours,
      }
    })

    const { error: upsertErr } = await supabase
      .from('timesheet')
      .upsert(entries, { onConflict: 'branch_id,employee_id,date', ignoreDuplicates: false })

    if (upsertErr) return res.status(500).json({ error: upsertErr.message })
    return res.json({ inserted: entries.length })
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// GET /timesheet/summary?month=YYYY-MM
router.get('/summary', requirePermission('employees', 'view'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch', code: 'NO_BRANCH' })

    const month = String(req.query.month ?? '')
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month param required (YYYY-MM)', code: 'VALIDATION_ERROR' })
    }

    const { data, error } = await supabase
      .from('timesheet')
      .select('employee_id, status, hours, employees(id, full_name, position)')
      .eq('branch_id', branchId)
      .gte('date', `${month}-01`)
      .lte('date', `${month}-31`)

    if (error) return res.status(500).json({ error: error.message })

    const byEmployee: Record<string, any> = {}
    for (const row of (data ?? []) as any[]) {
      const eid = row.employee_id
      if (!byEmployee[eid]) {
        byEmployee[eid] = {
          employee_id: eid,
          full_name: row.employees?.full_name ?? '',
          position:  row.employees?.position ?? '',
          present: 0, absent: 0, late: 0, partial: 0, pending: 0,
          total_hours: 0,
        }
      }
      const e = byEmployee[eid]
      e[row.status as string] = (e[row.status as string] ?? 0) + 1
      if (row.hours) e.total_hours = parseFloat((e.total_hours + row.hours).toFixed(2))
    }

    return res.json(Object.values(byEmployee))
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

export default router
