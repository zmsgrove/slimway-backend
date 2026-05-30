import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requirePermission } from '../middleware/permission.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /shifts
router.get('/', requirePermission('shifts', 'view'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    const { week_start, week_end, employee_id } = req.query

    let query = supabase
      .from('shifts')
      .select('*, employees(id, full_name, position, department), shift_checkins(*)')
      .order('date')
      .order('time_start')

    if (branchId)    query = query.eq('branch_id', branchId)
    if (week_start)  query = query.gte('date', week_start as string)
    if (week_end)    query = query.lte('date', week_end as string)
    if (employee_id) query = query.eq('employee_id', employee_id as string)

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /shifts
router.post('/', requirePermission('shifts', 'create'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch found', code: 'NO_BRANCH' })
    const { employee_id, date, time_start, time_end } = req.body
    if (!employee_id || !date || !time_start || !time_end) {
      return res.status(400).json({ error: 'employee_id, date, time_start, time_end required', code: 'VALIDATION_ERROR' })
    }
    const { data, error } = await supabase
      .from('shifts')
      .insert({ branch_id: branchId, employee_id, date, time_start, time_end, status: 'scheduled' })
      .select('*, employees(id, full_name)')
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /shifts/bulk
router.post('/bulk', requirePermission('shifts', 'create'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch found', code: 'NO_BRANCH' })

    const { shifts } = req.body as {
      shifts?: Array<{ employee_id: string; date: string; time_start: string; time_end: string; status?: string }>
    }
    if (!Array.isArray(shifts) || shifts.length === 0) {
      return res.status(400).json({ error: 'shifts array required', code: 'VALIDATION_ERROR' })
    }

    const employeeIds = [...new Set(shifts.map(s => s.employee_id))]
    const dates       = [...new Set(shifts.map(s => s.date))]

    const { data: existing } = await supabase
      .from('shifts')
      .select('employee_id, date')
      .in('employee_id', employeeIds)
      .in('date', dates)

    const existingKeys = new Set((existing ?? []).map(e => `${e.employee_id}|${e.date}`))

    const toInsert = shifts
      .filter(s => !existingKeys.has(`${s.employee_id}|${s.date}`))
      .map(s => ({
        branch_id:   branchId,
        employee_id: s.employee_id,
        date:        s.date,
        time_start:  s.time_start,
        time_end:    s.time_end,
        status:      s.status ?? 'scheduled',
      }))

    if (toInsert.length === 0) return res.json([])

    const { data, error } = await supabase
      .from('shifts')
      .insert(toInsert)
      .select('*, employees(id, full_name, position)')

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// PATCH /shifts/:id
router.patch('/:id', requirePermission('shifts', 'edit'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { time_start, time_end, status, date } = req.body
    const patch: Record<string, unknown> = {}
    if (time_start !== undefined) patch.time_start = time_start
    if (time_end   !== undefined) patch.time_end   = time_end
    if (status     !== undefined) patch.status     = status
    if (date       !== undefined) patch.date       = date
    const { data, error } = await supabase.from('shifts').update(patch).eq('id', id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// DELETE /shifts/:id
router.delete('/:id', requirePermission('shifts', 'delete'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { error } = await supabase.from('shifts').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /shifts/:id/checkin
router.post('/:id/checkin', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const branchId = await resolveBranchId(req.user!)
    const { location, is_own_shift = true } = req.body

    const { data: shift, error: shiftErr } = await supabase
      .from('shifts').select('*').eq('id', id).single()
    if (shiftErr || !shift) return res.status(404).json({ error: 'Shift not found', code: 'NOT_FOUND' })

    const { data: checkin, error: checkinErr } = await supabase
      .from('shift_checkins')
      .insert({
        shift_id:    id,
        employee_id: shift.employee_id,
        branch_id:   branchId ?? shift.branch_id,
        checkin_at:  new Date().toISOString(),
        is_own_shift,
        location:    location ?? null,
      })
      .select()
      .single()

    if (checkinErr) return res.status(500).json({ error: checkinErr.message })

    await supabase.from('shifts').update({ status: 'active' }).eq('id', id)

    return res.status(201).json(checkin)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /shifts/:id/checkout
router.post('/:id/checkout', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const { data: checkin, error: checkinErr } = await supabase
      .from('shift_checkins')
      .select('*')
      .eq('shift_id', id)
      .is('checkout_at', null)
      .single()

    if (checkinErr || !checkin) return res.status(404).json({ error: 'Active checkin not found', code: 'NOT_FOUND' })

    const { data, error } = await supabase
      .from('shift_checkins')
      .update({ checkout_at: new Date().toISOString() })
      .eq('id', checkin.id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })

    await supabase.from('shifts').update({ status: 'completed' }).eq('id', id)

    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

export default router
