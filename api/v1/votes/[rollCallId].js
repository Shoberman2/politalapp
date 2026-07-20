import { validateApiKey } from '../../_lib/auth.js'
import { supabaseAdmin } from '../../_lib/supabase.js'
import { handleCors, jsonResponse, errorResponse, nodeHandler } from '../../_lib/response.js'
import { logUsage } from '../../_lib/usage.js'

async function route(req) {
  const cors = handleCors(req)
  if (cors) return cors

  const start = Date.now()
  const auth = await validateApiKey(req)
  if (auth.error) return auth.error

  const url = new URL(req.url, 'http://localhost')
  const rollCallId = decodeURIComponent(url.pathname.split('/').pop())

  // Get all votes for this roll call with member info
  const { data: votes, error } = await supabaseAdmin
    .from('votes')
    .select(`
      id, politician_id, position, voted_at, source_url, bill_id,
      politicians:politician_id (
        id, name, chamber, state, district, party, photo_url
      ),
      bills:bill_id (
        id, title, crs_summary, summary, policy_area, source_url
      )
    `)
    .eq('roll_call_id', rollCallId)
    .order('position')

  if (error) {
    logUsage(auth.key.id, `/v1/votes/${rollCallId}`, 'GET', 500, Date.now() - start)
    return errorResponse('Failed to fetch roll call', 500, 'QUERY_ERROR')
  }

  if (!votes || votes.length === 0) {
    logUsage(auth.key.id, `/v1/votes/${rollCallId}`, 'GET', 404, Date.now() - start)
    return errorResponse(`Roll call not found: ${rollCallId}`, 404, 'NOT_FOUND')
  }

  // Aggregate vote counts
  const summary = {
    yea: votes.filter(v => v.position === 'Yea').length,
    nay: votes.filter(v => v.position === 'Nay').length,
    present: votes.filter(v => v.position === 'Present').length,
    not_voting: votes.filter(v => v.position === 'Not Voting').length,
    total: votes.length,
  }

  const bill = votes[0]?.bills || null

  const formatted = votes.map(v => ({
    position: v.position,
    member: v.politicians || null,
  }))

  logUsage(auth.key.id, `/v1/votes/${rollCallId}`, 'GET', 200, Date.now() - start)

  return jsonResponse({
    data: {
      roll_call_id: rollCallId,
      voted_at: votes[0]?.voted_at,
      bill,
      summary,
      votes: formatted,
    },
    meta: { api_version: 'v1' },
  })
}

export default nodeHandler(route)

export const config = { runtime: 'nodejs' }
