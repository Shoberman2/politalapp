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
  const state = url.searchParams.get('state')?.toUpperCase()
  const chamber = url.searchParams.get('chamber')?.toLowerCase()
  const party = url.searchParams.get('party')

  let query = supabaseAdmin
    .from('politicians')
    .select('*', { count: 'exact' })

  if (state) query = query.eq('state', state)
  if (chamber && ['house', 'senate'].includes(chamber)) query = query.eq('chamber', chamber)
  if (party) query = query.ilike('party', `%${party}%`)

  query = query.order('name').range(offset, offset + limit - 1)

  const { data, count, error } = await query

  if (error) {
    logUsage(auth.key.id, '/v1/members', 'GET', 500, Date.now() - start)
    return errorResponse('Failed to fetch members', 500, 'QUERY_ERROR')
  }

  // Get data freshness
  const { data: meta } = await supabaseAdmin
    .from('etl_metadata')
    .select('value')
    .eq('key', 'last_successful_run')
    .maybeSingle()

  logUsage(auth.key.id, '/v1/members', 'GET', 200, Date.now() - start)

  return paginatedResponse(data, offset, limit, count || 0, {
    data_updated_at: meta?.value || null,
  })
}

export default nodeHandler(route)

export const config = { runtime: 'nodejs' }
