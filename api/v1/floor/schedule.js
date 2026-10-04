import { validateApiKey } from '../../_lib/auth.js'
import { handleCors, jsonResponse, errorResponse, nodeHandler } from '../../_lib/response.js'
import { logUsage } from '../../_lib/usage.js'
import { getDataUpdatedAt } from '../../_lib/etlMeta.js'
import { loadFloorSchedule, resolveFloorWeeks } from '../../_lib/floorSchedule.js'

export { SENATE_NOTE, presentWeek, _resetFloorScheduleMemo } from '../../_lib/floorSchedule.js'

// GET /api/v1/floor/schedule
//
// The House "Bills This Week" schedule for this week and next (when the
// Majority Leader has published it), parsed server-side from docs.house.gov.
// The alerts pipeline stores floor items only for bills someone follows, so it
// can't answer "what is on the floor"; this reads the source directly and
// leans on the CDN (anonymous responses get s-maxage=300 from nodeHandler)
// plus a short per-instance memo (api/_lib/floorSchedule.js) so a burst
// doesn't fan out upstream. The MCP tool get_floor_schedule reads the same path.

const ENDPOINT = '/v1/floor/schedule'

async function route(req) {
  const cors = handleCors(req)
  if (cors) return cors

  const start = Date.now()
  const auth = await validateApiKey(req)
  if (auth.error) return auth.error

  const url = new URL(req.url, 'http://localhost')
  const weeks = resolveFloorWeeks(url.searchParams.get('week'))
  if (!weeks) {
    logUsage(auth.key, ENDPOINT, 'GET', 400, Date.now() - start)
    return errorResponse('Invalid week: use a real date (YYYY-MM-DD) from 2010 to 60 days ahead; any day of the week', 400, 'INVALID_PARAMETER')
  }

  const { allFailed, data } = await loadFloorSchedule(weeks)
  if (allFailed) {
    logUsage(auth.key, ENDPOINT, 'GET', 502, Date.now() - start)
    return errorResponse('The House floor schedule could not be fetched from docs.house.gov', 502, 'UPSTREAM_ERROR')
  }

  logUsage(auth.key, ENDPOINT, 'GET', 200, Date.now() - start)
  // A week that failed upstream must not be cached for an hour as "unavailable".
  const partial = data.weeks.some((w) => w.status === 'unavailable')
  return jsonResponse({
    data,
    meta: { api_version: 'v1', data_updated_at: await getDataUpdatedAt() },
  }, 200, partial ? { 'Cache-Control': req.headers?.authorization ? 'no-store' : 'public, s-maxage=30', Vary: 'Authorization' } : {})
}

export default nodeHandler(route)

export const config = { runtime: 'nodejs' }
