// Server-side proxy for the two api.data.gov-keyed services the SPA reads:
// Congress.gov and OpenFEC. api.data.gov's terms say not to expose keys in
// client code, so the browser calls /api/proxy/<service>/<path> and the key is
// added here. This module is runtime-agnostic (no Supabase, no Node request
// objects) so the Vercel functions in api/proxy/ and the Vite dev middleware
// in vite.config.js share it.
//
// It is not an open proxy: the upstream host is fixed per service, only GET
// is accepted, and the path must match an allow-list of the endpoints the app
// actually uses. Client-supplied api_key parameters are dropped. The key never
// appears in a response body, header, or log line.

export const PROXY_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=3600'
const UPSTREAM_TIMEOUT_MS = 15_000

// Path segments are restricted to characters that appear in Congress.gov and
// OpenFEC resource ids. No dots-only segments, no percent-encoding, no empty
// segments, so traversal and smuggling are impossible.
const SEGMENT = '[A-Za-z0-9_-][A-Za-z0-9._-]*'

export const PROXY_SERVICES = {
  congress: {
    upstream: 'https://api.congress.gov/v3',
    // VITE_CONGRESS_API_KEY is a legacy name still set in Vercel production.
    // It is read here, on the server only; no browser code references it, so
    // Vite never inlines it. Remove the fallback once Vercel uses the plain name.
    envKeys: ['CONGRESS_API_KEY', 'VITE_CONGRESS_API_KEY'],
    fallbackKey: null,
    // /member, /member/:id, /member/:id/sponsored-legislation,
    // /bill[/:congress[/:type[/:number[/summaries|text|cosponsors|committees|actions]]]],
    // /house-vote/:congress[/...], /vote/:congress/:chamber/:roll (recordedVotes urls).
    allow: [
      new RegExp(`^/member(?:/${SEGMENT}(?:/sponsored-legislation)?)?/?$`),
      new RegExp(`^/bill(?:/\\d{2,3}(?:/[a-z]{1,8}(?:/\\d{1,6}(?:/(?:summaries|text|cosponsors|committees|actions))?)?)?)?/?$`),
      new RegExp(`^/house-vote(?:/${SEGMENT}){1,4}/?$`),
      new RegExp(`^/vote(?:/${SEGMENT}){1,4}/?$`),
    ],
  },
  fec: {
    upstream: 'https://api.open.fec.gov/v1',
    // FEC_API_KEY is the preferred name; VITE_FEC_API_KEY is the legacy one.
    envKeys: ['FEC_API_KEY', 'VITE_FEC_API_KEY'],
    // The SPA previously fell back to OpenFEC's shared DEMO_KEY; keep that so
    // an unset key degrades to heavy rate limiting rather than a hard failure.
    fallbackKey: 'DEMO_KEY',
    allow: [
      /^\/candidates\/search\/?$/,
      new RegExp(`^/candidate/${SEGMENT}/(?:committees|totals)/?$`),
      /^\/schedules\/schedule_a\/?$/,
    ],
  },
}

export function isAllowedPath(service, path) {
  const def = PROXY_SERVICES[service]
  if (!def || typeof path !== 'string') return false
  if (path.length > 300 || path.includes('..') || path.includes('//')) return false
  return def.allow.some((re) => re.test(path))
}

/** First non-empty server env value for the service, else its fallback. */
export function resolveServiceKey(service, env) {
  const def = PROXY_SERVICES[service]
  if (!def) return null
  for (const name of def.envKeys) {
    const value = String(env?.[name] || '').trim()
    if (value) return value
  }
  return def.fallbackKey
}

function jsonBody(message, code) {
  return JSON.stringify({ error: { message, code } })
}

function result(status, body, headers = {}) {
  return {
    status,
    body,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  }
}

function redact(text, key) {
  if (!key || !text) return text
  return text.split(key).join('[redacted]')
}

/**
 * Resolve the upstream path from a proxy request URL. Accepts either the
 * original form (/api/proxy/<service>/<path>) or the rewritten form
 * (/api/proxy/<service>?path=<path>) produced by vercel.json.
 *
 * @returns {{ path: string|null, params: URLSearchParams }}
 */
export function parseProxyUrl(service, rawUrl) {
  const url = new URL(rawUrl, 'http://localhost')
  const params = new URLSearchParams(url.search)
  const prefix = `/api/proxy/${service}/`
  let path = null
  if (url.pathname.startsWith(prefix)) {
    path = `/${url.pathname.slice(prefix.length)}`
  } else {
    const fromQuery = params.getAll('path')
    if (fromQuery.length === 1) path = `/${fromQuery[0].replace(/^\/+/, '')}`
  }
  params.delete('path')
  return { path, params }
}

/**
 * @param {object} opts
 * @param {'congress'|'fec'} opts.service
 * @param {string} opts.method
 * @param {string} opts.url        request URL (absolute or path + query)
 * @param {Record<string,string|undefined>} opts.env  server environment
 * @param {typeof fetch} [opts.fetchImpl]
 * @returns {Promise<{status:number, body:string, headers:Record<string,string>}>}
 */
export async function proxyUpstream({ service, method, url, env, fetchImpl = fetch }) {
  const def = PROXY_SERVICES[service]
  if (!def) return result(404, jsonBody('Unknown proxy service', 'NOT_FOUND'))

  const verb = String(method || '').toUpperCase()
  if (verb !== 'GET') {
    return result(405, jsonBody('Only GET is supported', 'METHOD_NOT_ALLOWED'), { Allow: 'GET' })
  }

  const { path, params } = parseProxyUrl(service, url)
  if (!path || !isAllowedPath(service, path)) {
    return result(404, jsonBody('Path is not available through this proxy', 'PATH_NOT_ALLOWED'))
  }

  for (const name of [...params.keys()]) {
    if (name.toLowerCase() === 'api_key') params.delete(name)
  }

  const key = resolveServiceKey(service, env)
  if (!key) {
    console.error(`[Proxy:${service}] ${def.envKeys[0]} is not configured`)
    return result(503, jsonBody('Upstream data source is not configured', 'PROXY_NOT_CONFIGURED'))
  }
  params.set('api_key', key)

  const target = `${def.upstream}${path}?${params.toString()}`
  let upstream
  try {
    upstream = await fetchImpl(target, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
    console.error(`[Proxy:${service}] upstream ${timedOut ? 'timeout' : 'request failed'} for ${path}`)
    return result(timedOut ? 504 : 502, jsonBody('Upstream request failed', timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR'))
  }

  const text = redact(await upstream.text(), key)
  const ok = upstream.status >= 200 && upstream.status < 300
  if (!ok) console.warn(`[Proxy:${service}] upstream ${upstream.status} for ${path}`)

  const headers = {
    'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    'Cache-Control': ok ? PROXY_CACHE_CONTROL : 'no-store',
  }
  const retryAfter = upstream.headers.get('retry-after')
  if (retryAfter) headers['Retry-After'] = retryAfter

  return { status: upstream.status, body: text, headers }
}
