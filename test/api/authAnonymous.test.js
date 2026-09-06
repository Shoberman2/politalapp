import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: vi.fn() } }))

import { validateApiKey, clientIp, hashIp } from '../../api/_lib/auth.js'
import { _resetMemory } from '../../api/_lib/rateLimit.js'
import { nodeHandler, jsonResponse, ANON_CACHE_CONTROL } from '../../api/_lib/response.js'

describe('anonymous API access', () => {
  beforeEach(() => _resetMemory())

  it('admits a GET without a key under the per-IP limit', async () => {
    const result = await validateApiKey({ method: 'GET', headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } })
    expect(result.error).toBeUndefined()
    expect(result.anonymous).toBe(true)
    expect(result.key.id).toBeNull()
    expect(result.key.ipHash).toBe(hashIp('203.0.113.9'))
    expect(result.rateLimit.allowed).toBe(true)
  })

  it('still refuses when the method is not GET or the header is malformed', async () => {
    const post = await validateApiKey({ method: 'POST', headers: {} })
    expect(post.error.status).toBe(401)
    const bad = await validateApiKey({ method: 'GET', headers: { authorization: 'Token abc' } })
    expect(bad.error.status).toBe(401)
    const wrongPrefix = await validateApiKey({ method: 'GET', headers: { authorization: 'Bearer sk_live_1' } })
    expect(wrongPrefix.error.status).toBe(401)
  })

  it('returns 429 with Retry-After once the anonymous limit is hit', async () => {
    process.env.API_ANON_PER_MINUTE = '2'
    try {
      vi.resetModules()
      const { validateApiKey: fresh } = await import('../../api/_lib/auth.js')
      const req = { method: 'GET', headers: { 'x-real-ip': '198.51.100.7' } }
      await fresh(req); await fresh(req)
      const third = await fresh(req)
      expect(third.error.status).toBe(429)
      expect(third.error.headers.get('Retry-After')).toBeTruthy()
      expect(third.error.headers.get('Access-Control-Allow-Origin')).toBe('*')
      await expect(third.error.json()).resolves.toMatchObject({ error: { code: 'RATE_LIMIT_EXCEEDED', window: 'minute' } })
    } finally {
      delete process.env.API_ANON_PER_MINUTE
    }
  })

  it('refuses a keyless GET when a route opts out of anonymous access', async () => {
    const result = await validateApiKey({ method: 'GET', headers: {} }, { allowAnonymous: false })
    expect(result.error.status).toBe(401)
  })

  it('limits free keys per minute and never by month', async () => {
    process.env.API_FREE_KEY_PER_MINUTE = '1'
    try {
      vi.resetModules()
      const { supabaseAdmin } = await import('../../api/_lib/supabase.js')
      const keyRow = { id: 'k1', active: true, monthly_count: 5, last_reset_at: new Date().toISOString(), organizations: { id: 'o1', name: 'Free org', plan: 'free', monthly_limit: 0, subscription_status: 'active' } }
      const chain = { select: () => chain, eq: () => chain, update: () => chain, single: async () => ({ data: keyRow, error: null }), then: (r) => { r({ error: null }); return chain }, catch: () => chain }
      supabaseAdmin.from.mockReturnValue(chain)
      const { validateApiKey: fresh } = await import('../../api/_lib/auth.js')
      const req = { method: 'GET', headers: { authorization: 'Bearer bw_live_abc' } }
      const first = await fresh(req)
      expect(first.error).toBeUndefined()
      expect(first.org.plan).toBe('free')
      const second = await fresh(req)
      expect(second.error.status).toBe(429)
      const body = await second.error.json()
      expect(body.error.window).toBe('minute')
      expect(body.error.message).not.toContain('Create a free key')
    } finally {
      delete process.env.API_FREE_KEY_PER_MINUTE
    }
  })

  it('reads the client ip from the platform headers first', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' } })).toBe('1.1.1.1')
    expect(clientIp({ headers: { 'x-real-ip': '3.3.3.3', 'x-forwarded-for': '9.9.9.9' } })).toBe('3.3.3.3')
    expect(clientIp({ headers: { 'x-vercel-forwarded-for': '5.5.5.5', 'x-real-ip': '3.3.3.3' } })).toBe('5.5.5.5')
    expect(clientIp({ headers: {}, socket: { remoteAddress: '4.4.4.4' } })).toBe('4.4.4.4')
    expect(hashIp('1.1.1.1')).toHaveLength(32)
    expect(hashIp('1.1.1.1')).not.toBe(hashIp('1.1.1.2'))
  })

  it('lets the CDN cache anonymous GET responses but not keyed ones', async () => {
    const headers = new Map()
    const res = { statusCode: 0, setHeader: (k, v) => headers.set(k.toLowerCase(), v), end: vi.fn() }
    await nodeHandler(async () => jsonResponse({ ok: true }))({ method: 'GET', headers: {} }, res)
    expect(headers.get('cache-control')).toBe(ANON_CACHE_CONTROL)

    headers.clear()
    await nodeHandler(async () => jsonResponse({ ok: true }))({ method: 'GET', headers: { authorization: 'Bearer bw_live_x' } }, res)
    expect(headers.get('cache-control')).toBeUndefined()
  })
})
