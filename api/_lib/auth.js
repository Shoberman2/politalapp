import { createHash } from 'crypto'
import { supabaseAdmin } from './supabase.js'
import { errorResponse } from './response.js'

function hashKey(rawKey) {
  return createHash('sha256').update(rawKey).digest('hex')
}

/**
 * Validate an API key from the Authorization header.
 * Returns { org, key } on success, or a Response on failure.
 */
export async function validateApiKey(req) {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
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
      return { error: errorResponse('Organization subscription is not active. Visit /developers to subscribe.', 403, 'SUBSCRIPTION_INACTIVE') }
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
