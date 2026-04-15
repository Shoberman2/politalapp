import { supabaseAdmin } from './supabase.js'

/**
 * Log an API request to the usage table. Non-blocking, fire-and-forget.
 */
export function logUsage(keyId, endpoint, method, statusCode, responseMs) {
  supabaseAdmin
    .from('api_usage')
    .insert({
      key_id: keyId,
      endpoint,
      method: method || 'GET',
      status_code: statusCode,
      response_ms: responseMs,
    })
    .then(() => {})
    .catch((err) => {
      console.error('[API Usage] Failed to log:', err.message)
    })
}
