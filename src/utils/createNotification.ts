import { supabase } from '../config/supabase'

interface CreateNotificationParams {
  branch_id: string
  profile_id: string
  type: string
  title: string
  body?: string | null
  related_type?: string | null
  related_id?: string | null
}

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('notification_settings')
      .eq('id', params.profile_id)
      .single()

    const settings = (profile?.notification_settings as { disabledTypes?: string[] } | null) ?? {}
    const disabledTypes: string[] = settings.disabledTypes ?? []

    if (params.type !== 'system.update' && disabledTypes.includes(params.type)) {
      return
    }

    await supabase.from('notifications').insert({
      branch_id:    params.branch_id,
      profile_id:   params.profile_id,
      type:         params.type,
      title:        params.title,
      body:         params.body ?? null,
      related_type: params.related_type ?? null,
      related_id:   params.related_id ?? null,
      is_read:      false,
    })
  } catch (err) {
    console.error('[createNotification]', err)
  }
}
