import { supabase } from '../config/supabase'

export async function logAction(params: {
  branch_id: string
  entity_type: string
  entity_id: string
  action: string
  actor_id: string
  actor_name: string
  details?: object
}): Promise<void> {
  try {
    const { error } = await supabase.from('audit_log').insert({
      branch_id:   params.branch_id,
      entity_type: params.entity_type,
      entity_id:   params.entity_id,
      action:      params.action,
      actor_id:    params.actor_id,
      actor_name:  params.actor_name,
      details:     params.details ?? null,
    })
    if (error) console.error('[logAction]', error.message)
  } catch (e) {
    console.error('[logAction catch]', e)
  }
}
