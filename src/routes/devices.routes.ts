import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireRole } from '../middleware/role.middleware'
const router = Router()

// GET /devices — список тренажёров филиала
router.get('/', async (req: Request, res: Response) => {
  try {
    const { branch_id } = req.user!

    let query = supabase
      .from('devices')
      .select('*')
      .order('device_group', { ascending: true })
      .order('number', { ascending: true })

    if (branch_id) query = query.eq('branch_id', branch_id)

    const { data, error } = await query
    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: error.message, details: error })
    }
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /devices — добавить тренажёр
router.post('/', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  try {
    console.log('POST /devices req.user:', JSON.stringify(req.user))
    let branchId = req.user!.branch_id

    if (!branchId) {
      const { data: branch, error: branchError } = await supabase
        .from('branches')
        .select('id')
        .eq('owner_id', req.user!.id)
        .single()
      console.log('branch lookup result:', { branch, branchError, userId: req.user!.id })
      branchId = branch?.id || null
    }

    if (!branchId) {
      return res.status(400).json({ error: 'No branch found', code: 'NO_BRANCH' })
    }

    const { type, number, device_group, status } = req.body

    if (!type || !number || !device_group) {
      return res.status(400).json({ error: 'type, number, device_group required', code: 'VALIDATION_ERROR' })
    }

    const { data, error } = await supabase
      .from('devices')
      .insert({ branch_id: branchId, type, number, device_group, status: status ?? 'active' })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: error.message, details: error })
    }
    return res.status(201).json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// PATCH /devices/:id — обновить тренажёр (статус, название и т.д.)
router.patch('/:id', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { type, number, device_group, status } = req.body

    const patch: Record<string, unknown> = {}
    if (type !== undefined)         patch.type = type
    if (number !== undefined)       patch.number = number
    if (device_group !== undefined) patch.device_group = device_group
    if (status !== undefined)       patch.status = status

    const { data, error } = await supabase
      .from('devices')
      .update(patch)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: error.message, details: error })
    }
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// DELETE /devices/:id
router.delete('/:id', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { error } = await supabase.from('devices').delete().eq('id', id)
    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: error.message, details: error })
    }
    return res.status(204).send()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

export default router
