// Vercel function wrapper around upstreamProxy.js: per-IP rate limiting
// (the public API's limiter, separate bucket) in front of the proxy.
import { proxyUpstream } from './upstreamProxy.js'
import { checkRateLimit } from './rateLimit.js'
import { clientIp, hashIp } from './clientIp.js'
import { getRequestUrl, sendResponse } from './request.js'

// One page view can fan out into many upstream reads (member lists, vote
// tallies), so the browser proxy allows more than the public API's 60/min.
export const PROXY_PER_MINUTE = Number(process.env.PROXY_PER_MINUTE || 240)
export const PROXY_PER_DAY = Number(process.env.PROXY_PER_DAY || 20000)

export async function proxyRoute(service, req, { env = process.env, fetchImpl } = {}) {
  const method = String(req.method || '').toUpperCase()
  if (method !== 'GET') {
    // Rejected before any key is read or any upstream call is made.
    return proxyUpstream({ service, method, url: req.url || '/', env: {} })
  }

  const rl = await checkRateLimit({
    id: `proxy:ip:${hashIp(clientIp(req))}`,
    perMinute: PROXY_PER_MINUTE,
    perDay: PROXY_PER_DAY,
  })
  if (!rl.allowed) {
    return {
      status: 429,
      body: JSON.stringify({ error: { message: `Rate limit reached (${rl.limit} per ${rl.window}).`, code: 'RATE_LIMIT_EXCEEDED' } }),
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': String(rl.retryAfter || 60),
      },
    }
  }

  return proxyUpstream({ service, method, url: getRequestUrl(req), env, fetchImpl })
}

export function proxyHandler(service) {
  return async function handler(req, res) {
    const out = await proxyRoute(service, req)
    return sendResponse(res, new Response(out.body, { status: out.status, headers: out.headers }))
  }
}
