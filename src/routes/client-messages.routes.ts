import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { resolveBranchId } from '../utils/resolveBranchId'

const router = Router()

// GET /api/v1/client-messages/:client_id
router.get('/:client_id', async (req: Request, res: Response) => {
  try {
    const { client_id } = req.params
    const branchId = await resolveBranchId(req.user!)

    let q = supabase
      .from('client_messages')
      .select('*')
      .eq('client_id', client_id)
      .order('created_at', { ascending: true })
      .limit(200)

    if (branchId) q = q.eq('branch_id', branchId)

    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })

    await supabase
      .from('client_messages')
      .update({ is_read: true })
      .eq('client_id', client_id)
      .eq('sender', 'client')
      .eq('is_read', false)

    return res.json(data ?? [])
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// POST /api/v1/client-messages/:client_id
router.post('/:client_id', async (req: Request, res: Response) => {
  try {
    const { client_id } = req.params
    const branchId = await resolveBranchId(req.user!)
    const { text } = req.body

    if (!text?.trim()) return res.status(400).json({ error: 'text required', code: 'VALIDATION_ERROR' })

    const { data: client } = await supabase
      .from('clients')
      .select('id, branch_id')
      .eq('id', client_id)
      .single()

    if (!client) return res.status(404).json({ error: 'Client not found', code: 'NOT_FOUND' })
    if (branchId && client.branch_id !== branchId) {
      return res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' })
    }

    const { data, error } = await supabase
      .from('client_messages')
      .insert({ client_id, branch_id: client.branch_id, sender: 'manager', text: text.trim(), is_read: false })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// GET /api/v1/client-messages/unread-counts — для бейджей
router.get('/', async (req: Request, res: Response) => {
  try {
    const branchId = await resolveBranchId(req.user!)

    let q = supabase
      .from('client_messages')
      .select('client_id')
      .eq('sender', 'client')
      .eq('is_read', false)

    if (branchId) q = q.eq('branch_id', branchId)

    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })

    const counts: Record<string, number> = {}
    for (const row of data ?? []) {
      const cid = row.client_id as string
      counts[cid] = (counts[cid] ?? 0) + 1
    }
    return res.json(counts)
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

export default router
