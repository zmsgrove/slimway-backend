import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireRole } from '../middleware/role.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /departments
router.get('/', async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    let query = supabase.from('departments').select('*').order('name')
    if (branchId) query = query.eq('branch_id', branchId)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /departments
router.post('/', requireRole('owner', 'franchisee'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch', code: 'NO_BRANCH' })
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name required', code: 'VALIDATION_ERROR' })
    const { data, error } = await supabase
      .from('departments')
      .insert({ branch_id: branchId, name: name.trim() })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// DELETE /departments/:id
router.delete('/:id', requireRole('owner', 'franchisee'), async (req: Request, res: Response) => {
  try {
    const { error } = await supabase.from('departments').delete().eq('id', req.params.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

export default router
