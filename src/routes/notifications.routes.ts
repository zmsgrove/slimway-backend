import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'

const router = Router()

// GET /notifications?limit=50&offset=0&unread_only=false
router.get('/', async (req: Request, res: Response) => {
  try {
    const profileId = req.user!.id
    const limit      = Math.min(Number(req.query.limit  ?? 50), 100)
    const offset     = Number(req.query.offset ?? 0)
    const unreadOnly = req.query.unread_only === 'true'

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (unreadOnly) query = query.eq('is_read', false)

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data ?? [])
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// GET /notifications/unread-count
router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', req.user!.id)
      .eq('is_read', false)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ count: count ?? 0 })
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// PATCH /notifications/read-all
router.patch('/read-all', async (req: Request, res: Response) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('profile_id', req.user!.id)
      .eq('is_read', false)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// PATCH /notifications/:id/read
router.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', req.params.id)
      .eq('profile_id', req.user!.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

// DELETE /notifications/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', req.params.id)
      .eq('profile_id', req.user!.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

export default router
