import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireRole } from '../middleware/role.middleware'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /branch-subscription-templates — templates connected to current branch
router.get('/', async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)
    if (!branchId) return res.json([])
    const { data, error } = await supabase
      .from('branch_subscription_templates')
      .select('*, subscription_templates(*)')
      .eq('branch_id', branchId)
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /branch-subscription-templates — connect template to branch
router.post('/', requireRole('owner', 'franchisee'), async (req: Request, res: Response) => {
  try {
    const { template_id, branch_id } = req.body
    if (!template_id) return res.status(400).json({ error: 'template_id required', code: 'VALIDATION_ERROR' })

    const branchId = branch_id || await resolveBranchId(req.user!)
    if (!branchId) return res.status(400).json({ error: 'No branch', code: 'NO_BRANCH' })

    // Check if already connected
    const { data: existing } = await supabase
      .from('branch_subscription_templates')
      .select('id')
      .eq('branch_id', branchId)
      .eq('template_id', template_id)
      .single()
    if (existing) return res.status(409).json({ error: 'Already connected', code: 'ALREADY_EXISTS' })

    const { data, error } = await supabase
      .from('branch_subscription_templates')
      .insert({ branch_id: branchId, template_id })
      .select('*, subscription_templates(*)')
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// DELETE /branch-subscription-templates/:id — disconnect template from branch
router.delete('/:id', requireRole('owner', 'franchisee'), async (req: Request, res: Response) => {
  try {
    const { error } = await supabase
      .from('branch_subscription_templates')
      .delete()
      .eq('id', req.params.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

export default router
