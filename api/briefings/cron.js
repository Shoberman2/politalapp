import { supabaseAdmin } from '../_lib/supabase.js'
import {
  apiError,
  buildCivicBriefing,
  errorCode,
  errorStatus,
  getHeader,
  handleBriefingCors,
  json,
  renderBriefingEmail,
  sendResponse,
  sendGmailMessage,
} from '../_lib/civicBriefing.js'

const DAY_MS = 24 * 60 * 60 * 1000

function isDue(preference) {
  if (!preference.email_enabled) return false
  if (!preference.last_sent_at) return true
  const lastSent = new Date(preference.last_sent_at).getTime()
  if (!Number.isFinite(lastSent)) return true
  const interval = preference.frequency === 'daily' ? DAY_MS : 7 * DAY_MS
  return Date.now() - lastSent >= interval - 60 * 60 * 1000
}

function isCronAuthorized(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const authHeader = getHeader(req, 'authorization')
  return authHeader === `Bearer ${secret}`
}

async function loadConnection(userId) {
  const { data, error } = await supabaseAdmin
    .from('civic_briefing_gmail_connections')
    .select('*')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .maybeSingle()

  if (error) throw error
  return data
}

async function loadProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, subscription_status')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

async function route(req) {
  const cors = handleBriefingCors(req)
  if (cors) return cors

  if (req.method !== 'GET' && req.method !== 'POST') {
    return apiError('Method not allowed', 405, 'METHOD_NOT_ALLOWED')
  }
  if (!isCronAuthorized(req)) {
    return apiError('Unauthorized', 401, 'UNAUTHORIZED')
  }

  try {
    const { data: preferences, error } = await supabaseAdmin
      .from('civic_briefing_preferences')
      .select('id, user_id, target, frequency, email_enabled, last_sent_at')
      .eq('email_enabled', true)
      .order('last_sent_at', { ascending: true, nullsFirst: true })
      .limit(50)

    if (error) throw error

    const results = []
    for (const preference of (preferences || []).filter(isDue).slice(0, 20)) {
      try {
        const [profile, connection] = await Promise.all([
          loadProfile(preference.user_id),
          loadConnection(preference.user_id),
        ])

        if (profile?.subscription_status !== 'active') {
          results.push({ id: preference.id, status: 'skipped', reason: 'subscription_inactive' })
          continue
        }
        if (!profile.email || !connection) {
          results.push({ id: preference.id, status: 'skipped', reason: 'missing_email_or_gmail' })
          continue
        }

        const briefing = await buildCivicBriefing({ target: preference.target })
        const email = renderBriefingEmail(briefing)
        const sent = await sendGmailMessage({
          connection,
          to: profile.email,
          ...email,
        })

        await supabaseAdmin
          .from('civic_briefing_preferences')
          .update({ last_generated_at: briefing.generatedAt, last_sent_at: new Date().toISOString() })
          .eq('id', preference.id)

        results.push({ id: preference.id, status: 'sent', messageId: sent.id })
      } catch (err) {
        console.error('[Briefings] Cron item error:', preference.id, err)
        results.push({ id: preference.id, status: 'error', reason: err.message || 'send_failed' })
      }
    }

    return json({ processed: results.length, results })
  } catch (err) {
    console.error('[Briefings] Cron error:', err)
    return apiError(err.message || 'Unable to run briefing cron.', errorStatus(err), errorCode(err))
  }
}

export default async function handler(req, res) {
  return sendResponse(res, await route(req))
}

export const config = { runtime: 'nodejs' }
