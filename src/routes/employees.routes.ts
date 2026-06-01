import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requirePermission } from '../middleware/permission.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'
import { CREATION_RULES } from '../config/permissions'
import type { Role } from '../config/permissions'

const router = Router()

// position → role mapping
const POSITION_ROLE: Record<string, string> = {
  manager:           'franchisee',
  franchisee:        'franchisee',
  admin:             'admin',
  staff:             'staff',
  manager_assistant: 'staff',
  technical:         'technical',
}

function composeName(first: string, last: string, middle?: string): string {
  return [last, first, middle].filter(Boolean).join(' ')
}

// GET /employees
router.get('/', requirePermission('employees', 'view'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    let query = supabase.from('employees').select('*').order('full_name')
    if (branchId) query = query.eq('branch_id', branchId)
    const { data: employees, error } = await query
    if (error) {
      console.error('[GET /employees] Supabase error:', error)
      return res.status(500).json({ error: error.message })
    }

    const profileIds = (employees ?? [])
      .map((e: Record<string, unknown>) => e.profile_id as string)
      .filter(Boolean)

    let profiles: Array<Record<string, unknown>> = []
    if (profileIds.length > 0) {
      const { data: pData, error: pError } = await supabase
        .from('profiles')
        .select('id, full_name, phone, role, theme_preference')
        .in('id', profileIds)
      if (pError) console.error('[GET /employees] profiles fetch error:', pError)
      profiles = (pData ?? []) as Array<Record<string, unknown>>
    }

    const { from, to } = req.query
    const employeeIds = (employees ?? []).map((e: Record<string, unknown>) => e.id as string)

    let shiftsData: Array<Record<string, unknown>> = []
    let tasksData:  Array<Record<string, unknown>> = []

    if (employeeIds.length > 0) {
      let shiftsQ = supabase.from('shifts').select('id, employee_id, status').in('employee_id', employeeIds)
      if (from) shiftsQ = shiftsQ.gte('date', from as string)
      if (to)   shiftsQ = shiftsQ.lte('date', to   as string)

      const [sRes, tRes] = await Promise.all([
        shiftsQ,
        supabase.from('tasks').select('id, assigned_to, status').in('assigned_to', employeeIds),
      ])
      shiftsData = (sRes.data ?? []) as Array<Record<string, unknown>>
      tasksData  = (tRes.data ?? []) as Array<Record<string, unknown>>
    }

    const result = (employees ?? []).map((emp: Record<string, unknown>) => {
      const empId = emp.id as string
      const empShifts = shiftsData.filter(s => s.employee_id === empId)
      const empTasks  = tasksData.filter(t => t.assigned_to  === empId)
      return {
        ...emp,
        profile: profiles.find((p) => p.id === emp.profile_id) ?? null,
        kpi: {
          shifts_total:     empShifts.length,
          shifts_completed: empShifts.filter(s => s.status === 'completed').length,
          tasks_total:      empTasks.length,
          tasks_done:       empTasks.filter(t => t.status === 'done' || t.status === 'closed').length,
          avg_shift_hours:  0,
        },
      }
    })

    return res.json(result)
  } catch (e: unknown) {
    console.error('[GET /employees] Unexpected error:', e)
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /employees
router.post('/', requirePermission('employees', 'create'), async (req: Request, res: Response) => {
  try {
    const actorRole = req.user!.role as Role
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch found', code: 'NO_BRANCH' })

    const {
      first_name, last_name, middle_name,
      phone, birth_date, address,
      position, department,
      email, password,
    } = req.body

    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'first_name and last_name required', code: 'VALIDATION_ERROR' })
    }
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required', code: 'VALIDATION_ERROR' })
    }
    if (!position) {
      return res.status(400).json({ error: 'position required', code: 'VALIDATION_ERROR' })
    }

    const mappedRole = (POSITION_ROLE[position] ?? 'staff') as Role

    // Проверяем, может ли actor создавать такую роль
    const allowedRoles = CREATION_RULES[actorRole] ?? []
    if (!allowedRoles.includes(mappedRole)) {
      return res.status(403).json({ error: `Недостаточно прав для создания роли ${mappedRole}`, code: 'FORBIDDEN' })
    }

    const full_name = composeName(first_name, last_name, middle_name)

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: mappedRole, branch_id: branchId },
    })
    if (authError || !authData.user) {
      return res.status(400).json({ error: authError?.message ?? 'Failed to create auth user', code: 'AUTH_ERROR' })
    }

    const userId = authData.user.id

    const { error: profileError } = await supabase.from('profiles').upsert({
      id:        userId,
      branch_id: branchId,
      role:      mappedRole,
      full_name,
      phone:     phone || null,
    })
    if (profileError) {
      await supabase.auth.admin.deleteUser(userId)
      return res.status(500).json({ error: profileError.message })
    }

    const { data: employee, error: empError } = await supabase
      .from('employees')
      .insert({
        branch_id:   branchId,
        profile_id:  userId,
        full_name,
        first_name,
        last_name,
        middle_name: middle_name || null,
        phone:       phone || null,
        birth_date:  birth_date || null,
        position:    position || null,
        department:  department || null,
        address:     address || null,
      })
      .select()
      .single()

    if (empError) {
      await supabase.auth.admin.deleteUser(userId)
      return res.status(500).json({ error: empError.message })
    }

    return res.status(201).json(employee)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// GET /employees/:id — with KPI
