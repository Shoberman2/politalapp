import { validateApiKey } from '../_lib/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'
import { handleCors, paginatedResponse, errorResponse, parsePagination } from '../_lib/response.js'
import { logUsage } from '../_lib/usage.js'

export default async function handler(req) {
  const cors = handleCors(req)
  if (cors) return cors

  const start = Date.now()
  const auth = await validateApiKey(req)
  if (auth.error) return auth.error

  const url = new URL(req.url, 'http://localhost')
  const { offset, limit } = parsePagination(req.url)
  const policyArea = url.searchParams.get('policy_area')
  const search = url.searchParams.get('search') || url.searchParams.get('q')
  const dateFrom = url.searchParams.get('date_from')
  const dateTo = url.searchParams.get('date_to')

  let query = supabaseAdmin
    .from('bills')
    .select('*', { count: 'exact' })

  if (policyArea) query = query.ilike('policy_area', `%${policyArea}%`)
  if (search) query = query.ilike('title', `%${search}%`)
  if (dateFrom) query = query.gte('introduced_at', dateFrom)
  if (dateTo) query = query.lte('introduced_at', dateTo)

  query = query.order('introduced_at', { ascending: false }).range(offset, offset + limit - 1)

  const { data, count, error } = await query

  if (error) {
    logUsage(auth.key.id, '/v1/bills', 'GET', 500, Date.now() - start)
    return errorResponse('Failed to fetch bills', 500, 'QUERY_ERROR')
  }

  logUsage(auth.key.id, '/v1/bills', 'GET', 200, Date.now() - start)

  return paginatedResponse(data, offset, limit, count || 0)
}

export const config = { runtime: 'nodejs' }
