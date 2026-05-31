import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /audit-log — supports ?entity_id=, ?entity_type=, or branch-level list
router.get('/', async (req: Request, res: Response) => {
  const { entity_id, entity_type, limit } = req.query

  let query = supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(parseInt(limit as string) || 200)

  if (entity_id) {
    query = query.eq('entity_id', entity_id as string)
  } else {
    // branch-level: scope to current branch
    const branchId = await resolveBranchId(req.user!)
    if (branchId) query = query.eq('branch_id', branchId)
  }

  if (entity_type) query = query.eq('entity_type', entity_type as string)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

export default router
