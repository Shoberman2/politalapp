import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { proxyUpstream, isAllowedPath, PROXY_CACHE_CONTROL } from '../../api/_lib/upstreamProxy.js'
import { proxyRoute } from '../../api/_lib/proxyRoute.js'
import { _resetMemory } from '../../api/_lib/rateLimit.js'

const CONGRESS_KEY = 'congress-secret-test-key'
const FEC_KEY = 'fec-secret-test-key'
const env = { CONGRESS_API_KEY: CONGRESS_KEY, FEC_API_KEY: FEC_KEY }

function okFetch(body = { members: [] }, init = {}) {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  }))
}

describe('proxyUpstream allow-list and method', () => {
  it.each([
    ['congress', '/member'],
    ['congress', '/member/O000172'],
    ['congress', '/member/O000172/sponsored-legislation'],
    ['congress', '/bill'],
    ['congress', '/bill/119'],
    ['congress', '/bill/119/hr'],
    ['congress', '/bill/119/hr/1/summaries'],
    ['congress', '/bill/119/hr/1/cosponsors'],
    ['congress', '/house-vote/119'],
    ['congress', '/house-vote/119/1/21/members'],
    ['congress', '/vote/119/house/21'],
    ['fec', '/candidates/search/'],
    ['fec', '/candidate/H8CA05035/committees/'],
    ['fec', '/candidate/H8CA05035/totals/'],
    ['fec', '/schedules/schedule_a/'],
  ])('allows %s %s', (service, path) => {
    expect(isAllowedPath(service, path)).toBe(true)
  })

  it.each([
    ['congress', '/'],
    ['congress', '/committee-meeting/119'],
    ['congress', '/member/../bill'],
    ['congress', '/member/%2e%2e/x'],
    ['congress', '/bill/119/hr/1/text/../../x'],
    ['congress', '//evil.example/member'],
    ['fec', '/schedules/schedule_b/'],
    ['fec', '/candidate/X/filings/'],
    ['fec', '/committee/C001/'],
    ['nope', '/member'],
  ])('rejects %s %s', (service, path) => {
    expect(isAllowedPath(service, path)).toBe(false)
  })

  it('rejects a non-allow-listed path with 404 and no upstream call', async () => {
    const fetchImpl = okFetch()
    const out = await proxyUpstream({ service: 'congress', method: 'GET', url: '/api/proxy/congress/committee/119', env, fetchImpl })
    expect(out.status).toBe(404)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(out.body).not.toContain(CONGRESS_KEY)
  })

  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])('rejects %s with 405', async (method) => {
    const fetchImpl = okFetch()
    const out = await proxyUpstream({ service: 'congress', method, url: '/api/proxy/congress/member', env, fetchImpl })
    expect(out.status).toBe(405)
    expect(out.headers.Allow).toBe('GET')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('proxyUpstream key handling', () => {
  it('adds the server key upstream and strips a client-supplied api_key', async () => {
    const fetchImpl = okFetch()
    const out = await proxyUpstream({
      service: 'congress',
      method: 'GET',
      url: '/api/proxy/congress/member?limit=250&currentMember=true&format=json&api_key=client-key&API_KEY=other',
      env,
      fetchImpl,
    })
    expect(out.status).toBe(200)
    const target = new URL(fetchImpl.mock.calls[0][0])
    expect(target.origin + target.pathname).toBe('https://api.congress.gov/v3/member')
    expect(target.searchParams.getAll('api_key')).toEqual([CONGRESS_KEY])
    expect(target.searchParams.has('API_KEY')).toBe(false)
    expect(target.searchParams.get('limit')).toBe('250')
    expect(target.searchParams.get('format')).toBe('json')
  })

  it('reads the upstream path from the vercel.json rewrite form', async () => {
    const fetchImpl = okFetch()
    await proxyUpstream({ service: 'fec', method: 'GET', url: '/api/proxy/fec?path=candidate/H8CA05035/totals/&cycle=2026', env, fetchImpl })
    const target = new URL(fetchImpl.mock.calls[0][0])
    expect(target.origin + target.pathname).toBe('https://api.open.fec.gov/v1/candidate/H8CA05035/totals/')
    expect(target.searchParams.get('api_key')).toBe(FEC_KEY)
    expect(target.searchParams.get('cycle')).toBe('2026')
    expect(target.searchParams.has('path')).toBe(false)
  })

  it('rejects ambiguous duplicate path parameters', async () => {
    const fetchImpl = okFetch()
    const out = await proxyUpstream({ service: 'fec', method: 'GET', url: '/api/proxy/fec?path=candidates/search/&path=committee/x', env, fetchImpl })
    expect(out.status).toBe(404)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('falls back to legacy VITE_ names server-side', async () => {
    const fetchImpl = okFetch()
    await proxyUpstream({
      service: 'congress',
      method: 'GET',
      url: '/api/proxy/congress/bill/119',
      env: { VITE_CONGRESS_API_KEY: 'legacy-congress' },
      fetchImpl,
    })
    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get('api_key')).toBe('legacy-congress')
  })

  it('uses DEMO_KEY for FEC when no key is configured', async () => {
    const fetchImpl = okFetch()
    await proxyUpstream({ service: 'fec', method: 'GET', url: '/api/proxy/fec/candidates/search/', env: {}, fetchImpl })
    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get('api_key')).toBe('DEMO_KEY')
  })

  it('returns 503 without calling upstream when the Congress key is missing', async () => {
    const fetchImpl = okFetch()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const out = await proxyUpstream({ service: 'congress', method: 'GET', url: '/api/proxy/congress/member', env: {}, fetchImpl })
    expect(out.status).toBe(503)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('never returns the key, even if upstream echoes it', async () => {
    const fetchImpl = vi.fn(async (url) => new Response(
      JSON.stringify({ error: { message: `bad request for ${url}` } }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    ))
    const logs = []
    for (const level of ['log', 'warn', 'error']) {
      vi.spyOn(console, level).mockImplementation((...args) => logs.push(args.join(' ')))
    }
    const out = await proxyUpstream({ service: 'congress', method: 'GET', url: '/api/proxy/congress/member', env, fetchImpl })
    expect(out.status).toBe(400)
    expect(out.body).not.toContain(CONGRESS_KEY)
    expect(out.body).toContain('[redacted]')
    expect(JSON.stringify(out.headers)).not.toContain(CONGRESS_KEY)
    expect(logs.join('\n')).not.toContain(CONGRESS_KEY)
  })

  it('passes upstream status through honestly and only caches successes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const notFound = await proxyUpstream({
      service: 'congress', method: 'GET', url: '/api/proxy/congress/member/ZZZ', env,
      fetchImpl: vi.fn(async () => new Response('{"error":"not found"}', { status: 404 })),
    })
    expect(notFound.status).toBe(404)
    expect(notFound.headers['Cache-Control']).toBe('no-store')

    const limited = await proxyUpstream({
      service: 'congress', method: 'GET', url: '/api/proxy/congress/member', env,
      fetchImpl: vi.fn(async () => new Response('{}', { status: 429, headers: { 'retry-after': '30' } })),
    })
    expect(limited.status).toBe(429)
    expect(limited.headers['Retry-After']).toBe('30')

    const ok = await proxyUpstream({ service: 'congress', method: 'GET', url: '/api/proxy/congress/member', env, fetchImpl: okFetch() })
    expect(ok.status).toBe(200)
    expect(ok.headers['Cache-Control']).toBe(PROXY_CACHE_CONTROL)
    expect(PROXY_CACHE_CONTROL).toBe('public, s-maxage=300, stale-while-revalidate=3600')
  })

  it('maps network failures to 502 without leaking the key', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const out = await proxyUpstream({
      service: 'congress', method: 'GET', url: '/api/proxy/congress/member', env,
      fetchImpl: vi.fn(async (url) => { throw new Error(`connect failed ${url}`) }),
    })
    expect(out.status).toBe(502)
    expect(out.body).not.toContain(CONGRESS_KEY)
  })
})

describe('proxyRoute rate limiting', () => {
  beforeEach(() => _resetMemory())
  afterEach(() => vi.restoreAllMocks())

  it('limits per IP and returns 429 once the minute budget is spent', async () => {
    const fetchImpl = okFetch()
    const req = { method: 'GET', url: '/api/proxy/congress/member', headers: { 'x-real-ip': '203.0.113.9', host: 'localhost' } }
    let last
    for (let i = 0; i < 241; i++) last = await proxyRoute('congress', req, { env, fetchImpl })
    expect(last.status).toBe(429)
    expect(fetchImpl).toHaveBeenCalledTimes(240)
    expect(last.body).not.toContain(CONGRESS_KEY)
  })

  it('rejects non-GET before consulting the key', async () => {
    const out = await proxyRoute('fec', { method: 'POST', url: '/api/proxy/fec/candidates/search/', headers: {} })
    expect(out.status).toBe(405)
  })
})

describe('vercel.json proxy routing', () => {
  it('rewrites proxy paths to the functions ahead of the SPA catch-all', () => {
    const { rewrites } = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'))
    const spa = rewrites.findIndex((r) => r.destination === '/index.html')
    for (const service of ['congress', 'fec']) {
      const i = rewrites.findIndex((r) => r.source === `/api/proxy/${service}/:path*`)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(rewrites[i].destination).toBe(`/api/proxy/${service}?path=:path*`)
      expect(i).toBeLessThan(spa)
    }
  })
})
