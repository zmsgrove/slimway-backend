import { supabase } from '../config/supabase'

const TIMEOUT_MS = 10_000
const MAX_RETRIES = 3

/**
 * Deliver a webhook payload to all active endpoints subscribed to the given event.
 * Fire-and-forget: errors are logged but never thrown to the caller.
 */
export function sendWebhook(
  branchId: string,
  event: string,
  payload: Record<string, unknown>,
): void {
  // Intentionally not awaited — fire-and-forget
  void _dispatchWebhooks(branchId, event, payload).catch((err: unknown) => {
    console.error('[sendWebhook] unexpected top-level error:', err)
  })
}

async function _dispatchWebhooks(
  branchId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { data: endpoints, error } = await supabase
    .from('webhook_endpoints')
    .select('id, url, secret')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .contains('events', [event])

  if (error) {
    console.error('[sendWebhook] failed to fetch endpoints:', error)
    return
  }

  if (!endpoints || endpoints.length === 0) return

  await Promise.all(
    endpoints.map((endpoint) =>
      _deliverWithRetry(endpoint as { id: string; url: string; secret?: string }, event, payload),
    ),
  )
}

async function _deliverWithRetry(
  endpoint: { id: string; url: string; secret?: string },
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() })

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    let responseStatus: number | null = null
    let responseBody: string | null = null
    let success = false

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Slimway-Event': event,
      }
      if (endpoint.secret) {
        headers['X-Slimway-Signature'] = endpoint.secret
      }

      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      })

      responseStatus = res.status
      responseBody = await res.text().catch(() => null)
      success = res.ok
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(
        `[sendWebhook] attempt ${attempt}/${MAX_RETRIES} failed for endpoint ${endpoint.id} (${endpoint.url}): ${message}`,
      )
    } finally {
      clearTimeout(timer)
    }

    // Log the attempt result — errors are caught so they never propagate
    try {
      const { error: logErr } = await supabase
        .from('webhook_logs')
        .insert({
          webhook_endpoint_id: endpoint.id,
          event,
          payload,
          response_status: responseStatus,
          response_body: responseBody,
          attempt,
        })
      if (logErr) {
        console.error('[sendWebhook] failed to write webhook_log:', logErr)
      }
    } catch (logErr: unknown) {
      console.error('[sendWebhook] failed to write webhook_log (catch):', logErr)
    }

    if (success) return

    // Exponential back-off between retries (does not block the event loop — awaited
    // only inside this fire-and-forget async chain, not in the main request path)
    if (attempt < MAX_RETRIES) {
      await new Promise<void>((resolve) => setTimeout(resolve, 500 * attempt))
    }
  }

  console.warn(
    `[sendWebhook] all ${MAX_RETRIES} attempts exhausted for endpoint ${endpoint.id} event "${event}"`,
  )
}
