import { validateApiKey } from '../../../_lib/auth.js'
import { supabaseAdmin } from '../../../_lib/supabase.js'
import { handleCors, jsonResponse, errorResponse } from '../../../_lib/response.js'
import { logUsage } from '../../../_lib/usage.js'

export default async function handler(req) {
  const cors = handleCors(req)
  if (cors) return cors

  const start = Date.now()
  const auth = await validateApiKey(req)
  if (auth.error) return auth.error

  const url = new URL(req.url, 'http://localhost')
  const segments = url.pathname.split('/')
  const bioguideId = segments[segments.length - 2]

  // Verify member exists
  const { data: member } = await supabaseAdmin
    .from('politicians')
    .select('id, name, chamber, state, district, party')
    .eq('id', bioguideId)
    .single()

  if (!member) {
    logUsage(auth.key.id, `/v1/members/${bioguideId}/stats`, 'GET', 404, Date.now() - start)
    return errorResponse(`Member not found: ${bioguideId}`, 404, 'NOT_FOUND')
  }

  const { data: stats, error } = await supabaseAdmin
    .from('member_stats')
    .select('*')
    .eq('politician_id', bioguideId)
    .order('congress', { ascending: false })

  if (error) {
    logUsage(auth.key.id, `/v1/members/${bioguideId}/stats`, 'GET', 500, Date.now() - start)
    return errorResponse('Failed to fetch stats', 500, 'QUERY_ERROR')
  }

  logUsage(auth.key.id, `/v1/members/${bioguideId}/stats`, 'GET', 200, Date.now() - start)

  return jsonResponse({
    data: {
      member,
      stats: stats || [],
    },
    meta: { api_version: 'v1' },
  })
}

export const config = { runtime: 'nodejs' }
