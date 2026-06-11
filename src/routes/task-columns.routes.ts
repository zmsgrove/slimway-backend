import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /task-columns — columns for current user
router.get('/', async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch' })
    const { data, error } = await supabase
      .from('task_custom_columns')
      .select('*')
      .eq('branch_id', branchId)
      .eq('profile_id', req.user!.id)
      .order('position')
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data ?? [])
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// POST /task-columns
router.post('/', async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch' })
    const { name, color } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name required' })
    // Check max 6 per user per branch
    const { count } = await supabase
      .from('task_custom_columns')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .eq('profile_id', req.user!.id)
    if ((count ?? 0) >= 6) return res.status(400).json({ error: 'Max 6 custom columns per user', code: 'MAX_COLUMNS' })
    const { data: maxPos } = await supabase
      .from('task_custom_columns')
      .select('position')
      .eq('branch_id', branchId)
      .eq('profile_id', req.user!.id)
      .order('position', { ascending: false })
      .limit(1)
      .single()
    const position = ((maxPos?.position as number) ?? 0) + 1
    const { data, error } = await supabase
      .from('task_custom_columns')
      .insert({ branch_id: branchId, profile_id: req.user!.id, name: name.trim(), color: color || 'var(--accent)', position })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// PATCH /task-columns/reorder — массовое обновление позиций
router.patch('/reorder', async (req: Request, res: Response) => {
  try {
    const updates: Array<{ id: string; position: number }> = req.body
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'Array expected' })
    await Promise.all(
      updates.map(({ id, position }) =>
        supabase.from('task_custom_columns').update({ position }).eq('id', id).eq('profile_id', req.user!.id)
      )
    )
    return res.json({ ok: true })
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// PATCH /task-columns/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { data: col } = await supabase.from('task_custom_columns').select('profile_id').eq('id', req.params.id).single()
    if (!col) return res.status(404).json({ error: 'Not found' })
    if (col.profile_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' })
    const patch: Record<string, unknown> = {}
    if (req.body.name !== undefined) patch.name = req.body.name.trim()
    if (req.body.color !== undefined) patch.color = req.body.color
    if (req.body.position !== undefined) patch.position = req.body.position
    const { data, error } = await supabase.from('task_custom_columns').update(patch).eq('id', req.params.id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// DELETE /task-columns/:id — tasks in it get column_id = NULL
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { data: col } = await supabase.from('task_custom_columns').select('profile_id').eq('id', req.params.id).single()
    if (!col) return res.status(404).json({ error: 'Not found' })
    if (col.profile_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' })
    // Unassign tasks from this column for this user
    await supabase
      .from('task_column_assignments')
      .update({ column_id: null })
      .eq('column_id', req.params.id)
      .eq('profile_id', req.user!.id)
    const { error } = await supabase.from('task_custom_columns').delete().eq('id', req.params.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

export default router
