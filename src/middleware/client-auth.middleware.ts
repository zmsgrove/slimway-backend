import { Request, Response, NextFunction } from 'express'
import { supabase } from '../config/supabase'

export async function requireClientAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Client token required', code: 'UNAUTHORIZED' })
  }
  const token = auth.slice(7)

  const { data, error } = await supabase
    .from('client_tokens')
    .select('client_id, expires_at')
    .eq('token', token)
    .single()

  if (error || !data) {
    return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' })
  }

  if (new Date(data.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' })
  }

  const { data: client, error: cErr } = await supabase
    .from('clients')
    .select('id, branch_id, full_name')
    .eq('id', data.client_id)
    .single()

  if (cErr || !client) {
    return res.status(401).json({ error: 'Client not found', code: 'CLIENT_NOT_FOUND' })
  }

  req.client = {
    id: client.id as string,
    branch_id: client.branch_id as string,
    full_name: client.full_name as string,
  }
  next()
}
