import { Request, Response, NextFunction } from 'express'
import { supabase } from '../config/supabase'
import type { AuthUser } from '../types'
 
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' })
  }
 
  const token = authHeader.split(' ')[1]
 
  // Используем service role клиент + getUser(token) — работает с ECC и Legacy ключами
  const { data: { user }, error } = await supabase.auth.getUser(token)
 
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' })
  }
 
  const meta = user.app_metadata as { role?: string; branch_id?: string }
 
  req.user = {
    id: user.id,
    role: (meta.role || 'admin') as AuthUser['role'],
    branch_id: meta.branch_id || null,
    email: user.email || ''
  }
 
  next()
}
 