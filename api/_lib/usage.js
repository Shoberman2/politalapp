import { supabaseAdmin } from './supabase.js'

/**
 * Log an API request to the usage table. Non-blocking, fire-and-forget.
 * Accepts either a key id (string) or the `auth.key` object, which for an
 * anonymous request carries `id: null` and an `ipHash`.
 */
export function logUsage(keyOrId, endpoint, method, statusCode, responseMs) {
  const key = keyOrId && typeof keyOrId === 'object' ? keyOrId : { id: keyOrId || null }
  if (!key.id && !key.ipHash) return

  const row = {
    key_id: key.id || null,
    endpoint,
    method: method || 'GET',
    status_code: statusCode,
    response_ms: responseMs,
  }
  if (!key.id && key.ipHash) row.ip_hash = key.ipHash

  supabaseAdmin
    .from('api_usage')
    .insert(row)
    .then(({ error }) => {
      if (error) console.warn('[API Usage] Failed to log:', error.message)
    })
    .catch((err) => {
      console.error('[API Usage] Failed to log:', err.message)
    })
}
