import { Request, Response, NextFunction } from 'express'
import { supabase } from '../config/supabase'
import { can } from '../config/permissions'
import type { PermissionOverride, Role } from '../config/permissions'

export function requirePermission(resource: string, action: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', code: 'NO_USER' })
    }

    const role = req.user.role as Role
    if (role === 'developer') return next()

    const { data: overrides } = await supabase
      .from('permission_overrides')
      .select('*')
      .eq('role', role)

    if (!can(role, resource, action, (overrides ?? []) as PermissionOverride[])) {
      return res.status(403).json({ error: 'Недостаточно прав', code: 'FORBIDDEN' })
    }

    next()
  }
}
