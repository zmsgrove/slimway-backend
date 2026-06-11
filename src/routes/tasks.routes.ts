import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { resolveBranchId } from '../utils/resolveBranchId'
import { logAction } from '../utils/logAction'
import { createNotification } from '../utils/createNotification'

const router = Router()

const PRIVILEGED = ['developer', 'owner', 'franchisee']

function parseObserverIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return [] } }
  return []
}

// GET /tasks
router.get('/', async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    const isPrivileged = PRIVILEGED.includes(req.user!.role)
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
    const offset = parseInt(req.query.offset as string) || 0

    let query = supabase
      .from('tasks')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (branchId) query = query.eq('branch_id', branchId)

    const { from, to, date_field } = req.query
    const dateCol = date_field === 'deadline' ? 'deadline' : 'created_at'
    if (from) query = query.gte(dateCol, `${from as string}T00:00:00`)
    if (to)   query = query.lte(dateCol, `${to as string}T23:59:59`)

    if (!isPrivileged) {
      const userId = req.user!.id
      const { data: emp } = await supabase
        .from('employees')
        .select('id')
        .eq('profile_id', userId)
        .eq('branch_id', branchId ?? '')
        .maybeSingle()

      const parts = [`created_by.eq.${userId}`, `assigned_to.eq.${userId}`]
      if (emp?.id) parts.push(`assigned_to.eq.${emp.id}`)
      parts.push(`observer_ids.cs.["${userId}"]`)
      query = query.or(parts.join(','))
    }

    const { data: tasks, error, count } = await query
    if (error) {
      console.error('[tasks GET /]', error)
      return res.status(500).json({ error: error.message, code: error.code })
    }

    const taskIds = (tasks ?? []).map((t: Record<string, unknown>) => t.id as string)

    let groups:   Array<Record<string, unknown>> = []
    let items:    Array<Record<string, unknown>> = []
    let comments: Array<Record<string, unknown>> = []

    if (taskIds.length > 0) {
      const [gRes, iRes, cRes] = await Promise.all([
        supabase.from('task_checklist_groups').select('*').in('task_id', taskIds),
        supabase.from('task_checklist_items').select('*').in('task_id', taskIds),
        supabase.from('task_comments').select('*').in('task_id', taskIds),
      ])
      groups   = (gRes.data ?? []) as Array<Record<string, unknown>>
      items    = (iRes.data ?? []) as Array<Record<string, unknown>>
      comments = (cRes.data ?? []) as Array<Record<string, unknown>>
    }

    const result = (tasks ?? []).map((t: Record<string, unknown>) => ({
      ...t,
      observer_ids:     parseObserverIds(t.observer_ids),
      checklist_groups: groups.filter(g   => g.task_id === t.id),
      checklist_items:  items.filter(i    => i.task_id === t.id),
      comments:         comments.filter(c => c.task_id === t.id),
    }))
    return res.json({ data: result, total: count ?? 0, limit, offset })
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
    const { title, description, priority, status, assigned_to, observer_ids, deadline, related_type, related_id, recur_rule, project_id } = req.body
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
        observer_ids: Array.isArray(observer_ids) ? observer_ids : [],
        deadline:     deadline || null,
        created_by:   req.user!.id,
        related_type: related_type || null,
        related_id:   related_id || null,
        recur_rule:   recur_rule || null,
        project_id:   project_id || null,
      })
      .select()
      .single()
    if (error) {
      console.error('[tasks POST /]', error)
      return res.status(500).json({ error: error.message })
    }
    const result = { ...data, observer_ids: parseObserverIds(data.observer_ids) }

    // Notify assignee
    if (assigned_to && branchId && assigned_to !== req.user!.id) {
      void createNotification({
        branch_id:    branchId,
        profile_id:   assigned_to as string,
        type:         'task.assigned',
        title:        `Задача назначена: ${(title as string).trim()}`,
        related_type: 'task',
        related_id:   (data.id as string),
      })
    }

    return res.status(201).json(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// GET /tasks/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { data: task, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', req.params.id)
      .single()
    if (error || !task) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' })

    const [gRes, iRes, cRes] = await Promise.all([
      supabase.from('task_checklist_groups').select('*').eq('task_id', req.params.id),
      supabase.from('task_checklist_items').select('*').eq('task_id', req.params.id),
      supabase.from('task_comments').select('*').eq('task_id', req.params.id),
    ])

    return res.json({
      ...task,
      observer_ids:     parseObserverIds(task.observer_ids),
      checklist_groups: gRes.data ?? [],
      checklist_items:  iRes.data ?? [],
      comments:         cRes.data ?? [],
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// PATCH /tasks/:id — only creator or privileged
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const isPrivileged = PRIVILEGED.includes(req.user!.role)
    if (!isPrivileged) {
      const { data: existing } = await supabase
        .from('tasks').select('created_by').eq('id', req.params.id).single()
      if (!existing || existing.created_by !== req.user!.id) {
        return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' })
      }
    }
    const allowed = ['title', 'description', 'priority', 'status', 'assigned_to', 'deadline', 'observer_ids', 'related_type', 'related_id', 'recur_rule', 'project_id']
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
    return res.json({ ...data, observer_ids: parseObserverIds(data.observer_ids) })
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

// PATCH /tasks/:id/status
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body
    const valid = ['new', 'today', 'week', 'long', 'done', 'closed', 'pending_close', 'in_progress', 'waiting', 'review', 'cancelled']
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' })

    const { data: task, error: taskErr } = await supabase
      .from('tasks').select('*').eq('id', req.params.id).single()
    if (taskErr || !task) return res.status(404).json({ error: 'Not found' })

    const isPrivileged = PRIVILEGED.includes(req.user!.role)
    const isCreator    = task.created_by === req.user!.id

    let isAssignee = false
    if (!isPrivileged && !isCreator && task.assigned_to) {
      const { data: emp } = await supabase
        .from('employees').select('id').eq('profile_id', req.user!.id).maybeSingle()
      isAssignee = emp?.id === task.assigned_to
    }

    if (!isPrivileged && !isCreator && !isAssignee) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' })
    }

    let actualStatus = status
    if (status === 'closed' && !isPrivileged && !isCreator && isAssignee) {
      actualStatus = 'pending_close'
      const { data: profile } = await supabase
        .from('profiles').select('full_name').eq('id', req.user!.id).single()
      await logAction({
        branch_id:   task.branch_id,
        entity_type: 'task',
        entity_id:   req.params.id,
        action:      'request_close',
        actor_id:    req.user!.id,
        actor_name:  profile?.full_name ?? req.user!.email,
        details:     { task_title: task.title },
      })
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({ status: actualStatus, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ...data, observer_ids: parseObserverIds(data.observer_ids) })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /tasks/:id/confirm-close — creator or privileged
router.post('/:id/confirm-close', async (req: Request, res: Response) => {
  try {
    const { data: task, error: taskErr } = await supabase
      .from('tasks').select('*').eq('id', req.params.id).single()
    if (taskErr || !task) return res.status(404).json({ error: 'Not found' })

    const isPrivileged = PRIVILEGED.includes(req.user!.role)
    if (!isPrivileged && task.created_by !== req.user!.id) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' })
    }
    if (task.status !== 'pending_close') {
      return res.status(400).json({ error: 'Task is not pending close', code: 'INVALID_STATE' })
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ...data, observer_ids: parseObserverIds(data.observer_ids) })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /tasks/:id/checklists
router.post('/:id/checklists', async (req: Request, res: Response) => {
  try {
    const { text, group_id } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'text required' })
    const { data, error } = await supabase
      .from('task_checklist_items')
      .insert({ task_id: req.params.id, text: text.trim(), is_done: false, group_id: group_id || null })
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

// POST /tasks/:id/checklist-groups
router.post('/:id/checklist-groups', async (req: Request, res: Response) => {
  try {
    const { title } = req.body
    if (!title?.trim()) return res.status(400).json({ error: 'title required' })
    const { data, error } = await supabase
      .from('task_checklist_groups')
      .insert({ task_id: req.params.id, title: title.trim() })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /tasks/:id/checklist-groups/:gid/items
router.post('/:id/checklist-groups/:gid/items', async (req: Request, res: Response) => {
  try {
    const { text } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'text required' })
    const { data, error } = await supabase
      .from('task_checklist_items')
      .insert({ task_id: req.params.id, group_id: req.params.gid, text: text.trim(), is_done: false })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// DELETE /tasks/:id/checklist-groups/:gid
router.delete('/:id/checklist-groups/:gid', async (req: Request, res: Response) => {
  try {
    const { error } = await supabase
      .from('task_checklist_groups')
      .delete()
      .eq('id', req.params.gid)
      .eq('task_id', req.params.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
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

// PATCH /tasks/:id/comments/:cid
router.patch('/:id/comments/:cid', async (req: Request, res: Response) => {
  try {
    const { text } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'text required' })
    const { data: comment } = await supabase.from('task_comments').select('author_id').eq('id', req.params.cid).single()
    if (!comment) return res.status(404).json({ error: 'Not found' })
    const isPrivileged = PRIVILEGED.includes(req.user!.role)
    if (!isPrivileged && comment.author_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' })
    const { data, error } = await supabase.from('task_comments').update({ text: text.trim() }).eq('id', req.params.cid).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) { return res.status(500).json({ error: e instanceof Error ? e.message : 'ISE' }) }
})
router.delete('/:id/comments/:cid', async (req: Request, res: Response) => {
  try {
    const { data: comment } = await supabase.from('task_comments').select('author_id').eq('id', req.params.cid).single()
    if (!comment) return res.status(404).json({ error: 'Not found' })
    const isPrivileged = PRIVILEGED.includes(req.user!.role)
    if (!isPrivileged && comment.author_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' })
    await supabase.from('task_comments').delete().eq('id', req.params.cid)
    return res.status(204).send()
  } catch (e: unknown) { return res.status(500).json({ error: e instanceof Error ? e.message : 'ISE' }) }
})
router.post('/:id/observers', async (req: Request, res: Response) => {
  try {
    const { profile_id } = req.body
    if (!profile_id) return res.status(400).json({ error: 'profile_id required' })
    const { data: task } = await supabase.from('tasks').select('branch_id').eq('id', req.params.id).single()
    if (!task) return res.status(404).json({ error: 'Not found' })
    const { data, error } = await supabase.from('task_observers').upsert({ task_id: req.params.id, profile_id, branch_id: task.branch_id }, { onConflict: 'task_id,profile_id' }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) { return res.status(500).json({ error: e instanceof Error ? e.message : 'ISE' }) }
})
router.delete('/:id/observers/:profileId', async (req: Request, res: Response) => {
  try {
    const isPrivileged = PRIVILEGED.includes(req.user!.role)
    const { data: task } = await supabase.from('tasks').select('created_by').eq('id', req.params.id).single()
    if (!isPrivileged && req.user!.id !== req.params.profileId && task?.created_by !== req.user!.id) return res.status(403).json({ error: 'Forbidden' })
    await supabase.from('task_observers').delete().eq('task_id', req.params.id).eq('profile_id', req.params.profileId)
    return res.status(204).send()
  } catch (e: unknown) { return res.status(500).json({ error: e instanceof Error ? e.message : 'ISE' }) }
})
router.patch('/:id/column', async (req: Request, res: Response) => {
  try {
    const { column_id, position } = req.body
    const { data: task } = await supabase.from('tasks').select('branch_id').eq('id', req.params.id).single()
    if (!task) return res.status(404).json({ error: 'Not found' })
    const { data, error } = await supabase.from('task_column_assignments').upsert({ task_id: req.params.id, profile_id: req.user!.id, branch_id: task.branch_id, column_id: column_id ?? null, position: position ?? 0 }, { onConflict: 'task_id,profile_id' }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) { return res.status(500).json({ error: e instanceof Error ? e.message : 'ISE' }) }
})
router.get('/:id/activity', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.from('task_activity').select('*, profiles:profile_id(full_name)').eq('task_id', req.params.id).order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data ?? [])
  } catch (e: unknown) { return res.status(500).json({ error: e instanceof Error ? e.message : 'ISE' }) }
})
router.get('/:id/attachments', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.from('task_attachments').select('*').eq('task_id', req.params.id).order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data ?? [])
  } catch (e: unknown) { return res.status(500).json({ error: e instanceof Error ? e.message : 'ISE' }) }
})
router.post('/:id/attachments', async (req: Request, res: Response) => {
  try {
    const { name, url, size, mime_type } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name required' })
    const { data: task } = await supabase.from('tasks').select('branch_id').eq('id', req.params.id).single()
    if (!task) return res.status(404).json({ error: 'Not found' })
    const { data, error } = await supabase.from('task_attachments').insert({ task_id: req.params.id, branch_id: task.branch_id, name: name.trim(), url: url || null, size: size || null, mime_type: mime_type || null, uploaded_by: req.user!.id }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) { return res.status(500).json({ error: e instanceof Error ? e.message : 'ISE' }) }
})
router.delete('/:id/attachments/:aid', async (req: Request, res: Response) => {
  try {
    await supabase.from('task_attachments').delete().eq('id', req.params.aid).eq('task_id', req.params.id)
    return res.status(204).send()
  } catch (e: unknown) { return res.status(500).json({ error: e instanceof Error ? e.message : 'ISE' }) }
})
router.delete('/:id/checklists/:item_id', async (req: Request, res: Response) => {
  try {
    await supabase.from('task_checklist_items').delete().eq('id', req.params.item_id).eq('task_id', req.params.id)
    return res.status(204).send()
  } catch (e: unknown) { return res.status(500).json({ error: e instanceof Error ? e.message : 'ISE' }) }
})
export default router
