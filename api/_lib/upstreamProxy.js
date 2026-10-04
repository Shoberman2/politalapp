// Server-side proxy for the two api.data.gov-keyed services the SPA reads:
// Congress.gov and OpenFEC. api.data.gov's terms say not to expose keys in
// client code, so the browser calls /api/proxy/<service>/<path> and the key is
// added here. This module is runtime-agnostic (no Supabase, no Node request
// objects) so the Vercel functions in api/proxy/ and the Vite dev middleware
// in vite.config.js share it.
//
// It is not an open proxy: the upstream host is fixed per service, only GET
// is accepted, and the path must match an allow-list of the endpoints the app
// actually uses. Query parameters are allow-listed by name per service (so
// junk or cache-busting parameters never reach the upstream, and api_key can
// never be supplied by a client), page sizes are clamped, and Congress.gov is
// always asked for JSON. The key never appears in a response body, header, or
// log line.

export const PROXY_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=3600'
// Upstream 429/5xx are cached briefly at the CDN so a burst of identical
// requests during an upstream outage does not keep spending the key's quota.
export const PROXY_ERROR_CACHE_CONTROL = 'public, s-maxage=30'
// Largest upstream body we relay. The biggest legitimate response (250
// members or bills per page) is well under 1 MB.
export const MAX_UPSTREAM_BYTES = 4 * 1024 * 1024
const UPSTREAM_TIMEOUT_MS = 15_000
// The proxy only ever serves JSON. CSP sandbox makes sure that even a body
// that a browser somehow renders as a document has no script or origin.
const PROXY_CSP = "default-src 'none'; sandbox"

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
    // Exactly the query parameters the browser clients send (congress.js,
    // district.js, shutdown.js). `format` is not listed: it is always forced
    // to json server-side.
    params: ['limit', 'offset', 'currentMember', 'sort'],
    forced: { format: 'json' },
    clamp: { limit: [1, 250], offset: [0, 100_000] },
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
    // Exactly the query parameters donations.js sends.
    params: ['q', 'cycle', 'per_page', 'committee_id', 'sort', 'two_year_transaction_period', 'is_individual', 'contributor_type'],
    forced: {},
    clamp: { per_page: [1, 100] },
    allow: [
      /^\/candidates\/search\/?$/,
      new RegExp(`^/candidate/${SEGMENT}/(?:committees|totals)/?$`),
      /^\/schedules\/schedule_a\/?$/,
    ],
  },
}

// Congress.gov returns bill types uppercase ("HR", "S") and the app passes
// them straight back; the upstream is case-insensitive, so lowercase the type
// segment before matching the allow-list and forwarding.
export function normalizeProxyPath(service, path) {
  if (service !== 'congress' || typeof path !== 'string') return path
  return path.replace(/^\/bill\/(\d{2,3})\/([A-Za-z]{1,8})(?=\/|$)/, (_, congress, type) => `/bill/${congress}/${type.toLowerCase()}`)
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

/**
 * Build the upstream query from the client's: only allow-listed names, the
 * first value of each, numeric page sizes clamped to the service's bounds,
 * forced values (format=json) applied last. Everything else is dropped,
 * including any client api_key.
 */
export function sanitizeProxyParams(service, params) {
  const def = PROXY_SERVICES[service]
  const out = new URLSearchParams()
  if (!def) return out
  for (const name of def.params) {
    const raw = params.get(name)
    if (raw == null) continue
    const bounds = def.clamp[name]
    if (bounds) {
      const n = Number.parseInt(raw, 10)
      if (!Number.isFinite(n)) continue
      out.set(name, String(Math.min(bounds[1], Math.max(bounds[0], n))))
    } else {
      if (raw.length > 200) continue
      out.set(name, raw)
    }
  }
  for (const [name, value] of Object.entries(def.forced)) out.set(name, value)
  return out
}

/**
 * Read the upstream body, giving up once it passes `limit` bytes.
 * @returns {Promise<string|null>} null when the body is too large
 */
async function readCapped(response, limit) {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) {
    try { await response.body?.cancel() } catch { /* ignore */ }
    return null
  }
  if (!response.body?.getReader) {
    const text = await response.text()
    return new TextEncoder().encode(text).byteLength > limit ? null : text
  }
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      try { await reader.cancel() } catch { /* ignore */ }
      return null
    }
    chunks.push(value)
  }
  const joined = new Uint8Array(total)
  let at = 0
  for (const c of chunks) { joined.set(c, at); at += c.byteLength }
  return new TextDecoder().decode(joined)
}

function jsonBody(message, code) {
  return JSON.stringify({ error: { message, code } })
}

function result(status, body, headers = {}) {
  return {
    status,
    body,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': PROXY_CSP,
      ...headers,
    },
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

  const parsed = parseProxyUrl(service, url)
  const params = sanitizeProxyParams(service, parsed.params)
  const path = normalizeProxyPath(service, parsed.path)
  if (!path || !isAllowedPath(service, path)) {
    return result(404, jsonBody('Path is not available through this proxy', 'PATH_NOT_ALLOWED'))
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

  let raw
  try {
    raw = await readCapped(upstream, MAX_UPSTREAM_BYTES)
  } catch {
    console.error(`[Proxy:${service}] upstream body read failed for ${path}`)
    return result(502, jsonBody('Upstream request failed', 'UPSTREAM_ERROR'))
  }
  if (raw == null) {
    console.error(`[Proxy:${service}] upstream body over ${MAX_UPSTREAM_BYTES} bytes for ${path}`)
    return result(502, jsonBody('Upstream response too large', 'UPSTREAM_TOO_LARGE'))
  }
  const text = redact(raw, key)
  const ok = upstream.status >= 200 && upstream.status < 300
  if (!ok) console.warn(`[Proxy:${service}] upstream ${upstream.status} for ${path}`)
  // 429 and 5xx are transient and the same for every caller: cache them for
  // 30s. Other 4xx depend on the request and are not cached.
  const transient = upstream.status === 429 || upstream.status >= 500

  // Only JSON is passed through, always with nosniff and a sandboxing CSP:
  // an upstream HTML (or XML) page must never render on our origin.
  const upstreamType = upstream.headers.get('content-type') || ''
  const safeType = /^application\/json\b/i.test(upstreamType) ? upstreamType : 'application/json; charset=utf-8'
  const headers = {
    'Content-Type': safeType,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': PROXY_CSP,
    'Cache-Control': ok ? PROXY_CACHE_CONTROL : transient ? PROXY_ERROR_CACHE_CONTROL : 'no-store',
  }
  const retryAfter = upstream.headers.get('retry-after')
  if (retryAfter) headers['Retry-After'] = retryAfter

  return { status: upstream.status, body: text, headers }
}
