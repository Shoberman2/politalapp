import crypto from 'node:crypto'
import { supabaseAdmin } from '../../_lib/supabase.js'
import {
  apiError,
  buildGoogleAuthUrl,
  errorCode,
  errorStatus,
  getAuthedUser,
  getHeader,
  googleRedirectUri,
  handleBriefingCors,
  json,
  readJsonBody,
  requestOrigin,
  requireActiveSubscription,
  sendResponse,
} from '../../_lib/civicBriefing.js'

function safeRedirect(req, requested) {
  const fallback = `${requestOrigin(req)}/briefings`
  if (!requested) return fallback

  try {
    const url = new URL(requested)
    const allowed = new Set([
      requestOrigin(req),
      getHeader(req, 'origin'),
      'http://localhost:5173',
      'http://localhost:3000',
    ].filter(Boolean).map((origin) => origin.replace(/\/$/, '')))
    return allowed.has(url.origin) ? url.toString() : fallback
  } catch {
    return fallback
  }
}

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
    const state = crypto.randomUUID()
    const redirectTo = safeRedirect(req, body.redirectTo)
    const redirectUri = googleRedirectUri(req)

    const { error } = await supabaseAdmin
      .from('civic_briefing_gmail_states')
      .insert({ state, user_id: user.id, redirect_to: redirectTo })

    if (error) throw error

    return json({ url: buildGoogleAuthUrl({ state, redirectUri }) })
  } catch (err) {
    console.error('[Briefings] Gmail start error:', err)
    return apiError(err.message || 'Unable to connect Gmail.', errorStatus(err), errorCode(err))
  }
}

export default async function handler(req, res) {
  return sendResponse(res, await route(req))
}

export const config = { runtime: 'nodejs' }
