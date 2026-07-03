import { supabaseAdmin } from '../../_lib/supabase.js'
import {
  encryptSecret,
  exchangeGoogleCode,
  getGoogleUserInfo,
  getRequestUrl,
  googleRedirectUri,
  requestOrigin,
  sendResponse,
} from '../../_lib/civicBriefing.js'

function redirectWith(req, redirectTo, params) {
  const fallback = `${requestOrigin(req)}/briefings`
  const url = new URL(redirectTo || fallback)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return Response.redirect(url.toString(), 302)
}

async function route(req) {
  const url = new URL(getRequestUrl(req))
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')

  let stateRow = null

  try {
    if (!state) throw new Error('Missing OAuth state.')

    const { data, error } = await supabaseAdmin
      .from('civic_briefing_gmail_states')
      .select('state, user_id, redirect_to, created_at, consumed_at')
      .eq('state', state)
      .maybeSingle()

    if (error) throw error
    stateRow = data

    if (!stateRow) throw new Error('OAuth state was not found.')
    if (stateRow.consumed_at) throw new Error('OAuth state was already used.')
    if (Date.now() - new Date(stateRow.created_at).getTime() > 20 * 60 * 1000) {
      throw new Error('OAuth state expired. Try connecting Gmail again.')
    }
    if (oauthError) throw new Error(`Google authorization failed: ${oauthError}`)
    if (!code) throw new Error('Missing Google authorization code.')

    const redirectUri = googleRedirectUri(req)
    const token = await exchangeGoogleCode({ code, redirectUri })
    const userInfo = await getGoogleUserInfo(token.access_token)

    const { data: existing } = await supabaseAdmin
      .from('civic_briefing_gmail_connections')
      .select('refresh_token_ciphertext')
      .eq('user_id', stateRow.user_id)
      .maybeSingle()

    const refreshToken = token.refresh_token
      ? encryptSecret(token.refresh_token)
      : existing?.refresh_token_ciphertext || null
    const expiryDate = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null

    await supabaseAdmin
      .from('civic_briefing_gmail_connections')
      .upsert({
        user_id: stateRow.user_id,
        gmail_email: userInfo?.email || null,
        access_token_ciphertext: encryptSecret(token.access_token),
        refresh_token_ciphertext: refreshToken,
        scope: token.scope || '',
        token_type: token.token_type || 'Bearer',
        expiry_date: expiryDate,
        revoked_at: null,
        connected_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    await supabaseAdmin
      .from('civic_briefing_gmail_states')
      .update({ consumed_at: new Date().toISOString() })
      .eq('state', state)

    return redirectWith(req, stateRow.redirect_to, { gmail: 'connected' })
  } catch (err) {
    console.error('[Briefings] Gmail callback error:', err)
    return redirectWith(req, stateRow?.redirect_to, {
      gmail: 'error',
      message: err.message || 'Unable to connect Gmail.',
    })
  }
}

export default async function handler(req, res) {
  return sendResponse(res, await route(req))
}

export const config = { runtime: 'nodejs' }
