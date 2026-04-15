import { validateApiKey } from '../../_lib/auth.js'
import { supabaseAdmin } from '../../_lib/supabase.js'
import { handleCors, jsonResponse, errorResponse } from '../../_lib/response.js'
import { logUsage } from '../../_lib/usage.js'

export default async function handler(req) {
  const cors = handleCors(req)
  if (cors) return cors

  const start = Date.now()
  const auth = await validateApiKey(req)
  if (auth.error) return auth.error

  const url = new URL(req.url, 'http://localhost')
  const bioguideId = url.pathname.split('/').pop()

  const { data: member, error } = await supabaseAdmin
    .from('politicians')
    .select('*')
    .eq('id', bioguideId)
    .single()

  if (error || !member) {
    logUsage(auth.key.id, `/v1/members/${bioguideId}`, 'GET', 404, Date.now() - start)
    return errorResponse(`Member not found: ${bioguideId}`, 404, 'NOT_FOUND')
  }

  logUsage(auth.key.id, `/v1/members/${bioguideId}`, 'GET', 200, Date.now() - start)

  return jsonResponse({
    data: member,
    meta: { api_version: 'v1' },
  })
}

export const config = { runtime: 'nodejs' }
