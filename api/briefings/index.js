import { supabaseAdmin } from '../_lib/supabase.js'
import {
  apiError,
  errorCode,
  errorStatus,
  getAuthedUser,
  getProfile,
  handleBriefingCors,
  inferTargetKind,
  json,
  readJsonBody,
  requireActiveSubscription,
  sendResponse,
} from '../_lib/civicBriefing.js'

function normalizePayload(payload = {}) {
  const target = String(payload.target || '').trim()
  return {
    target,
    target_kind: payload.targetKind || inferTargetKind(target),
    frequency: payload.frequency === 'daily' ? 'daily' : 'weekly',
    email_enabled: payload.emailEnabled !== false,
    neutral_tone: true,
    source_links: true,
  }
}

async function getConnectionStatus(userId) {
  const { data, error } = await supabaseAdmin
    .from('civic_briefing_gmail_connections')
    .select('gmail_email, connected_at, updated_at, revoked_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return {
    connected: !!data && !data.revoked_at,
    email: data?.gmail_email || null,
    connectedAt: data?.connected_at || null,
    revokedAt: data?.revoked_at || null,
  }
}

async function route(req) {
  const cors = handleBriefingCors(req)
  if (cors) return cors

  if (!['GET', 'POST'].includes(req.method)) {
    return apiError('Method not allowed', 405, 'METHOD_NOT_ALLOWED')
  }

  try {
    const user = await getAuthedUser(req)

    if (req.method === 'GET') {
      const [{ data: preferences, error: preferencesError }, profile, gmail] = await Promise.all([
        supabaseAdmin
          .from('civic_briefing_preferences')
          .select('id, target, target_kind, frequency, email_enabled, last_generated_at, last_sent_at, created_at, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false }),
        getProfile(user.id),
        getConnectionStatus(user.id),
      ])

      if (preferencesError) throw preferencesError

      return json({
        profile,
        isSubscribed: profile?.subscription_status === 'active',
        gmail,
        preferences: preferences || [],
      })
    }

    await requireActiveSubscription(user.id)
    const payload = normalizePayload(await readJsonBody(req).catch(() => ({})))
    if (!payload.target) {
      return apiError('Enter a district or candidate.', 400, 'TARGET_REQUIRED')
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('civic_briefing_preferences')
      .select('id')
      .eq('user_id', user.id)
      .ilike('target', payload.target)
      .maybeSingle()

    if (existingError) throw existingError

    const query = existing
      ? supabaseAdmin
        .from('civic_briefing_preferences')
        .update(payload)
        .eq('id', existing.id)
        .select('id, target, target_kind, frequency, email_enabled, last_generated_at, last_sent_at, created_at, updated_at')
        .single()
      : supabaseAdmin
        .from('civic_briefing_preferences')
        .insert({ ...payload, user_id: user.id })
        .select('id, target, target_kind, frequency, email_enabled, last_generated_at, last_sent_at, created_at, updated_at')
        .single()

    const { data, error } = await query
    if (error) throw error

    return json({ preference: data }, existing ? 200 : 201)
  } catch (err) {
    console.error('[Briefings] Settings error:', err)
    return apiError(err.message || 'Unable to update Civic Briefings.', errorStatus(err), errorCode(err))
  }
}

export default async function handler(req, res) {
  return sendResponse(res, await route(req))
}

export const config = { runtime: 'nodejs' }
