import { Request, Response, NextFunction } from 'express'
import type { Role } from '../types'

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', code: 'NO_USER' })
    }
    if (req.user.role === 'developer') return next()
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden', code: 'INSUFFICIENT_ROLE' })
    }
    next()
  }
}
