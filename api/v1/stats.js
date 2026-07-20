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
  const type = url.searchParams.get('type') || 'party_loyalty'
  const chamber = url.searchParams.get('chamber')?.toLowerCase()
  const limitParam = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10) || 20))

  try {
    if (type === 'party_loyalty') {
      let query = supabaseAdmin
        .from('member_stats')
        .select(`
          politician_id, congress, party_loyalty_pct, total_votes,
          politicians:politician_id (
            id, name, chamber, state, district, party
          )
        `)
        .gt('total_votes', 10)
        .order('party_loyalty_pct', { ascending: false })
        .limit(limitParam)

      if (chamber) {
        // Filter via join - get politicians in that chamber
        const { data: chamberMembers } = await supabaseAdmin
          .from('politicians')
          .select('id')
          .eq('chamber', chamber)

        if (chamberMembers) {
          const ids = chamberMembers.map(m => m.id)
          query = query.in('politician_id', ids)
        }
      }

      const { data, error } = await query
      if (error) throw error

      logUsage(auth.key.id, '/v1/stats', 'GET', 200, Date.now() - start)
      return jsonResponse({
        data: { type: 'party_loyalty', rankings: data || [] },
        meta: { api_version: 'v1' },
      })
    }

    if (type === 'attendance') {
      const { data, error } = await supabaseAdmin
        .from('member_stats')
        .select(`
          politician_id, congress, total_votes, not_voting_count,
          politicians:politician_id (
            id, name, chamber, state, district, party
          )
        `)
        .gt('total_votes', 0)
        .order('not_voting_count', { ascending: true })
        .limit(limitParam)

      if (error) throw error

      const ranked = (data || []).map(row => ({
        ...row,
        attendance_pct: row.total_votes > 0
          ? Math.round(((row.total_votes - row.not_voting_count) / row.total_votes) * 100)
          : 0,
      }))

      logUsage(auth.key.id, '/v1/stats', 'GET', 200, Date.now() - start)
      return jsonResponse({
        data: { type: 'attendance', rankings: ranked },
        meta: { api_version: 'v1' },
      })
    }

    if (type === 'bills_by_area') {
      const { data, error } = await supabaseAdmin
        .from('bills')
        .select('policy_area')
        .not('policy_area', 'is', null)

      if (error) throw error

      const counts = {}
      for (const bill of data || []) {
        counts[bill.policy_area] = (counts[bill.policy_area] || 0) + 1
      }

      const sorted = Object.entries(counts)
        .map(([area, count]) => ({ policy_area: area, bill_count: count }))
        .sort((a, b) => b.bill_count - a.bill_count)

      logUsage(auth.key.id, '/v1/stats', 'GET', 200, Date.now() - start)
      return jsonResponse({
        data: { type: 'bills_by_area', areas: sorted },
        meta: { api_version: 'v1' },
      })
    }

    logUsage(auth.key.id, '/v1/stats', 'GET', 400, Date.now() - start)
    return errorResponse(
      `Invalid type: ${type}. Valid types: party_loyalty, attendance, bills_by_area`,
      400,
      'INVALID_PARAMETER'
    )
  } catch (err) {
    logUsage(auth.key.id, '/v1/stats', 'GET', 500, Date.now() - start)
    return errorResponse('Failed to fetch stats', 500, 'QUERY_ERROR')
  }
}

export default nodeHandler(route)

export const config = { runtime: 'nodejs' }
