import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'

const router = Router()

const GOTRUE = `${process.env.SUPABASE_URL}/auth/v1`
const SKEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!

function headers(token: string): Record<string, string> {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${token}`,
    'apikey':        SKEY,
  }
}

// GET /mfa/status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const { data: { user }, error } = await supabase.auth.admin.getUserById(req.user!.id)
    if (error || !user) return res.status(404).json({ error: 'User not found' })
    const factors = (user.factors ?? []) as { id: string; factor_type: string; status: string }[]
    const totp    = factors.find(f => f.factor_type === 'totp' && f.status === 'verified')
    res.json({ enabled: !!totp, factor_id: totp?.id ?? null })
  } catch (e) {
    console.error('[mfa status]', e)
    res.status(500).json({ error: 'Ошибка получения статуса MFA' })
  }
})

// POST /mfa/enroll
router.post('/enroll', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization!.split(' ')[1]

    // Удалить незавершённые TOTP факторы перед созданием нового (иначе GoTrue вернёт 422)
    const { data: { user: existingUser } } = await supabase.auth.admin.getUserById(req.user!.id)
    const unverified = (existingUser?.factors ?? []).filter(
      (f: { factor_type: string; status: string }) => f.factor_type === 'totp' && f.status === 'unverified'
    )
    for (const factor of unverified as { id: string }[]) {
      await fetch(`${GOTRUE}/factors/${factor.id}`, {
        method: 'DELETE', headers: headers(token),
      })
    }

    const resp = await fetch(`${GOTRUE}/factors`, {
      method:  'POST',
      headers: headers(token),
      body:    JSON.stringify({ factor_type: 'totp', friendly_name: 'Google Authenticator', issuer: 'Slimway CRM' }),
    })
    const data = await resp.json() as Record<string, unknown>
    if (!resp.ok) return res.status(resp.status).json(data)
    const totp = data.totp as { qr_code?: string; secret?: string; uri?: string } | undefined
    res.json({ factor_id: data.id, qr_code: totp?.qr_code ?? null, secret: totp?.secret ?? null, uri: totp?.uri ?? null })
  } catch (e) {
    console.error('[mfa enroll]', e)
    res.status(500).json({ error: 'Ошибка настройки MFA' })
  }
})

// POST /mfa/verify
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { factor_id, code } = req.body as { factor_id?: string; code?: string }
    if (!factor_id || !code) return res.status(400).json({ error: 'factor_id and code required' })
    const token = req.headers.authorization!.split(' ')[1]

    const chalResp = await fetch(`${GOTRUE}/factors/${factor_id}/challenge`, {
      method: 'POST', headers: headers(token),
    })
    const challenge = await chalResp.json() as Record<string, unknown>
    if (!chalResp.ok) return res.status(chalResp.status).json(challenge)

    const verResp = await fetch(`${GOTRUE}/factors/${factor_id}/verify`, {
      method:  'POST',
      headers: headers(token),
      body:    JSON.stringify({ challenge_id: challenge.id, code }),
    })
    const verData = await verResp.json() as Record<string, unknown>
    if (!verResp.ok) return res.status(verResp.status).json(verData)

    res.json({ success: true, access_token: verData.access_token ?? null, refresh_token: verData.refresh_token ?? null })
  } catch (e) {
    console.error('[mfa verify]', e)
    res.status(500).json({ error: 'Неверный код' })
  }
})

// POST /mfa/unenroll
router.post('/unenroll', async (req: Request, res: Response) => {
  try {
    const { factor_id } = req.body as { factor_id?: string }
    if (!factor_id) return res.status(400).json({ error: 'factor_id required' })
    const token = req.headers.authorization!.split(' ')[1]
    const resp  = await fetch(`${GOTRUE}/factors/${factor_id}`, {
      method: 'DELETE', headers: headers(token),
    })
    if (!resp.ok) return res.status(resp.status).json(await resp.json())
    res.json({ success: true })
  } catch (e) {
    console.error('[mfa unenroll]', e)
    res.status(500).json({ error: 'Ошибка отключения MFA' })
  }
})

export default router
