import { validateApiKey } from '../_lib/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'
import { handleCors, paginatedResponse, errorResponse, parsePagination, nodeHandler } from '../_lib/response.js'
import { logUsage } from '../_lib/usage.js'

async function route(req) {
  const cors = handleCors(req)
  if (cors) return cors

  const start = Date.now()
  const auth = await validateApiKey(req)
  if (auth.error) return auth.error

  const url = new URL(req.url, 'http://localhost')
  const { offset, limit } = parsePagination(req.url)
  const chamber = url.searchParams.get('chamber')?.toLowerCase()
  const dateFrom = url.searchParams.get('date_from')
  const dateTo = url.searchParams.get('date_to')

  // Use the view for enriched vote data
  let query = supabaseAdmin
    .from('recent_votes_with_details')
    .select('*', { count: 'exact' })

  if (chamber && ['house', 'senate'].includes(chamber)) query = query.eq('chamber', chamber)
  if (dateFrom) query = query.gte('voted_at', dateFrom)
  if (dateTo) query = query.lte('voted_at', dateTo)

  query = query.order('voted_at', { ascending: false }).range(offset, offset + limit - 1)

  const { data, count, error } = await query

  if (error) {
    logUsage(auth.key.id, '/v1/votes', 'GET', 500, Date.now() - start)
    return errorResponse('Failed to fetch votes', 500, 'QUERY_ERROR')
  }

  logUsage(auth.key.id, '/v1/votes', 'GET', 200, Date.now() - start)

  return paginatedResponse(data, offset, limit, count || 0)
}

export default nodeHandler(route)

export const config = { runtime: 'nodejs' }
