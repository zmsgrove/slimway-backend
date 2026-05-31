import { Request, Response, NextFunction } from 'express'
import { supabase } from '../config/supabase'
import { can } from '../config/permissions'
import type { PermissionOverride, Role } from '../config/permissions'

export function requirePermission(resource: string, action: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized', code: 'NO_USER' })
      }

      const role = req.user.role as Role
      if (role === 'developer') return next()

      let overridesList: PermissionOverride[] = []
      const { data, error: ovError } = await supabase
        .from('permission_overrides')
        .select('*')
        .eq('role', role)

      if (ovError) {
        console.error('[requirePermission] Failed to load overrides for role', role, ovError)
      } else {
        overridesList = (data ?? []) as PermissionOverride[]
      }

      if (!can(role, resource, action, overridesList)) {
        return res.status(403).json({ error: 'Недостаточно прав', code: 'FORBIDDEN' })
      }

      next()
    } catch (e) {
      console.error('[requirePermission] Unexpected error checking', resource, action, e)
      return res.status(500).json({ error: 'Internal server error', code: 'PERMISSION_CHECK_ERROR' })
    }
  }
}
