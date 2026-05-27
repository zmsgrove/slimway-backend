import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireRole } from '../middleware/role.middleware'

const router = Router()

// GET /schedule?from=&to=
router.get('/', async (req: Request, res: Response) => {
  const { branch_id } = req.user!
  const { from, to } = req.query

  let query = supabase
    .from('schedule')
    .select('*, profiles(full_name), bookings(id, status, client_id)')
    .order('starts_at', { ascending: true })

  if (branch_id) query = query.eq('branch_id', branch_id)
  if (from) query = query.gte('starts_at', from as string)
  if (to) query = query.lte('starts_at', to as string)

  const { data, error } = await query

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// POST /schedule — создать тренировку
router.post('/', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const { branch_id } = req.user!
  const { trainer_id, title, starts_at, duration_min, capacity } = req.body

  if (!title || !starts_at) {
    return res.status(400).json({ error: 'title, starts_at required', code: 'VALIDATION_ERROR' })
  }

  const { data, error } = await supabase
    .from('schedule')
    .insert({ branch_id, trainer_id, title, starts_at, duration_min: duration_min || 60, capacity: capacity || 10 })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
})

// DELETE /schedule/:id
router.delete('/:id', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const { id } = req.params

  const { error } = await supabase.from('schedule').delete().eq('id', id)

  if (error) return res.status(500).json({ error: error.message })
  return res.status(204).send()
})

export default router
