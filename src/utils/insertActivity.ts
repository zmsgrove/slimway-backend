import { supabase } from '../config/supabase'

export async function insertActivity(
  task_id: string,
  branch_id: string,
  profile_id: string,
  action: string,
  meta: Record<string, unknown> = {}
): Promise<void> {
  try {
    await supabase.from('task_activity').insert({
      task_id,
      branch_id,
      profile_id,
      action,
      meta,
    })
  } catch (e) {
    console.error('[insertActivity]', e)
  }
}
