import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireRole } from '../middleware/role.middleware'

const router = Router()

// GET /branches — список филиалов
router.get('/', async (req: Request, res: Response) => {
  const { role, id: userId, branch_id } = req.user!

  let query = supabase.from('branches').select('*').order('created_at', { ascending: true })

  if (role === 'developer') {
    // developer видит все
  } else if (role === 'owner') {
    query = query.eq('owner_id', userId)
  } else if (role === 'franchisee') {
    query = query.eq('owner_id', userId)
  } else {
    // admin, staff, technical — только свой филиал
    if (!branch_id) return res.json([])
    query = query.eq('id', branch_id)
  }

  const { data, error } = await query

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// POST /branches — создать филиал (developer, owner)
router.post('/', requireRole('owner'), async (req: Request, res: Response) => {
  const { name, city, is_franchise } = req.body

  if (!name?.trim()) {
    return res.status(400).json({ error: 'name required', code: 'VALIDATION_ERROR' })
  }

  const { data, error } = await supabase
    .from('branches')
    .insert({
      name:         name.trim(),
      city:         city?.trim() || null,
      is_franchise: is_franchise ?? false,
      owner_id:     req.user!.id,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
})

// DELETE /branches/:id — только developer, требует { confirm: true }
router.delete('/:id', requireRole('developer'), async (req: Request, res: Response) => {
  if (!req.body?.confirm) {
    return res.status(400).json({ error: 'confirm: true required', code: 'VALIDATION_ERROR' })
  }
  const { error } = await supabase
    .from('branches')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true })
})

export default router
