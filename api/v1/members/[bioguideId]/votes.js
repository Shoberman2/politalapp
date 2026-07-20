import { validateApiKey } from '../../../_lib/auth.js'
import { supabaseAdmin } from '../../../_lib/supabase.js'
import { handleCors, paginatedResponse, errorResponse, parsePagination, nodeHandler } from '../../../_lib/response.js'
import { logUsage } from '../../../_lib/usage.js'

async function route(req) {
  const cors = handleCors(req)
  if (cors) return cors

  const start = Date.now()
  const auth = await validateApiKey(req)
  if (auth.error) return auth.error

  const url = new URL(req.url, 'http://localhost')
  const segments = url.pathname.split('/')
  // /api/v1/members/[bioguideId]/votes -> bioguideId is at index -2
  const bioguideId = segments[segments.length - 2]
  const { offset, limit } = parsePagination(req.url)

  // Verify member exists
  const { data: member } = await supabaseAdmin
    .from('politicians')
    .select('id')
    .eq('id', bioguideId)
    .single()

  if (!member) {
    logUsage(auth.key.id, `/v1/members/${bioguideId}/votes`, 'GET', 404, Date.now() - start)
    return errorResponse(`Member not found: ${bioguideId}`, 404, 'NOT_FOUND')
  }

  const { data: votes, count, error } = await supabaseAdmin
    .from('votes')
    .select(`
      id, politician_id, bill_id, roll_call_id, position, voted_at, source_url,
      bills:bill_id (
        id, title, crs_summary, summary, policy_area, source_url
      )
    `, { count: 'exact' })
    .eq('politician_id', bioguideId)
    .order('voted_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    logUsage(auth.key.id, `/v1/members/${bioguideId}/votes`, 'GET', 500, Date.now() - start)
    return errorResponse('Failed to fetch votes', 500, 'QUERY_ERROR')
  }

  const formatted = (votes || []).map(v => ({
    id: v.id,
    politician_id: v.politician_id,
    bill_id: v.bill_id,
    roll_call_id: v.roll_call_id,
    position: v.position,
    voted_at: v.voted_at,
    source_url: v.source_url,
    bill: v.bills || null,
  }))

  logUsage(auth.key.id, `/v1/members/${bioguideId}/votes`, 'GET', 200, Date.now() - start)

  return paginatedResponse(formatted, offset, limit, count || 0)
}

export default nodeHandler(route)

export const config = { runtime: 'nodejs' }
