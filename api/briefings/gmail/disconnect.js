import { supabaseAdmin } from '../../_lib/supabase.js'
import {
  apiError,
  decryptSecret,
  errorCode,
  errorStatus,
  getAuthedUser,
  handleBriefingCors,
  json,
  revokeGoogleToken,
  sendResponse,
} from '../../_lib/civicBriefing.js'

async function route(req) {
  const cors = handleBriefingCors(req)
  if (cors) return cors

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return apiError('Method not allowed', 405, 'METHOD_NOT_ALLOWED')
  }

  try {
    const user = await getAuthedUser(req)
    const { data: connection, error: readError } = await supabaseAdmin
      .from('civic_briefing_gmail_connections')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (readError) throw readError

    if (connection) {
      await revokeGoogleToken(decryptSecret(connection.refresh_token_ciphertext) || decryptSecret(connection.access_token_ciphertext))
      const { error } = await supabaseAdmin
        .from('civic_briefing_gmail_connections')
        .delete()
        .eq('user_id', user.id)
      if (error) throw error
    }

    return json({ disconnected: true })
  } catch (err) {
    console.error('[Briefings] Gmail disconnect error:', err)
    return apiError(err.message || 'Unable to disconnect Gmail.', errorStatus(err), errorCode(err))
  }
}

export default async function handler(req, res) {
  return sendResponse(res, await route(req))
}

export const config = { runtime: 'nodejs' }
