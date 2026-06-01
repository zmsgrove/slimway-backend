import { supabase } from '../config/supabase'

type TriggerType = 'lead_created' | 'lead_no_activity' | 'subscription_expiring'

export async function fireAutomationRules(
  branchId: string,
  triggerType: TriggerType,
  titleContext: Record<string, string> = {},
): Promise<void> {
  const { data: rules, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('branch_id', branchId)
    .eq('trigger_type', triggerType)
    .eq('is_active', true)

  if (error || !rules || rules.length === 0) return

  for (const rule of rules) {
    let assignedTo: string | null = null

    if (rule.assign_to_role) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('branch_id', branchId)
        .eq('role', rule.assign_to_role)
        .limit(1)
        .maybeSingle()
      assignedTo = (profile?.id as string) ?? null
    }

    let title = String(rule.task_title_template ?? '')
    for (const [k, v] of Object.entries(titleContext)) {
      title = title.split(`{{${k}}}`).join(v)
    }

    const { error: insertErr } = await supabase.from('tasks').insert({
      branch_id:    branchId,
      title,
      priority:     rule.task_priority ?? 'medium',
      status:       'new',
      assigned_to:  assignedTo,
      observer_ids: [],
      created_by:   null,
      is_auto:      true,
    })

    if (insertErr) {
      console.error(`[fireAutomationRules] insert task error (rule ${rule.id}):`, insertErr)
    }
  }
}
