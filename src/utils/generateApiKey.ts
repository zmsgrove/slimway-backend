import { randomBytes, createHash } from 'crypto'

export interface ApiKeyResult {
  raw: string
  hash: string
  prefix: string
}

export function generateApiKey(): ApiKeyResult {
  const suffix = randomBytes(24).toString('hex')
  const raw = `sk_live_${suffix}`
  const hash = createHash('sha256').update(raw).digest('hex')
  const prefix = raw.substring(0, 12)
  return { raw, hash, prefix }
}
