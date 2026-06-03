import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { supabase } from '../config/supabase'
import { requirePermission } from '../middleware/permission.middleware'
import { generateApiKey } from '../utils/generateApiKey'
import { logAction } from '../utils/logAction'

const router = Router()

/**
 * @openapi
 * tags:
 *   - name: API Keys
 *     description: Управление API-ключами для внешних интеграций
 */

/**
 * @openapi
 * /api/v1/api-keys:
 *   get:
 *     tags: [API Keys]
 *     summary: Список API-ключей филиала
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         schema:
 *           type: string
 *         description: ID филиала (для developer/owner)
 *     responses:
 *       200:
 *         description: Список ключей (без key_hash)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ApiKey'
 *       401:
 *         description: Не авторизован
 *       403:
 *         description: Нет прав
 */
router.get('/', requirePermission('api_keys', 'manage'), async (req: Request, res: Response) => {
  const { branch_id, role } = req.user!

  // developer видит raw_key (полный ключ)
  const selectFields = role === 'developer'
    ? 'id, name, key_prefix, raw_key, scopes, is_active, last_used_at, expires_at, created_at'
    : 'id, name, key_prefix, scopes, is_active, last_used_at, expires_at, created_at'

  const { data, error } = await supabase
    .from('api_keys')
    .select(selectFields)
    .eq('branch_id', branch_id ?? '')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

/**
 * @openapi
 * /api/v1/api-keys:
 *   post:
 *     tags: [API Keys]
 *     summary: Создать API-ключ
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateApiKeyRequest'
 *     responses:
 *       201:
 *         description: Ключ создан. raw_key возвращается ОДИН РАЗ — сохраните его.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiKeyCreated'
 *       400:
 *         description: Неверные параметры
 *       401:
 *         description: Не авторизован
 *       403:
 *         description: Нет прав
 */
router.post('/', requirePermission('api_keys', 'manage'), async (req: Request, res: Response) => {
  const { branch_id, id: actor_id, role: actor_role } = req.user!
  const { name, scopes, expires_at } = req.body as {
    name?: string
    scopes?: string[]
    expires_at?: string
  }

  if (!name?.trim()) {
    return res.status(400).json({ error: 'name обязателен', code: 'VALIDATION_ERROR' })
  }
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return res.status(400).json({ error: 'scopes обязателен (непустой массив)', code: 'VALIDATION_ERROR' })
  }

  const { raw, hash, prefix } = generateApiKey()

  // developer/owner могут не иметь branch_id — для них требуем branch_id из query
  const effectiveBranchId = branch_id ?? (req.query.branch_id as string | undefined)
  if (!effectiveBranchId) {
    return res.status(400).json({ error: 'branch_id обязателен', code: 'VALIDATION_ERROR' })
  }

  const id = randomUUID()

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      id,
      branch_id:  effectiveBranchId,
      name:       name.trim(),
      key_hash:   hash,
      key_prefix: prefix,
      raw_key:    raw,
      scopes:     scopes,
      is_active:  true,
      expires_at: expires_at ?? null,
      created_by: actor_id,
    })
    .select('id, name, key_prefix, scopes, is_active, last_used_at, expires_at, created_at')
    .single()

  if (error) return res.status(500).json({ error: error.message })

  await logAction({
    branch_id:   effectiveBranchId,
    entity_type: 'api_key',
    entity_id:   id,
    action:      'create_api_key',
    actor_id:    actor_id,
    actor_name:  actor_role,
    details:     { name: name.trim(), scopes, prefix },
  })

  return res.status(201).json({ ...data, raw_key: raw })
})

/**
 * @openapi
 * /api/v1/api-keys/{id}:
 *   delete:
 *     tags: [API Keys]
 *     summary: Отозвать API-ключ (деактивировать)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID ключа
 *     responses:
 *       200:
 *         description: Ключ деактивирован
 *       403:
 *         description: Нет прав или ключ из другого филиала
 *       404:
 *         description: Ключ не найден
 */
router.delete('/:id', requirePermission('api_keys', 'manage'), async (req: Request, res: Response) => {
  const { branch_id, id: actor_id, role: actor_role } = req.user!
  const { id } = req.params

  const { data: existing, error: fetchErr } = await supabase
    .from('api_keys')
    .select('id, branch_id, name, key_prefix')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) return res.status(404).json({ error: 'Ключ не найден', code: 'NOT_FOUND' })
  if (branch_id && existing.branch_id !== branch_id) {
    return res.status(403).json({ error: 'Доступ запрещён', code: 'FORBIDDEN' })
  }

  const { error } = await supabase
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return res.status(500).json({ error: error.message })

  await logAction({
    branch_id:   existing.branch_id as string,
    entity_type: 'api_key',
    entity_id:   id,
    action:      'revoke_api_key',
    actor_id:    actor_id,
    actor_name:  actor_role,
    details:     { name: existing.name, prefix: existing.key_prefix },
  })

  return res.json({ ok: true })
})

/**
 * @openapi
 * components:
 *   schemas:
 *     ApiKey:
 *       type: object
 *       properties:
 *         id:           { type: string, format: uuid }
 *         name:         { type: string }
 *         key_prefix:   { type: string, example: sk_live_XXXX }
 *         scopes:       { type: array, items: { type: string } }
 *         is_active:    { type: boolean }
 *         last_used_at: { type: string, format: date-time, nullable: true }
 *         expires_at:   { type: string, format: date-time, nullable: true }
 *         created_at:   { type: string, format: date-time }
 *     CreateApiKeyRequest:
 *       type: object
 *       required: [name, scopes]
 *       properties:
 *         name:       { type: string, example: "My Integration" }
 *         scopes:     { type: array, items: { type: string }, example: ["clients:read", "subscriptions:read"] }
 *         expires_at: { type: string, format: date-time, nullable: true }
 *     ApiKeyCreated:
 *       allOf:
 *         - $ref: '#/components/schemas/ApiKey'
 *         - type: object
 *           properties:
 *             raw_key:
 *               type: string
 *               description: Полный ключ — возвращается ОДИН РАЗ, сохраните его
 *               example: sk_live_a1b2c3d4e5f6...
 */

export default router
