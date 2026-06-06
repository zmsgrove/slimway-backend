import cron from 'node-cron'
import { supabase } from '../config/supabase'

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

      // Fetch all currently active recurring tasks in one query (avoids N+1)
      const { data: activeCopies } = await supabase
        .from('tasks')
        .select('branch_id, title, recur_rule')
        .not('recur_rule', 'is', null)
        .not('status', 'in', '("done","closed")')

      const activeKeys = new Set(
        (activeCopies ?? []).map(
          (t: { branch_id: string; title: string; recur_rule: string }) =>
            `${t.branch_id}|${t.title}|${t.recur_rule}`
        )
      )

      const toInsert = recurring
        .filter(task => !activeKeys.has(`${task.branch_id}|${task.title}|${task.recur_rule}`))
        .map(task => ({
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
        }))

      if (toInsert.length > 0) {
        const { error } = await supabase.from('tasks').insert(toInsert)
        if (error) console.error('[tasks cron] recurring insert error:', error)
      }

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

      // Batch insert all audit log entries in one query (avoids N+1)
      const auditEntries = tasks.map(task => ({
        branch_id:   task.branch_id,
        entity_type: 'task',
        entity_id:   task.id,
        action:      'deadline_reminder',
        actor_id:    'system',
        actor_name:  'system',
        details:     { task_title: task.title, assigned_to: task.assigned_to },
      }))
      const { error: auditErr } = await supabase.from('audit_log').insert(auditEntries)
      if (auditErr) console.error('[tasks cron] deadline audit log error:', auditErr)

    } catch (e) {
      console.error('[tasks cron] deadline error:', e)
    }
  })
}
