import { Request, Response, NextFunction } from 'express'
import { createHash } from 'crypto'
import { supabase } from '../config/supabase'

export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const rawKey = req.headers['x-api-key'] as string | undefined
  if (!rawKey) {
    return res.status(401).json({ error: 'API key required', code: 'NO_API_KEY' })
  }

  const hash = createHash('sha256').update(rawKey).digest('hex')

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, branch_id, scopes, expires_at')
    .eq('key_hash', hash)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    return res.status(401).json({ error: 'Invalid API key', code: 'INVALID_API_KEY' })
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return res.status(401).json({ error: 'API key expired', code: 'API_KEY_EXPIRED' })
  }

  // Fire-and-forget last_used_at update
  void supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)

  req.apiKey = { branch_id: data.branch_id as string, scopes: (data.scopes as string[]) ?? [] }

  next()
}
