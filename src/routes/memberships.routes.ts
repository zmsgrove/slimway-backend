import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireRole } from '../middleware/role.middleware'

const router = Router()

// GET /memberships?client_id=
router.get('/', async (req: Request, res: Response) => {
  const { client_id } = req.query
  const { branch_id } = req.user!

  let query = supabase
    .from('memberships')
    .select('*')
    .order('created_at', { ascending: false })

  if (branch_id) query = query.eq('branch_id', branch_id)
  if (client_id) query = query.eq('client_id', client_id as string)

  const { data, error } = await query

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// POST /memberships — создать абонемент
router.post('/', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const { branch_id } = req.user!
  const { client_id, type, total_sessions, start_date, end_date, price } = req.body

  if (!client_id || !type || !start_date) {
    return res.status(400).json({ error: 'client_id, type, start_date required', code: 'VALIDATION_ERROR' })
  }

  const { data, error } = await supabase
    .from('memberships')
    .insert({ client_id, branch_id, type, total_sessions, start_date, end_date, price, status: 'active' })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
})

// PATCH /memberships/:id — обновить (заморозка, продление, статус)
router.patch('/:id', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const { id } = req.params
  const { status, end_date, total_sessions } = req.body

  const { data, error } = await supabase
    .from('memberships')
    .update({ status, end_date, total_sessions })
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

export default router
