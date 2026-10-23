// Vercel Routing Middleware. Two jobs:
//
// 1. Rewrite `/` to the server-rendered homepage. The homepage is rendered by
//    api/prerender.js (kind=home). A vercel.json rewrite alone cannot reach
//    it: Vercel checks the filesystem before rewrites, and dist/index.html
//    answers `/`. Middleware runs before the filesystem and the CDN cache, so
//    it rewrites `/` to the prerender function; the function's response is
//    still cached at the CDN (s-maxage). The vercel.json rewrite for `/`
//    stays as the static fallback should index.html ever stop being served.
//    This is the header `rewrite()` from @vercel/functions sets; written out
//    to avoid adding a dependency for one line.
//
// 2. Count AI agents. A request from a known AI agent (shared/agents.js), or
//    from a script or SDK on an agent surface (/api/v1, llms.txt, /data,
//    /.well-known, openapi.yaml), becomes one agent_events row, written after
//    the response through waitUntil so it adds no latency. MCP POSTs are
//    logged by api/mcp.js instead, with the tool name. Browsers are never
//    logged. Static build assets are outside the matcher.

import { classifyAgent, classifyClient, agentSurface } from './shared/agents.js'
import { logAgentEvent, clientIpFromHeaders } from './shared/agentLog.js'

export const config = {
  matcher: ['/', '/((?!assets/|fonts/|favicon|apple-touch-icon|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|map|woff2?|ttf|otf)$).*)'],
}

export const HOME_PRERENDER_PATH = '/api/prerender?kind=home'
export const HOME_MARKDOWN_PATH = '/api/prerender?kind=home&format=md'

// Markdown is rewritten to its own URL so the CDN caches HTML and Markdown
// under different keys and never relies on `Vary: Accept` alone (one
// Markdown request must not be able to replace the cached HTML homepage).
export function prefersMarkdown(accept) {
  const a = String(accept || '')
  return /text\/markdown/i.test(a) && !/text\/html/i.test(a.split(',')[0])
}

/** The agent_events row this request should produce, or null. */
export function agentEventFor(request) {
  const url = new URL(request.url)
  const surface = agentSurface(url.pathname)
  if (surface === 'mcp' && request.method === 'POST') return null
  if (request.method === 'OPTIONS' || request.method === 'HEAD') return null
  const ua = request.headers.get('user-agent') || ''
  const who = surface ? classifyClient(ua) : classifyAgent(ua)
  if (!who) return null
  const get = (h) => request.headers.get(h)
  const accept = get('accept') || ''
  return {
    surface: surface || 'page',
    path: url.pathname + (url.search.length > 1 ? url.search.slice(0, 200) : ''),
    who,
    userAgent: ua,
    ip: clientIpFromHeaders(get),
    country: get('x-vercel-ip-country'),
    detail: /text\/markdown/i.test(accept) ? { accept: 'markdown' } : null,
  }
}

export default function middleware(request, context) {
  const event = agentEventFor(request)
  if (event) {
    const pending = logAgentEvent(event)
    if (context?.waitUntil) context.waitUntil(pending)
  }

  const url = new URL(request.url)
  if (url.pathname !== '/') return undefined
  const target = prefersMarkdown(request.headers.get('accept')) ? HOME_MARKDOWN_PATH : HOME_PRERENDER_PATH
  return new Response(null, {
    headers: { 'x-middleware-rewrite': new URL(target, url).toString() },
  })
}
