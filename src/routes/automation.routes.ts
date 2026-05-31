import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requirePermission } from '../middleware/permission.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /automation
router.get('/', requirePermission('settings', 'view'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    const { data, error } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data ?? [])
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// POST /automation
router.post('/', requirePermission('settings', 'edit'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    const { trigger, trigger_days, task_title_template, task_priority, assign_to_role } = req.body
    if (!trigger || !task_title_template || !assign_to_role) {
      return res.status(400).json({ error: 'trigger, task_title_template, assign_to_role required', code: 'VALIDATION_ERROR' })
    }
    const { data, error } = await supabase
      .from('automation_rules')
      .insert({
        branch_id: branchId,
        trigger,
        trigger_days: trigger_days ?? null,
        task_title_template,
        task_priority: task_priority ?? 'medium',
        assign_to_role,
        is_active: true,
      })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// PATCH /automation/:id
router.patch('/:id', requirePermission('settings', 'edit'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { trigger, trigger_days, task_title_template, task_priority, assign_to_role, is_active } = req.body
    const patch: Record<string, unknown> = {}
    if (trigger             !== undefined) patch.trigger              = trigger
    if (trigger_days        !== undefined) patch.trigger_days         = trigger_days
    if (task_title_template !== undefined) patch.task_title_template  = task_title_template
    if (task_priority       !== undefined) patch.task_priority        = task_priority
    if (assign_to_role      !== undefined) patch.assign_to_role       = assign_to_role
    if (is_active           !== undefined) patch.is_active            = is_active
    const { data, error } = await supabase
      .from('automation_rules')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// DELETE /automation/:id
router.delete('/:id', requirePermission('settings', 'edit'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { error } = await supabase.from('automation_rules').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

export default router
