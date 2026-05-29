import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

function parseObserverIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return [] } }
  return []
}

// GET /tasks
router.get('/', async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    let query = supabase
      .from('tasks')
      .select(`*, task_checklist_items(*), task_comments(*)`)
      .order('created_at', { ascending: false })
    if (branchId) query = query.eq('branch_id', branchId)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    const result = (data || []).map((t: Record<string, unknown>) => ({ ...t, observer_ids: parseObserverIds(t.observer_ids) }))
    return res.json(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /tasks
router.post('/', async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch', code: 'NO_BRANCH' })
    const { title, description, priority, status, assigned_to, observer_ids, deadline } = req.body
    if (!title?.trim()) return res.status(400).json({ error: 'title required', code: 'VALIDATION_ERROR' })
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        branch_id:    branchId,
        title:        title.trim(),
        description:  description?.trim() || null,
        priority:     priority || 'medium',
        status:       status || 'new',
        assigned_to:  assigned_to || null,
        observer_ids: JSON.stringify(Array.isArray(observer_ids) ? observer_ids : []),
        deadline:     deadline || null,
        created_by:   req.user!.id,
      })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    const result = { ...data, observer_ids: Array.isArray(data.observer_ids) ? data.observer_ids : (typeof data.observer_ids === 'string' ? JSON.parse(data.observer_ids) : []) }
    return res.status(201).json(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// GET /tasks/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select(`*, task_checklist_items(*), task_comments(*)`)
      .eq('id', req.params.id)
      .single()
    if (error || !data) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' })
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// PATCH /tasks/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const allowed = ['title', 'description', 'priority', 'status', 'assigned_to', 'deadline']
    const patch: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in req.body) patch[key] = req.body[key]
    }
    const { data, error } = await supabase
      .from('tasks')
      .update(patch)
      .eq('id', req.params.id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// DELETE /tasks/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { error } = await supabase.from('tasks').delete().eq('id', req.params.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /tasks/:id/checklists
router.post('/:id/checklists', async (req: Request, res: Response) => {
  try {
    const { text } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'text required' })
    const { data, error } = await supabase
      .from('task_checklist_items')
      .insert({ task_id: req.params.id, text: text.trim(), is_done: false })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// PATCH /tasks/:id/checklists/:item_id
router.patch('/:id/checklists/:item_id', async (req: Request, res: Response) => {
  try {
    const { is_done, text } = req.body
    const patch: Record<string, unknown> = {}
    if (is_done !== undefined) patch.is_done = is_done
    if (text !== undefined) patch.text = text
    const { data, error } = await supabase
      .from('task_checklist_items')
      .update(patch)
      .eq('id', req.params.item_id)
      .eq('task_id', req.params.id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /tasks/:id/comments
router.post('/:id/comments', async (req: Request, res: Response) => {
  try {
    const { text } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'text required' })
    const { data, error } = await supabase
      .from('task_comments')
      .insert({ task_id: req.params.id, author_id: req.user!.id, text: text.trim() })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// PATCH /tasks/:id/status
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body
    const valid = ['new', 'today', 'week', 'long', 'done']
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' })
    const { data, error } = await supabase
      .from('tasks')
      .update({ status })
      .eq('id', req.params.id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

export default router
