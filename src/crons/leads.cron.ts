import cron from 'node-cron'
import { supabase } from '../config/supabase'
import { logAction } from '../utils/logAction'
import { fireAutomationRules } from '../utils/fireAutomationRules'

export function startLeadsCron(): void {
  // Daily at 10:00 — flag stale leads + fire lead_no_activity automation rules
  cron.schedule('0 10 * * *', async () => {
    try {
      const cutoff = new Date(Date.now() - 3 * 86400000).toISOString()

      const { data: staleLeads } = await supabase
        .from('leads')
        .select('id, branch_id, full_name, assigned_to')
        .in('status', ['new', 'in_work', 'waiting'])
        .lt('updated_at', cutoff)
        .is('archived_at', null)

      if (!staleLeads || staleLeads.length === 0) return

      const firedBranches = new Set<string>()
      for (const lead of staleLeads) {
        await logAction({
          branch_id:   lead.branch_id,
          entity_type: 'lead',
          entity_id:   lead.id,
          action:      'follow_up_reminder',
          actor_id:    'system',
          actor_name:  'system',
          details:     { lead_name: lead.full_name, assigned_to: lead.assigned_to },
        })

        if (!firedBranches.has(lead.branch_id)) {
          firedBranches.add(lead.branch_id)
          await fireAutomationRules(lead.branch_id, 'lead_no_activity', { lead_name: lead.full_name })
        }
      }

      console.log(`[leads cron] follow_up_reminder for ${staleLeads.length} stale leads`)
    } catch (e) {
      console.error('[leads cron] error:', e)
    }
  })
}
