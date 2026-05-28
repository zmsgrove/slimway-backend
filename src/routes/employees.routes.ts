import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireRole } from '../middleware/role.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

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

// POST /employees
router.post('/', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch found', code: 'NO_BRANCH' })
    const { full_name, phone, birth_date, position, department, profile_id } = req.body
    if (!full_name) return res.status(400).json({ error: 'full_name required', code: 'VALIDATION_ERROR' })
    const { data, error } = await supabase
      .from('employees')
      .insert({ branch_id: branchId, full_name, phone: phone || null, birth_date: birth_date || null, position: position || null, department: department || null, profile_id: profile_id || null })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// PATCH /employees/:id
router.patch('/:id', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { full_name, phone, birth_date, position, department } = req.body
    const patch: Record<string, unknown> = {}
    if (full_name  !== undefined) patch.full_name  = full_name
    if (phone      !== undefined) patch.phone      = phone
    if (birth_date !== undefined) patch.birth_date = birth_date
    if (position   !== undefined) patch.position   = position
    if (department !== undefined) patch.department = department
    const { data, error } = await supabase.from('employees').update(patch).eq('id', id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// DELETE /employees/:id
router.delete('/:id', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

export default router
