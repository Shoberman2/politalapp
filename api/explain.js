// GET /api/explain?bill=119-hr-7147
//
// The plain-English explanation of a bill, written by AI from the bill's own
// official text (shared/billExplainer.js) and stored, so it is written once.
// Used by the bill page on the website and in the iOS app. Agents get the
// same thing from the explain_bill MCP tool.
//
// 200 { status: 'ok', explanation }  cached at the CDN for a day
// 200 { status: 'no_source' }        Congress.gov has no text or summary yet
// 200 { status: 'unavailable' }      the model or Congress.gov failed, or a guess was rejected
// 404 { status: 'not_found' }        not a bill we carry
// 429                                too many first-time explanations from one IP

import { handleCors, jsonResponse, nodeHandler } from './_lib/response.js'
import { checkRateLimit } from './_lib/rateLimit.js'
import { clientIp, hashIp } from './_lib/clientIp.js'
import { getOrCreateExplanation, readExplanation, explanationPayload } from './_lib/explanations.js'
import { parseBillKey } from '../shared/billExplainer.js'

// Writing one costs a model call; reading one costs nothing. Only cache
// misses count against this.
const GENERATE_PER_MINUTE = 10
const GENERATE_PER_DAY = 300

const DAY = 'public, s-maxage=86400, stale-while-revalidate=604800'
const SHORT = 'public, s-maxage=900'

async function route(req) {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'GET') return jsonResponse({ status: 'error', error: 'GET only' }, 405, { Allow: 'GET' })

  const url = new URL(req.url, 'http://localhost')
  const key = parseBillKey(url.searchParams.get('bill'))
  if (!key) return jsonResponse({ status: 'not_found' }, 404, { 'Cache-Control': SHORT })
  const id = `${key.congress}-${key.type}-${key.number}`

  let cached
  try {
    cached = await readExplanation(id)
  } catch (err) {
    console.error(`[explain] ${id}:`, err.message)
    return jsonResponse({ status: 'unavailable', bill: id }, 200, { 'Cache-Control': 'no-store' })
  }
  if (cached) return jsonResponse({ status: 'ok', bill: id, explanation: explanationPayload(cached) }, 200, { 'Cache-Control': DAY })

  const rl = await checkRateLimit({ id: `explain:${hashIp(clientIp(req))}`, perMinute: GENERATE_PER_MINUTE, perDay: GENERATE_PER_DAY })
  if (!rl.allowed) return jsonResponse({ status: 'rate_limited' }, 429, { 'Retry-After': String(rl.retryAfter || 60), 'Cache-Control': 'no-store' })

  const out = await getOrCreateExplanation(id)
  if (out.status === 'ok') return jsonResponse({ status: 'ok', bill: id, explanation: explanationPayload(out.row) }, 200, { 'Cache-Control': DAY })
  if (out.status === 'not_found') return jsonResponse({ status: 'not_found' }, 404, { 'Cache-Control': SHORT })
  return jsonResponse({ status: out.status === 'no_source' ? 'no_source' : 'unavailable', bill: id }, 200, { 'Cache-Control': out.status === 'no_source' ? 'public, s-maxage=21600' : 'no-store' })
}

export default nodeHandler(route)

// Worst case: three Congress.gov fetches (20s each) and two model calls
// (90s each). The function must outlive them, or a paid-for result is lost.
export const config = { runtime: 'nodejs', maxDuration: 300 }
