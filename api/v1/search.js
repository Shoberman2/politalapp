import { validateApiKey } from '../_lib/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'
import { handleCors, jsonResponse, errorResponse, nodeHandler } from '../_lib/response.js'
import { logUsage } from '../_lib/usage.js'

async function route(req) {
  const cors = handleCors(req)
  if (cors) return cors

  const start = Date.now()
  const auth = await validateApiKey(req)
  if (auth.error) return auth.error

  const url = new URL(req.url, 'http://localhost')
  const query = url.searchParams.get('q') || url.searchParams.get('query')
  const type = url.searchParams.get('type') // 'members', 'bills', or null for both
  const limitParam = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10) || 10))

  if (!query || query.trim().length === 0) {
    logUsage(auth.key.id, '/v1/search', 'GET', 400, Date.now() - start)
    return errorResponse('Missing required parameter: q (search query)', 400, 'MISSING_PARAMETER')
  }

  const searchTerm = query.trim()
  const results = {}

  try {
    if (!type || type === 'members') {
      const { data: members, error } = await supabaseAdmin
        .from('politicians')
        .select('*')
        .ilike('name', `%${searchTerm}%`)
        .limit(limitParam)

      if (!error) results.members = members || []
    }

    if (!type || type === 'bills') {
      const { data: bills, error } = await supabaseAdmin
        .from('bills')
        .select('*')
        .ilike('title', `%${searchTerm}%`)
        .order('introduced_at', { ascending: false })
        .limit(limitParam)

      if (!error) results.bills = bills || []
    }

    logUsage(auth.key.id, '/v1/search', 'GET', 200, Date.now() - start)

    return jsonResponse({
      data: results,
      meta: {
        api_version: 'v1',
        query: searchTerm,
        type: type || 'all',
      },
    })
  } catch (err) {
    logUsage(auth.key.id, '/v1/search', 'GET', 500, Date.now() - start)
    return errorResponse('Search failed', 500, 'QUERY_ERROR')
  }
}

export default nodeHandler(route)

export const config = { runtime: 'nodejs' }
