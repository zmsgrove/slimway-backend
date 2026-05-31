import cron from 'node-cron'
import { supabase } from '../config/supabase'
import { logAction } from '../utils/logAction'

export function startTasksCron(): void {
  // Daily at 08:00 — spawn new instances of recurring tasks that were completed
  cron.schedule('0 8 * * *', async () => {
    try {
      const { data: recurring } = await supabase
        .from('tasks')
        .select('*')
        .not('recur_rule', 'is', null)
        .in('status', ['done', 'closed'])

      if (!recurring || recurring.length === 0) return

      for (const task of recurring) {
        const { data: existing } = await supabase
          .from('tasks')
          .select('id')
          .eq('branch_id', task.branch_id)
          .eq('title', task.title)
          .eq('recur_rule', task.recur_rule)
          .not('status', 'in', '("done","closed")')
          .maybeSingle()

        if (existing) continue // already an active copy

        await supabase.from('tasks').insert({
          branch_id:    task.branch_id,
          title:        task.title,
          description:  task.description,
          priority:     task.priority,
          status:       'new',
          assigned_to:  task.assigned_to,
          observer_ids: task.observer_ids,
          created_by:   task.created_by,
          recur_rule:   task.recur_rule,
          related_type: task.related_type,
          related_id:   task.related_id,
        })
      }

      console.log(`[tasks cron] recurring: processed ${recurring.length} tasks`)
    } catch (e) {
      console.error('[tasks cron] recurring error:', e)
    }
  })

  // Hourly — deadline reminders for tasks due in the next 1 hour
  cron.schedule('0 * * * *', async () => {
    try {
      const now   = new Date()
      const in1h  = new Date(now.getTime() + 3600000)
      const fromStr = now.toISOString()
      const toStr   = in1h.toISOString()

      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, branch_id, title, assigned_to')
        .not('deadline', 'is', null)
        .gte('deadline', fromStr)
        .lte('deadline', toStr)
        .not('status', 'in', '("done","closed","pending_close")')

      if (!tasks || tasks.length === 0) return

      for (const task of tasks) {
        await logAction({
          branch_id:   task.branch_id,
          entity_type: 'task',
          entity_id:   task.id,
          action:      'deadline_reminder',
          actor_id:    'system',
          actor_name:  'system',
          details:     { task_title: task.title, assigned_to: task.assigned_to },
        })
      }

      console.log(`[tasks cron] deadline_reminder logged for ${tasks.length} tasks`)
    } catch (e) {
      console.error('[tasks cron] deadline error:', e)
    }
  })
}
