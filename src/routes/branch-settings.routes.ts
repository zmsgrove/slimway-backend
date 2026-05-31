import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { resolveBranchId } from '../utils/resolveBranchId'
import { requirePermission } from '../middleware/permission.middleware'

const router = Router()

// GET /branch-settings — get settings for current branch (upsert on missing)
router.get('/', async (req: Request, res: Response) => {
  const branchId = await resolveBranchId(req.user!)
  if (!branchId) return res.status(400).json({ error: 'Branch not resolved' })

  const { data, error } = await supabase
    .from('branch_settings')
    .select('*')
    .eq('branch_id', branchId)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })

  if (!data) {
    // auto-create default row
    const { data: created, error: err2 } = await supabase
      .from('branch_settings')
      .insert({ branch_id: branchId })
      .select()
      .single()
    if (err2) return res.status(500).json({ error: err2.message })
    return res.json(created)
  }

  return res.json(data)
})

// PATCH /branch-settings — update settings for current branch
router.patch('/', requirePermission('branches', 'edit'), async (req: Request, res: Response) => {
  const branchId = await resolveBranchId(req.user!)
  if (!branchId) return res.status(400).json({ error: 'Branch not resolved' })

  const ALLOWED = [
    'working_hours_start', 'working_hours_end', 'timezone', 'currency',
    'contact_phone', 'contact_email', 'website', 'address',
    'booking_interval_min', 'max_bookings_per_day',
  ]

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of ALLOWED) {
    if (key in req.body) updates[key] = req.body[key] ?? null
  }

  const { data, error } = await supabase
    .from('branch_settings')
    .upsert({ ...updates, branch_id: branchId }, { onConflict: 'branch_id' })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

export default router
