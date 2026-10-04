import { createHash } from 'crypto'
import { supabaseAdmin } from './supabase.js'
import { errorResponse, jsonResponse } from './response.js'
import { getHeader } from './request.js'
import { checkRateLimit } from './rateLimit.js'
import { clientIp, hashIp } from './clientIp.js'

// The data is public. Unauthenticated GET requests are allowed with a per-IP
// limit; free self-serve keys get a higher per-minute limit because agent
// platforms share egress IPs; paid keys keep their monthly quota.
export const ANON_PER_MINUTE = Number(process.env.API_ANON_PER_MINUTE || 60)
export const ANON_PER_DAY = Number(process.env.API_ANON_PER_DAY || 5000)
export const FREE_KEY_PER_MINUTE = Number(process.env.API_FREE_KEY_PER_MINUTE || 600)

function hashKey(rawKey) {
  return createHash('sha256').update(rawKey).digest('hex')
}

export { clientIp, hashIp }

function rateLimited(rl, scope) {
  return jsonResponse({
    error: {
      message: scope === 'anonymous'
        ? `Rate limit reached for unauthenticated requests (${rl.limit} per ${rl.window}). Create a free key at /developers/keys for a higher limit.`
        : `Rate limit reached (${rl.limit} per ${rl.window}).`,
      code: 'RATE_LIMIT_EXCEEDED',
      limit: rl.limit,
      window: rl.window,
    },
  }, 429, {
    'Retry-After': String(rl.retryAfter || 60),
    'X-RateLimit-Limit': String(rl.limit),
    'X-RateLimit-Remaining': '0',
  })
}

// Usage rows store the hash only when it is keyed by a real secret (or we
// are not in production); the rate limiter uses it either way.
function ipHashForStorage(ipHash) {
  return process.env.RATE_LIMIT_SALT || process.env.VERCEL_ENV !== 'production' ? ipHash : null
}

async function anonymousAccess(req) {
  const ip = clientIp(req)
  const ipHash = hashIp(ip)
  const rl = await checkRateLimit({ id: `ip:${ipHash}`, perMinute: ANON_PER_MINUTE, perDay: ANON_PER_DAY })
  if (!rl.allowed) return { error: rateLimited(rl, 'anonymous') }
  const stored = ipHashForStorage(ipHash)
  return {
    org: null,
    key: { id: null, name: 'anonymous', monthlyCount: 0, ipHash: stored },
    anonymous: true,
    ipHash: stored,
    rateLimit: rl,
  }
}

/**
 * Validate an API key from the Authorization header, or admit an anonymous
 * GET/HEAD under the per-IP limit.
 *
 * Returns { error: Response } on failure. On success:
 *   keyed:      { org, key: { id, name, monthlyCount }, anonymous: false }
 *   anonymous:  { org: null, key: { id: null, name: 'anonymous', monthlyCount: 0, ipHash },
 *                 anonymous: true, ipHash, rateLimit }
 * Pass `auth.key` to logUsage so anonymous rows carry the ip hash.
 */
export async function validateApiKey(req, { allowAnonymous = true } = {}) {
  const authHeader = getHeader(req, 'authorization')
  const method = String(req.method || '').toUpperCase()

  if (!authHeader) {
    if (allowAnonymous && (method === 'GET' || method === 'HEAD')) return anonymousAccess(req)
    return { error: errorResponse('Missing or invalid Authorization header. Use: Bearer bw_live_xxx', 401, 'UNAUTHORIZED') }
  }
  if (!authHeader.startsWith('Bearer ')) {
    return { error: errorResponse('Missing or invalid Authorization header. Use: Bearer bw_live_xxx', 401, 'UNAUTHORIZED') }
  }

  const rawKey = authHeader.slice(7).trim()
  if (!rawKey || !rawKey.startsWith('bw_live_')) {
    return { error: errorResponse('Invalid API key format. Keys start with bw_live_', 401, 'UNAUTHORIZED') }
  }

  const hash = hashKey(rawKey)

  try {
    const { data: keyRow, error: keyError } = await supabaseAdmin
      .from('api_keys')
      .select(`
        id, org_id, name, monthly_count, last_reset_at, active, created_at,
        organizations:org_id (
          id, name, plan, monthly_limit, subscription_status
        )
      `)
      .eq('key_hash', hash)
      .single()

    if (keyError || !keyRow) {
      return { error: errorResponse('Invalid API key', 401, 'UNAUTHORIZED') }
    }

    if (!keyRow.active) {
      return { error: errorResponse('API key has been revoked', 403, 'KEY_REVOKED') }
    }

    const org = keyRow.organizations
    if (!org || org.subscription_status !== 'active') {
      return { error: errorResponse('Organization subscription is not active. Visit /developers to subscribe or claim a free key.', 403, 'SUBSCRIPTION_INACTIVE') }
    }

    // Free keys are limited per minute; their monthly_limit is 0 (no monthly cap).
    if (org.plan === 'free') {
      const rl = await checkRateLimit({ id: `org:${org.id}`, perMinute: FREE_KEY_PER_MINUTE })
      if (!rl.allowed) return { error: rateLimited(rl, 'free') }
    }

    // Check and reset monthly counter if new month
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    let currentCount = keyRow.monthly_count || 0

    if (!keyRow.last_reset_at || new Date(keyRow.last_reset_at) < monthStart) {
      currentCount = 0
      // Reset counter (fire-and-forget)
      supabaseAdmin
        .from('api_keys')
        .update({ monthly_count: 1, last_reset_at: monthStart.toISOString(), last_used_at: now.toISOString() })
        .eq('id', keyRow.id)
        .then(() => {})
        .catch(() => {})
    } else {
      // Check rate limit
      if (org.monthly_limit > 0 && currentCount >= org.monthly_limit) {
        return {
          error: new Response(
            JSON.stringify({
              error: {
                message: `Monthly API limit reached (${org.monthly_limit} requests). Upgrade your plan at /developers.`,
                code: 'RATE_LIMIT_EXCEEDED',
                limit: org.monthly_limit,
                used: currentCount,
              }
            }),
            {
              status: 429,
              headers: {
                'Content-Type': 'application/json',
                'Retry-After': '86400',
                'X-RateLimit-Limit': String(org.monthly_limit),
                'X-RateLimit-Remaining': '0',
              }
            }
          )
        }
      }

      // Increment counter (fire-and-forget)
      supabaseAdmin
        .from('api_keys')
        .update({ monthly_count: currentCount + 1, last_used_at: now.toISOString() })
        .eq('id', keyRow.id)
        .then(() => {})
        .catch(() => {})
    }

    return {
      org: {
        id: org.id,
        name: org.name,
        plan: org.plan,
        monthlyLimit: org.monthly_limit,
      },
      key: {
        id: keyRow.id,
        name: keyRow.name,
        monthlyCount: currentCount,
      },
      anonymous: false,
    }
  } catch (err) {
    console.error('[API Auth] Validation failed:', err)
    return {
      error: new Response(
        JSON.stringify({ error: { message: 'Service temporarily unavailable', code: 'SERVICE_UNAVAILABLE' } }),
        { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '30' } }
      )
    }
  }
}
