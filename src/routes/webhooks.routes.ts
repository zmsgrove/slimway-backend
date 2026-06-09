import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { supabase } from '../config/supabase'
import { requirePermission } from '../middleware/permission.middleware'
import { logAction } from '../utils/logAction'
import { sendWebhook } from '../utils/sendWebhook'

const router = Router()

router.get('/', requirePermission('webhooks', 'manage'), async (req: Request, res: Response) => {
  const { branch_id } = req.user!
  const { data, error } = await supabase
    .from('webhook_endpoints')
    .select('id, name, url, events, is_active, created_at, updated_at')
    .eq('branch_id', branch_id ?? '')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.post('/', requirePermission('webhooks', 'manage'), async (req: Request, res: Response) => {
  const { branch_id, id: actor_id, role: actor_role } = req.user!
  const { name, url, events, secret } = req.body as {
    name?: string; url?: string; events?: string[]; secret?: string
  }

  if (!name?.trim()) return res.status(400).json({ error: 'name обязателен', code: 'VALIDATION_ERROR' })
  if (!url?.trim()) return res.status(400).json({ error: 'url обязателен', code: 'VALIDATION_ERROR' })
  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'events обязателен (непустой массив)', code: 'VALIDATION_ERROR' })
  }

  const id = randomUUID()
  const { data, error } = await supabase
    .from('webhook_endpoints')
    .insert({
      id,
      branch_id,
      name: name.trim(),
      url: url.trim(),
      events,
      secret: secret?.trim() || null,
      is_active: true,
      created_by: actor_id,
    })
    .select('id, name, url, events, is_active, created_at, updated_at')
    .single()

  if (error) return res.status(500).json({ error: error.message })

  await logAction({
    branch_id: branch_id!,
    entity_type: 'webhook',
    entity_id: id,
    action: 'create_webhook',
    actor_id,
    actor_name: actor_role,
    details: { name: name.trim(), url: url.trim(), events },
  })

  return res.status(201).json(data)
})

router.patch('/:id', requirePermission('webhooks', 'manage'), async (req: Request, res: Response) => {
  const { branch_id } = req.user!
  const { id } = req.params

  const { data: existing, error: fetchErr } = await supabase
    .from('webhook_endpoints')
    .select('id, branch_id')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) return res.status(404).json({ error: 'Webhook не найден', code: 'NOT_FOUND' })
  if (branch_id && existing.branch_id !== branch_id) {
    return res.status(403).json({ error: 'Доступ запрещён', code: 'FORBIDDEN' })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (req.body.name !== undefined) updates.name = (req.body.name as string).trim()
  if (req.body.url !== undefined) updates.url = (req.body.url as string).trim()
  if (req.body.events !== undefined) updates.events = req.body.events
  if (req.body.secret !== undefined) updates.secret = (req.body.secret as string)?.trim() || null
  if (req.body.is_active !== undefined) updates.is_active = req.body.is_active

  const { data, error } = await supabase
    .from('webhook_endpoints')
    .update(updates)
    .eq('id', id)
    .select('id, name, url, events, is_active, created_at, updated_at')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.delete('/:id', requirePermission('webhooks', 'manage'), async (req: Request, res: Response) => {
  const { branch_id, id: actor_id, role: actor_role } = req.user!
  const { id } = req.params

  const { data: existing, error: fetchErr } = await supabase
    .from('webhook_endpoints')
    .select('id, branch_id, name')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) return res.status(404).json({ error: 'Webhook не найден', code: 'NOT_FOUND' })
  if (branch_id && existing.branch_id !== branch_id) {
    return res.status(403).json({ error: 'Доступ запрещён', code: 'FORBIDDEN' })
  }

  const { error } = await supabase.from('webhook_endpoints').delete().eq('id', id)
  if (error) return res.status(500).json({ error: error.message })

  await logAction({
    branch_id: existing.branch_id as string,
    entity_type: 'webhook',
    entity_id: id,
    action: 'delete_webhook',
    actor_id,
    actor_name: actor_role,
    details: { name: existing.name },
  })

  return res.json({ ok: true })
})

router.get('/:id/logs', requirePermission('webhooks', 'manage'), async (req: Request, res: Response) => {
  const { branch_id } = req.user!
  const { id } = req.params
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)

  const { data: existing, error: fetchErr } = await supabase
    .from('webhook_endpoints')
    .select('id, branch_id')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) return res.status(404).json({ error: 'Webhook не найден', code: 'NOT_FOUND' })
  if (branch_id && existing.branch_id !== branch_id) {
    return res.status(403).json({ error: 'Доступ запрещён', code: 'FORBIDDEN' })
  }

  const { data, error } = await supabase
    .from('webhook_logs')
    .select('id, event_type, response_status, delivered, attempt, created_at')
    .eq('endpoint_id', id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.post('/:id/test', requirePermission('webhooks', 'manage'), async (req: Request, res: Response) => {
  const { branch_id } = req.user!
  const { id } = req.params

  const { data: endpoint, error: fetchErr } = await supabase
    .from('webhook_endpoints')
    .select('id, branch_id, url')
    .eq('id', id)
    .single()

  if (fetchErr || !endpoint) return res.status(404).json({ error: 'Webhook не найден', code: 'NOT_FOUND' })
  if (branch_id && endpoint.branch_id !== branch_id) {
    return res.status(403).json({ error: 'Доступ запрещён', code: 'FORBIDDEN' })
  }

  sendWebhook(endpoint.branch_id as string, 'test.ping', {
    message: 'Slimway CRM webhook test',
    timestamp: new Date().toISOString(),
  })

  return res.json({ ok: true, message: `Тестовый запрос отправлен на ${endpoint.url as string}` })
})

export default router
