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
  requireActiveSubscription,
  sendResponse,
} from '../_lib/civicBriefing.js'

async function route(req) {
  const cors = handleBriefingCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return apiError('Method not allowed', 405, 'METHOD_NOT_ALLOWED')
  }

  try {
    const user = await getAuthedUser(req)
    await requireActiveSubscription(user.id)

    const body = await readJsonBody(req).catch(() => ({}))
    const target = String(body.target || '').trim()
    if (!target) return apiError('Enter a district or candidate.', 400, 'TARGET_REQUIRED')

    const briefing = await buildCivicBriefing({ target })

    if (body.preferenceId) {
      await supabaseAdmin
        .from('civic_briefing_preferences')
        .update({ last_generated_at: briefing.generatedAt })
        .eq('id', body.preferenceId)
        .eq('user_id', user.id)
    }

    return json({ briefing })
  } catch (err) {
    console.error('[Briefings] Preview error:', err)
    return apiError(err.message || 'Unable to generate briefing.', errorStatus(err), errorCode(err))
  }
}

export default async function handler(req, res) {
  return sendResponse(res, await route(req))
}

export const config = { runtime: 'nodejs' }
