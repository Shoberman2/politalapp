// Claim the free API plan. The signed-in user's organization becomes
// plan = 'free' / subscription_status = 'active' with no Stripe step. Free
// keys have no monthly cap (monthly_limit = 0) and are limited per minute in
// api/_lib/auth.js. A paid plan that is active or in Stripe dunning is never
// touched here; billing state for those goes through Stripe.

import { supabaseAdmin } from '../_lib/supabase.js'
import { getHeader, sendResponse } from '../_lib/request.js'
import { jsonResponse, errorResponse, handleCors } from '../_lib/response.js'
import { checkRateLimit } from '../_lib/rateLimit.js'

export const FREE_MONTHLY_LIMIT = Number(process.env.API_FREE_MONTHLY_LIMIT || 0)
const ORG_FIELDS = 'id, plan, subscription_status, subscription_id, monthly_limit'

async function route(req) {
  const cors = handleCors(req, { methods: 'POST, OPTIONS' })
  if (cors) return cors
  if (req.method !== 'POST') return errorResponse('Use POST', 405, 'METHOD_NOT_ALLOWED')

  const auth = getHeader(req, 'authorization')
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return errorResponse('Sign in to claim a free key', 401, 'UNAUTHORIZED')

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  const user = userData?.user
  if (userError || !user) return errorResponse('Session is not valid', 401, 'UNAUTHORIZED')

  const rl = await checkRateLimit({ id: `free:${user.id}`, perMinute: 5 })
  if (!rl.allowed) return errorResponse('Too many attempts. Try again in a minute.', 429, 'RATE_LIMIT_EXCEEDED')

  const { data: orgs, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select(ORG_FIELDS)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
  if (orgError) return errorResponse('Could not read organization', 500, 'ORG_READ_FAILED')
  const org = orgs?.[0] || null

  if (!org) {
    const { data: created, error: createError } = await supabaseAdmin
      .from('organizations')
      .insert({ name: `${user.email || 'BallotWatch user'}'s Organization`, owner_id: user.id, plan: 'free', subscription_status: 'active', monthly_limit: FREE_MONTHLY_LIMIT })
      .select(ORG_FIELDS)
      .single()
    if (createError && createError.code === '23505') {
      // Lost a race with a concurrent claim or the client's own insert; use theirs.
      const { data: existing } = await supabaseAdmin.from('organizations').select(ORG_FIELDS).eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1)
      if (existing?.[0]) return jsonResponse({ data: existing[0], meta: { created: false, raced: true } })
    }
    if (createError) return errorResponse('Could not create organization', 500, 'ORG_CREATE_FAILED')
    return jsonResponse({ data: created, meta: { created: true } })
  }

  if (org.plan === 'free' && org.subscription_status === 'active') {
    return jsonResponse({ data: org, meta: { unchanged: true, reason: 'free plan already active' } })
  }

  // Paid plans, including ones Stripe is still trying to collect on, stay
  // with Stripe. Only inactive or canceled organizations can switch to free.
  if (org.plan !== 'free' && ['active', 'past_due'].includes(org.subscription_status)) {
    return jsonResponse({ data: org, meta: { unchanged: true, reason: 'paid plan on file; manage billing first' } })
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('organizations')
    .update({ plan: 'free', subscription_status: 'active', monthly_limit: FREE_MONTHLY_LIMIT, subscription_id: null })
    .eq('id', org.id)
    .select(ORG_FIELDS)
    .single()
  if (updateError) return errorResponse('Could not activate free plan', 500, 'ORG_UPDATE_FAILED')
  return jsonResponse({ data: updated, meta: { created: false } })
}

export default async function handler(req, res) {
  return sendResponse(res, await route(req))
}

export const config = { runtime: 'nodejs' }
