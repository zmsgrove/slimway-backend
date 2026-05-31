import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requirePermission } from '../middleware/permission.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /api/v1/booking-link
router.get('/', requirePermission('settings', 'view'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch', code: 'NO_BRANCH' })

    const { data, error } = await supabase
      .from('booking_links')
      .select('*')
      .eq('branch_id', branchId)
      .single()

    if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message })
    return res.json(data ?? null)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// POST /api/v1/booking-link — create or update
router.post('/', requirePermission('settings', 'edit'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch', code: 'NO_BRANCH' })

    const { slug, is_active } = req.body
    if (!slug?.trim()) return res.status(400).json({ error: 'slug required', code: 'VALIDATION_ERROR' })

    const cleanSlug = String(slug).toLowerCase().replace(/[^a-z0-9-]/g, '').trim()
    if (!cleanSlug) return res.status(400).json({ error: 'Invalid slug', code: 'VALIDATION_ERROR' })

    const { data, error } = await supabase
      .from('booking_links')
      .upsert({ branch_id: branchId, slug: cleanSlug, is_active: is_active ?? true }, { onConflict: 'branch_id' })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Slug already taken', code: 'SLUG_TAKEN' })
      return res.status(500).json({ error: error.message })
    }
    return res.json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// PATCH /api/v1/booking-link — update is_active and/or slug
router.patch('/', requirePermission('settings', 'edit'), async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch', code: 'NO_BRANCH' })

    const { slug, is_active } = req.body
    const patch: Record<string, unknown> = {}
    if (slug      !== undefined) patch.slug      = String(slug).toLowerCase().replace(/[^a-z0-9-]/g, '').trim()
    if (is_active !== undefined) patch.is_active = is_active

    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to update', code: 'VALIDATION_ERROR' })

    const { data, error } = await supabase
      .from('booking_links')
      .update(patch)
      .eq('branch_id', branchId)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

export default router
