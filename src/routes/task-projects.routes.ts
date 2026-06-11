import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()
const PRIVILEGED = ['developer', 'owner', 'franchisee']

// GET /task-projects
router.get('/', async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch' })
    const { data, error } = await supabase
      .from('task_projects')
      .select('*')
      .eq('branch_id', branchId)
      .order('name')
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data ?? [])
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// POST /task-projects
router.post('/', async (req: Request, res: Response) => {
  try {
    if (req.user!.role === 'technical') return res.status(403).json({ error: 'Forbidden' })
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch' })
    const { name, color } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name required' })
    const { data, error } = await supabase
      .from('task_projects')
      .insert({ branch_id: branchId, name: name.trim(), color: color || '#6366f1', created_by: req.user!.id })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// PATCH /task-projects/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const isPrivileged = PRIVILEGED.includes(req.user!.role)
    const { data: project } = await supabase.from('task_projects').select('created_by').eq('id', req.params.id).single()
    if (!project) return res.status(404).json({ error: 'Not found' })
    if (!isPrivileged && project.created_by !== req.user!.id) return res.status(403).json({ error: 'Forbidden' })
    const patch: Record<string, unknown> = {}
    if (req.body.name !== undefined) patch.name = req.body.name.trim()
    if (req.body.color !== undefined) patch.color = req.body.color
    const { data, error } = await supabase.from('task_projects').update(patch).eq('id', req.params.id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// DELETE /task-projects/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const isPrivileged = PRIVILEGED.includes(req.user!.role)
    const { data: project } = await supabase.from('task_projects').select('created_by').eq('id', req.params.id).single()
    if (!project) return res.status(404).json({ error: 'Not found' })
    if (!isPrivileged && project.created_by !== req.user!.id) return res.status(403).json({ error: 'Forbidden' })
    const { error } = await supabase.from('task_projects').delete().eq('id', req.params.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

export default router
