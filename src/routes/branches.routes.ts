import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireRole } from '../middleware/role.middleware'

const router = Router()

// GET /branches — список филиалов (только owner видит все)
router.get('/', requireRole('owner', 'franchisee'), async (req: Request, res: Response) => {
  const { role, id: userId } = req.user!

  let query = supabase.from('branches').select('*').order('created_at', { ascending: true })

  if (role === 'franchisee') {
    // Франчайзи видит только свой филиал
    query = query.eq('owner_id', userId)
  }

  const { data, error } = await query

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

export default router
