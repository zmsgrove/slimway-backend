import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { resolveBranchId } from '../utils/resolveBranchId'
import { requirePermission } from '../middleware/permission.middleware'

const router = Router()

const ALLOWED = [
  'work_time_start', 'work_time_end', 'timezone', 'currency',
  'contact_phone', 'contact_email', 'website', 'address',
  'booking_interval_min', 'max_bookings_per_day',
]

// GET /branch-settings — get settings for current branch (auto-create if missing)
router.get('/', async (req: Request, res: Response) => {
  const branchId = await resolveBranchId(req.user!)
  if (!branchId) return res.status(400).json({ error: 'Branch not resolved' })

  const { data, error } = await supabase
    .from('branch_settings')
    .select('*')
    .eq('branch_id', branchId)
    .maybeSingle()

  if (error) {
    console.error('[branch-settings GET]', error)
    return res.status(500).json({ error: error.message })
  }

  if (!data) {
    const { data: created, error: err2 } = await supabase
      .from('branch_settings')
      .insert({ branch_id: branchId })
      .select()
      .single()
    if (err2) {
      console.error('[branch-settings GET insert]', err2)
      return res.status(500).json({ error: err2.message })
    }
    return res.json(created)
  }

  return res.json(data)
})

// PATCH /branch-settings — upsert settings for current branch
router.patch('/', requirePermission('branches', 'edit'), async (req: Request, res: Response) => {
  const branchId = await resolveBranchId(req.user!)
  if (!branchId) return res.status(400).json({ error: 'Branch not resolved' })

  const body: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in req.body) body[key] = req.body[key] ?? null
  }

  const { error } = await supabase
    .from('branch_settings')
    .upsert({
      branch_id: branchId,
      ...body,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'branch_id',
    })

  if (error) {
    console.error('[branch-settings PATCH]', error)
    return res.status(500).json({ error: error.message })
  }

  return res.json({ ok: true })
})

export default router
