import { Request, Response, NextFunction } from 'express'
import { supabase } from '../config/supabase'
import type { AuthUser } from '../types'

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' })
  }

  const token = authHeader.split(' ')[1]

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' })
  }

  const meta = user.app_metadata as { role?: string; branch_id?: string }

  req.user = {
    id:        user.id,
    role:      (meta.role || 'admin') as AuthUser['role'],
    branch_id: meta.branch_id || null,
    email:     user.email || '',
  }

  // MFA enforcement — skip for /api/v1/auth/* (enroll, verify, unenroll, status)
  const skipMfa = req.originalUrl.startsWith('/api/v1/auth/')
  if (!skipMfa) {
    const factors = (user.factors ?? []) as { factor_type: string; status: string }[]
    const hasMfa  = factors.some(f => f.factor_type === 'totp' && f.status === 'verified')
    if (hasMfa) {
      try {
        // AAL is encoded in the JWT payload
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
        if ((payload?.aal ?? 'aal1') !== 'aal2') {
          return res.status(403).json({ error: 'MFA required', code: 'MFA_REQUIRED' })
        }
      } catch {
        // JWT decode error — skip check to avoid false blocks
      }
    }
  }

  next()
}
