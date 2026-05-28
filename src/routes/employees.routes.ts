import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireRole } from '../middleware/role.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

const POSITION_ROLE: Record<string, string> = {
  manager:   'franchisee',
  staff:     'admin',
  technical: 'technical',
}

function composeName(first: string, last: string, middle?: string): string {
  return [last, first, middle].filter(Boolean).join(' ')
}

// GET /employees
router.get('/', async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    let query = supabase.from('employees').select('*').order('full_name')
    if (branchId) query = query.eq('branch_id', branchId)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /employees — создать сотрудника с auth-аккаунтом
router.post('/', requireRole('owner', 'franchisee'), async (req: Request, res: Response) => {
  try {
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

    const mappedRole = POSITION_ROLE[position] ?? 'admin'
    const full_name  = composeName(first_name, last_name, middle_name)

    // 1. Create auth user
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

    // 2. Create profile
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

    // 3. Create employee
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

// PATCH /employees/:id
router.patch('/:id', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { first_name, last_name, middle_name, full_name, phone, birth_date, position, department, address } = req.body
    const patch: Record<string, unknown> = {}
    if (full_name    !== undefined) patch.full_name    = full_name
    if (first_name   !== undefined) patch.first_name   = first_name
    if (last_name    !== undefined) patch.last_name    = last_name
    if (middle_name  !== undefined) patch.middle_name  = middle_name
    if (phone        !== undefined) patch.phone        = phone
    if (birth_date   !== undefined) patch.birth_date   = birth_date
    if (position     !== undefined) patch.position     = position
    if (department   !== undefined) patch.department   = department
    if (address      !== undefined) patch.address      = address

    // Recompute full_name if name parts provided
    if (first_name !== undefined && last_name !== undefined) {
      patch.full_name = composeName(first_name, last_name, middle_name)
    }

    const { data, error } = await supabase.from('employees').update(patch).eq('id', id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// DELETE /employees/:id — только owner и franchisee
router.delete('/:id', requireRole('owner', 'franchisee'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Remove auth user if exists
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
