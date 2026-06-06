import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /audit-log — supports ?entity_id=, ?entity_type=, or branch-level list
router.get('/', async (req: Request, res: Response) => {
  const { entity_id, entity_type } = req.query
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
  const offset = parseInt(req.query.offset as string) || 0

  let query = supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (entity_id) {
    query = query.eq('entity_id', entity_id as string)
  } else {
    // branch-level: scope to current branch
    const branchId = await resolveBranchId(req.user!)
    if (branchId) query = query.eq('branch_id', branchId)
  }

  if (entity_type) query = query.eq('entity_type', entity_type as string)

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ data, total: count ?? 0, limit, offset })
})

export default router
