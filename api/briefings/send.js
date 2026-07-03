import { supabaseAdmin } from '../_lib/supabase.js'
import {
  apiError,
  buildCivicBriefing,
  errorCode,
  errorStatus,
  getAuthedUser,
  handleBriefingCors,
  json,
  readJsonBody,
  renderBriefingEmail,
  requireActiveSubscription,
  sendResponse,
  sendGmailMessage,
} from '../_lib/civicBriefing.js'

async function getActiveConnection(userId) {
  const { data, error } = await supabaseAdmin
    .from('civic_briefing_gmail_connections')
    .select('*')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .maybeSingle()

  if (error) throw error
  return data
}

async function getPreference(userId, preferenceId) {
  let query = supabaseAdmin
    .from('civic_briefing_preferences')
    .select('id, target, frequency, email_enabled')
    .eq('user_id', userId)

  query = preferenceId
    ? query.eq('id', preferenceId)
    : query.order('updated_at', { ascending: false }).limit(1)

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data
}

async function route(req) {
  const cors = handleBriefingCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return apiError('Method not allowed', 405, 'METHOD_NOT_ALLOWED')
  }

  try {
    const user = await getAuthedUser(req)
    const profile = await requireActiveSubscription(user.id)
    const body = await readJsonBody(req).catch(() => ({}))
    const preference = await getPreference(user.id, body.preferenceId)
    const target = String(body.target || preference?.target || '').trim()

    if (!target) return apiError('Save a briefing target first.', 400, 'TARGET_REQUIRED')

    const connection = await getActiveConnection(user.id)
    if (!connection) {
      return apiError('Connect Gmail before sending a Civic Briefing.', 409, 'GMAIL_NOT_CONNECTED')
    }

    const briefing = await buildCivicBriefing({ target })
    const email = renderBriefingEmail(briefing)
    const sent = await sendGmailMessage({
      connection,
      to: profile.email,
      ...email,
    })

    if (preference?.id) {
      await supabaseAdmin
        .from('civic_briefing_preferences')
        .update({ last_generated_at: briefing.generatedAt, last_sent_at: new Date().toISOString() })
        .eq('id', preference.id)
        .eq('user_id', user.id)
    }

    return json({ sent, briefing })
  } catch (err) {
    console.error('[Briefings] Send error:', err)
    return apiError(err.message || 'Unable to send briefing.', errorStatus(err), errorCode(err))
  }
}

export default async function handler(req, res) {
  return sendResponse(res, await route(req))
}

export const config = { runtime: 'nodejs' }
