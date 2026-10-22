// Write one agent_events row. Fire-and-forget: callers pass the returned
// promise to waitUntil (middleware) or ignore it (api/mcp.js); it never
// throws. Uses fetch and Web Crypto only, so it runs in Routing Middleware
// and in Node functions alike.
//
// The IP is stored only as a keyed hash, with the same key and rule as
// api/_lib/clientIp.js: no RATE_LIMIT_SALT in production means no hash.

async function hashIp(ip) {
  const env = globalThis.process?.env || {}
  const secret = env.RATE_LIMIT_SALT
  if (!ip || (!secret && env.VERCEL_ENV === 'production')) return null
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret || 'ballotwatch-dev'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(ip)))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

export function clientIpFromHeaders(get) {
  const v = get('x-vercel-forwarded-for') || get('x-real-ip') || get('x-forwarded-for') || ''
  return v.split(',')[0].trim() || null
}

/**
 * @param {object} e
 * @param {string} e.surface  page | api | mcp | file
 * @param {string} e.path
 * @param {{agent:string, operator:string|null, purpose:string}} e.who
 * @param {string} [e.event]  request | mcp_initialize | mcp_tool
 * @param {string} [e.tool]
 * @param {object} [e.detail]
 * @param {string} [e.userAgent]
 * @param {string} [e.ip]
 * @param {string} [e.country]
 */
export async function logAgentEvent(e) {
  const env = globalThis.process?.env || {}
  // Production sets only VITE_SUPABASE_URL; api/_lib/supabase.js falls back
  // the same way.
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || env.AGENT_EVENTS_DISABLED === '1') return
  try {
    const row = {
      surface: e.surface,
      event: e.event || 'request',
      path: String(e.path || '').slice(0, 500),
      agent: e.who.agent,
      operator: e.who.operator || null,
      purpose: e.who.purpose || null,
      tool: e.tool || null,
      detail: e.detail || null,
      user_agent: e.userAgent ? String(e.userAgent).slice(0, 400) : null,
      ip_hash: await hashIp(e.ip),
      country: e.country || null,
    }
    const res = await fetch(`${url}/rest/v1/agent_events`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    })
    if (!res.ok) console.warn('[agent_events] insert failed:', res.status)
  } catch (err) {
    console.warn('[agent_events] insert failed:', err?.message)
  }
}
