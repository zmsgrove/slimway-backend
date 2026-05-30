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

// POST /permissions — создать/обновить override
router.post('/', requirePermission('permissions', 'edit'), async (req: Request, res: Response) => {
  try {
    const actorRole = req.user!.role as Role
    const { role: targetRole, resource, action, state, branch_id } = req.body

    if (!targetRole || !resource || !action || !state) {
      return res.status(400).json({ error: 'role, resource, action, state required', code: 'VALIDATION_ERROR' })
    }

    if (!['allow','deny','locked'].includes(state)) {
      return res.status(400).json({ error: 'state must be allow, deny, or locked', code: 'VALIDATION_ERROR' })
    }

    // Проверяем иерархию
    if (!canEditRolePermissions(actorRole, targetRole as Role)) {
      return res.status(403).json({ error: 'Недостаточно прав для изменения прав этой роли', code: 'FORBIDDEN' })
    }

    // Только developer может ставить locked
    if (state === 'locked' && !canSetLocked(actorRole)) {
      return res.status(403).json({ error: 'Только developer может устанавливать locked', code: 'FORBIDDEN' })
    }

    // Проверяем, не заблокирована ли ячейка
    if (actorRole !== 'developer') {
      const { data: existing } = await supabase
        .from('permission_overrides')
        .select('state')
        .eq('role', targetRole)
        .eq('resource', resource)
        .eq('action', action)
        .maybeSingle()

      if (existing?.state === 'locked') {
        return res.status(403).json({ error: 'Эта ячейка заблокирована. Только developer может её изменить', code: 'LOCKED' })
      }
    }

    const { data, error } = await supabase
      .from('permission_overrides')
      .upsert(
        {
          role:       targetRole,
          resource,
          action,
          state,
          set_by:     actorRole,
          branch_id:  branch_id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'role,resource,action,branch_id' }
      )
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (e: unknown) {
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