router.get('/:id', requirePermission('employees', 'view'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { data: emp, error } = await supabase.from('employees').select('*').eq('id', id).single()
    if (error || !emp) return res.status(404).json({ error: 'Not found' })

    const [shiftsRes, tasksRes] = await Promise.all([
      supabase.from('shifts').select('id, status, date, time_start, time_end').eq('employee_id', id),
      supabase.from('tasks').select('id, status').eq('assigned_to', id),
    ])

    const shifts     = shiftsRes.data ?? []
    const tasks      = tasksRes.data ?? []
    const completed  = shifts.filter((s: { status: string }) => s.status === 'completed')
    const tasksDone  = tasks.filter((t: { status: string }) => t.status === 'done' || t.status === 'closed')

    // avg shift duration in hours
    let avgShiftHours = 0
    if (completed.length > 0) {
      const durations = completed.map((s: { time_start: string; time_end: string }) => {
        const [sh, sm] = s.time_start.split(':').map(Number)
        const [eh, em] = s.time_end.split(':').map(Number)
        return (eh * 60 + em) - (sh * 60 + sm)
      }).filter((d: number) => d > 0)
      if (durations.length > 0) {
        avgShiftHours = Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length / 60 * 10) / 10
      }
    }

    return res.json({
      ...emp,
      kpi: {
        shifts_total:     shifts.length,
        shifts_completed: completed.length,
        tasks_total:      tasks.length,
        tasks_done:       tasksDone.length,
        avg_shift_hours:  avgShiftHours,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// PATCH /employees/:id
router.patch('/:id', requirePermission('employees', 'edit'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const branchId = await resolveBranchId(req.user!)

    const EMPLOYEE_FIELDS = [
      'full_name', 'first_name', 'last_name', 'middle_name',
      'phone', 'birth_date', 'position', 'department', 'address',
    ]
    const SALARY_FIELDS = ['base_salary', 'kpi_amount', 'sales_percent']

    const updateData: Record<string, unknown> = Object.fromEntries(
      Object.entries(req.body).filter(([key]) => EMPLOYEE_FIELDS.includes(key))
    )

    // Auto-compose full_name when name parts are provided
    const { first_name, last_name, middle_name } = req.body
    if (first_name !== undefined && last_name !== undefined) {
      updateData.full_name = composeName(first_name, last_name, middle_name)
    }

    if (Object.keys(updateData).length === 0 && !SALARY_FIELDS.some(f => f in req.body)) {
      return res.status(400).json({ error: 'No valid fields to update', code: 'VALIDATION_ERROR' })
    }

    let employee: Record<string, unknown> | null = null
    if (Object.keys(updateData).length > 0) {
      let q = supabase.from('employees').update(updateData).eq('id', id)
      if (branchId) q = q.eq('branch_id', branchId)
      const { data, error } = await q.select().single()
      if (error) {
        console.error('[PATCH /employees]', error)
        return res.status(500).json({ error: error.message })
      }
      employee = data
    } else {
      const { data } = await supabase.from('employees').select('*').eq('id', id).single()
      employee = data
    }

    // Route salary fields to employee_salary_settings
    const hasSalaryFields = SALARY_FIELDS.some(f => f in req.body)
    if (hasSalaryFields) {
      const salaryPatch: Record<string, unknown> = {
        employee_id: id,
        branch_id:   branchId ?? employee?.branch_id,
      }
      if (req.body.base_salary  !== undefined) salaryPatch.base_salary                 = req.body.base_salary
      if (req.body.kpi_amount   !== undefined) salaryPatch.kpi_subscriptions_amount     = req.body.kpi_amount
      if (req.body.sales_percent !== undefined) salaryPatch.sales_subscriptions_percent = req.body.sales_percent

      const { error: salaryErr } = await supabase
        .from('employee_salary_settings')
        .upsert(salaryPatch, { onConflict: 'employee_id' })
      if (salaryErr) {
        console.error('[PATCH /employees] salary_settings upsert error:', salaryErr)
      }
    }

    return res.json(employee)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    console.error('[PATCH /employees] unexpected:', e)
    return res.status(500).json({ error: msg })
  }
})

// PATCH /employees/:id/role — только developer
router.patch('/:id/role', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'developer') {
      return res.status(403).json({ error: 'Только developer может менять роль', code: 'FORBIDDEN' })
    }

    const { id } = req.params
    const { role, branch_id } = req.body

    if (!role) {
      return res.status(400).json({ error: 'role required', code: 'VALIDATION_ERROR' })
    }

    const validRoles: Role[] = ['owner','franchisee','admin','staff','technical','developer']
    if (!validRoles.includes(role as Role)) {
      return res.status(400).json({ error: 'Invalid role', code: 'VALIDATION_ERROR' })
    }

    // Получаем profile_id сотрудника
    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .select('profile_id')
      .eq('id', id)
      .single()

    if (empErr || !emp) return res.status(404).json({ error: 'Employee not found', code: 'NOT_FOUND' })

    const newBranchId = (branch_id && branch_id !== 'null') ? branch_id : null

    // Обновляем auth metadata
    if (emp.profile_id) {
      const { error: authErr } = await supabase.auth.admin.updateUserById(emp.profile_id as string, {
        app_metadata: { role, branch_id: newBranchId },
      })
      if (authErr) {
        console.error('[PATCH /employees/:id/role] auth.admin.updateUserById error:', authErr)
      }

      // Обновляем профиль
      const { error: profileErr } = await supabase.from('profiles').update({
        role,
        branch_id: newBranchId,
      }).eq('id', emp.profile_id as string)
      if (profileErr) {
        console.error('[PATCH /employees/:id/role] profiles.update error:', profileErr)
      }
    }

    // Обновляем запись сотрудника
    const { data, error } = await supabase
      .from('employees')
      .update({ branch_id: newBranchId })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[PATCH /employees/:id/role] employees.update error:', error)
      return res.status(500).json({ error: error.message })
    }
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    console.error('[PATCH /employees/:id/role] unexpected error:', e)
    return res.status(500).json({ error: msg })
  }
})

// DELETE /employees/:id
router.delete('/:id', requirePermission('employees', 'delete'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const { data: emp } = await supabase.from('employees').select('profile_id').eq('id', id).single()
    if (emp?.profile_id) {
      await supabase.auth.admin.deleteUser(emp.profile_id)
    }

    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

export default router
