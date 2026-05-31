import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /suppliers
router.get('/', async (req: Request, res: Response) => {
  try {
    const { branch_id } = req.user!
    let query = supabase.from('suppliers').select('*').order('name')
    if (branch_id) query = query.eq('branch_id', branch_id)
    const { data, error } = await query
    if (error) {
      console.error('[GET /suppliers] Supabase error (table may not exist):', error)
      return res.status(500).json({ error: error.message, code: 'DB_ERROR' })
    }
    return res.json(data ?? [])
  } catch (e: unknown) {
    console.error('[GET /suppliers] Unexpected error:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// POST /suppliers
router.post('/', async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    const { name, phone, email, notes } = req.body
    if (!name) return res.status(400).json({ error: 'name required', code: 'VALIDATION_ERROR' })
    const { data, error } = await supabase
      .from('suppliers')
      .insert({ branch_id: branchId, name, phone: phone || null, email: email || null, notes: notes || null })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// PATCH /suppliers/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, phone, email, notes } = req.body
    const patch: Record<string, unknown> = {}
    if (name  !== undefined) patch.name  = name
    if (phone !== undefined) patch.phone = phone
    if (email !== undefined) patch.email = email
    if (notes !== undefined) patch.notes = notes
    const { data, error } = await supabase.from('suppliers').update(patch).eq('id', id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// DELETE /suppliers/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { error } = await supabase.from('suppliers').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

export default router
