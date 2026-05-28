import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'

const router = Router()

// GET /audit-log?entity_id=:id
router.get('/', async (req: Request, res: Response) => {
  const { entity_id, entity_type } = req.query

  if (!entity_id) {
    return res.status(400).json({ error: 'entity_id required', code: 'VALIDATION_ERROR' })
  }

  let query = supabase
    .from('audit_log')
    .select('*')
    .eq('entity_id', entity_id as string)
    .order('created_at', { ascending: false })
    .limit(100)

  if (entity_type) query = query.eq('entity_type', entity_type as string)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

export default router
