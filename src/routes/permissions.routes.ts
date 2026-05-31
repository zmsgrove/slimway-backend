import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requirePermission } from '../middleware/permission.middleware'
import { canEditRolePermissions, canSetLocked } from '../config/permissions'
import type { Role } from '../config/permissions'

const router = Router()

// GET /permissions — все overrides
router.get('/', requirePermission('permissions', 'view'), async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('permission_overrides')
      .select('*')
      .order('role')
      .order('resource')
      .order('action')

    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// POST /permissions — создать/обновить override (deny = удалить override)
router.post('/', requirePermission('permissions', 'edit'), async (req: Request, res: Response) => {
  try {
    const actorRole = req.user!.role as Role
    const { role: targetRole, resource, action, state } = req.body

    if (!targetRole || !resource || !action || !state) {
      return res.status(400).json({ error: 'role, resource, action, state required', code: 'VALIDATION_ERROR' })
    }

    if (!['allow', 'deny', 'locked'].includes(state)) {
      return res.status(400).json({ error: 'state must be allow, deny, or locked', code: 'VALIDATION_ERROR' })
    }

    if (!canEditRolePermissions(actorRole, targetRole as Role)) {
      return res.status(403).json({ error: 'Недостаточно прав для редактирования этой роли', code: 'FORBIDDEN' })
    }

    if (state === 'locked' && !canSetLocked(actorRole)) {
      return res.status(403).json({ error: 'Только developer может блокировать права', code: 'FORBIDDEN' })
    }

    if (actorRole !== 'developer') {
      const { data: existing } = await supabase
        .from('permission_overrides')
        .select('state')
        .eq('role', targetRole)
        .eq('resource', resource)
        .eq('action', action)
        .is('branch_id', null)
        .maybeSingle()
      if (existing?.state === 'locked') {
        return res.status(403).json({ error: 'Ячейка заблокирована. Только developer может изменить', code: 'LOCKED' })
      }
    }

    if (state === 'deny') {
      // deny = удалить override, вернуть к дефолту
      const { error } = await supabase
        .from('permission_overrides')
        .delete()
        .eq('role', targetRole)
        .eq('resource', resource)
        .eq('action', action)
        .is('branch_id', null)

      if (error) {
        console.error('[permissions POST] delete error:', error)
        throw error
      }
      return res.json({ success: true, state: 'deny' })
    }

    // allow или locked — upsert
    const { data, error } = await supabase
      .from('permission_overrides')
      .upsert({
        role:       targetRole,
        resource,
        action,
        state,
        set_by:     actorRole,
        branch_id:  null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'role,resource,action,branch_id',
      })
      .select()
      .single()

    if (error) {
      console.error('[permissions POST] upsert error:', error)
      throw error
    }

    return res.status(201).json({ success: true, data })
  } catch (e: unknown) {
    console.error('[permissions POST error]', e)
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

// DELETE /permissions/:id — удалить override
router.delete('/:id', requirePermission('permissions', 'edit'), async (req: Request, res: Response) => {
  try {
    const actorRole = req.user!.role as Role
    const { id } = req.params

    const { data: override } = await supabase
      .from('permission_overrides')
      .select('*')
      .eq('id', id)
      .single()

    if (!override) return res.status(404).json({ error: 'Override not found', code: 'NOT_FOUND' })

    if (!canEditRolePermissions(actorRole, override.role as Role)) {
      return res.status(403).json({ error: 'Недостаточно прав', code: 'FORBIDDEN' })
    }

    if (override.state === 'locked' && !canSetLocked(actorRole)) {
      return res.status(403).json({ error: 'Только developer может снять locked', code: 'FORBIDDEN' })
    }

    const { error } = await supabase.from('permission_overrides').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return res.status(500).json({ error: msg })
  }
})

export default router
