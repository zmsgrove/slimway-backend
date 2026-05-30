import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireRole } from '../middleware/role.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /clients — список клиентов филиала
router.get('/', async (req: Request, res: Response) => {
  const { branch_id } = req.user!
  const { search } = req.query

  let query = supabase
    .from('clients')
    .select('*, memberships(id, status, end_date, used_sessions, total_sessions)')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })

  if (branch_id) query = query.eq('branch_id', branch_id)
  if (search) query = query.ilike('full_name', `%${search}%`)

  const { data, error } = await query

  if (error) {
    console.error('Supabase error:', error)
    return res.status(500).json({ error: error.message, details: error })
  }
  return res.json(data)
})

// GET /clients/:id — карточка клиента
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const { branch_id } = req.user!

  let query = supabase
    .from('clients')
    .select('*, memberships(*), bookings(*, schedule(*))')
    .eq('id', id)
    .eq('is_deleted', false)
    .single()

  if (branch_id) query = (query as any).eq('branch_id', branch_id)

  const { data, error } = await query

  if (error) return res.status(404).json({ error: 'Client not found', code: 'NOT_FOUND' })
  return res.json(data)
})

// POST /clients — создать клиента
router.post('/', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const branchId = await resolveBranchId(req.user!)
  const { full_name, phone, email, birth_date, notes, source, tags } = req.body

  if (!full_name) return res.status(400).json({ error: 'full_name is required', code: 'VALIDATION_ERROR' })

  const { data, error } = await supabase
    .from('clients')
    .insert({ full_name, phone, email, birth_date, notes, source: source || null, tags: tags || null, branch_id: branchId })
    .select()
    .single()

  if (error) {
    console.error('Supabase error:', error)
    return res.status(500).json({ error: error.message, details: error })
  }
  return res.status(201).json(data)
})

// PATCH /clients/:id — обновить клиента
router.patch('/:id', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const { id } = req.params
  const { full_name, phone, email, birth_date, notes, status, tags, source, avatar_url } = req.body

  const patch: Record<string, unknown> = {}
  if (full_name   !== undefined) patch.full_name   = full_name
  if (phone       !== undefined) patch.phone       = phone
  if (email       !== undefined) patch.email       = email
  if (birth_date  !== undefined) patch.birth_date  = birth_date
  if (notes       !== undefined) patch.notes       = notes
  if (status      !== undefined) patch.status      = status
  if (tags        !== undefined) patch.tags        = tags
  if (source      !== undefined) patch.source      = source
  if (avatar_url  !== undefined) patch.avatar_url  = avatar_url

  const { data, error } = await supabase
    .from('clients')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Supabase error:', error)
    return res.status(500).json({ error: error.message, details: error })
  }
  return res.json(data)
})

// DELETE /clients/:id — soft delete
router.delete('/:id', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const { id } = req.params

  const { error } = await supabase
    .from('clients')
    .update({ is_deleted: true })
    .eq('id', id)

  if (error) {
    console.error('Supabase error:', error)
    return res.status(500).json({ error: error.message, details: error })
  }
  return res.status(204).send()
})

export default router
