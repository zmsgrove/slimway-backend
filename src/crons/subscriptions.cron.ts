import cron from 'node-cron'
import { supabase } from '../config/supabase'
import { sendWhatsApp } from '../utils/sendWhatsApp'

export function startSubscriptionCron(): void {
  // Daily at 09:00 — notify clients whose subscription expires in 3 days
  cron.schedule('0 9 * * *', async () => {
    try {
      const target = new Date()
      target.setDate(target.getDate() + 3)
      const dateStr = target.toISOString().split('T')[0]

      const { data: expiring, error } = await supabase
        .from('subscriptions')
        .select('id, name, date_end, client_id')
        .eq('status', 'active')
        .eq('date_end', dateStr)
        .is('deleted_at', null)

      if (error) { console.error('[subscriptions cron] query error:', error); return }

      const clientIds = (expiring ?? []).map(s => s.client_id as string).filter(Boolean)
      if (clientIds.length === 0) return

      const { data: clients } = await supabase
        .from('clients')
        .select('id, full_name, phone')
        .in('id', clientIds)

      const clientsMap = Object.fromEntries(
        ((clients ?? []) as { id: string; full_name: string; phone: string | null }[]).map(c => [c.id, c])
      )

      for (const sub of expiring ?? []) {
        const client = clientsMap[sub.client_id as string]
        if (!client?.phone) continue
        const dateLabel = new Date((sub.date_end as string) + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
        await sendWhatsApp(
          client.phone,
          `Здравствуйте, ${client.full_name}! Ваш абонемент «${sub.name}» истекает ${dateLabel}. Не упустите момент продлить его! Ждём вас в Slimway.`
        )
      }
      console.log(`[subscriptions cron] Sent ${expiring?.length ?? 0} expiry notifications`)
    } catch (e) {
      console.error('[subscriptions cron] error:', e)
    }
  })
}
