import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const store = vi.hoisted(() => ({ insert: vi.fn() }))
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: (table) => ({ insert: (...a) => store.insert(table, ...a) }) } }))

import { logUsage } from '../../api/_lib/usage.js'
import { clientIp, hashIp } from '../../api/_lib/auth.js'
import { originFrom } from '../../api/_lib/request.js'

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('request identity: usage attribution, client ip, and trusted origin', () => {
  beforeEach(() => {
    store.insert.mockReset()
    store.insert.mockImplementation(() => Promise.resolve({ error: null }))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

  it('attributes requests to a key or a hashed client ip, and only echoes trusted hosts as the origin', async () => {
    // ---- logUsage (the identity rules themselves are pinned in usageLog.test.js) ----
    logUsage({ id: null, name: 'anonymous', monthlyCount: 0, ipHash: 'abc123' }, '/v1/members', undefined, 200, 12)
    expect(store.insert).toHaveBeenLastCalledWith('api_usage', { key_id: null, endpoint: '/v1/members', method: 'GET', status_code: 200, response_ms: 12, ip_hash: 'abc123' })

    // A keyed request is attributed to the key, never to the caller's ip.
    logUsage({ id: 'key-2', ipHash: 'should-not-leak' }, '/v1/votes', 'HEAD', 200, 3)
    expect(store.insert).toHaveBeenLastCalledWith('api_usage', { key_id: 'key-2', endpoint: '/v1/votes', method: 'HEAD', status_code: 200, response_ms: 3 })
    expect(store.insert.mock.calls.at(-1)[1]).not.toHaveProperty('ip_hash')

    // Failures are logged and never thrown into the request path.
    store.insert.mockImplementationOnce(() => Promise.resolve({ error: { message: 'null value in column ip_hash' } }))
    logUsage('key-1', '/v1/bills', 'GET', 200, 1)
    await flush()
    expect(console.warn).toHaveBeenCalledWith('[API Usage] Failed to log:', 'null value in column ip_hash')

    store.insert.mockImplementationOnce(() => Promise.reject(new Error('socket hang up')))
    expect(() => logUsage('key-1', '/v1/bills', 'GET', 200, 1)).not.toThrow()
    await flush()
    expect(console.error).toHaveBeenCalledWith('[API Usage] Failed to log:', 'socket hang up')

    // ---- clientIp (header precedence is pinned in authAnonymous.test.js) ----
    expect(clientIp({ headers: { 'x-vercel-forwarded-for': ' 203.0.113.9 , 10.0.0.1' } })).toBe('203.0.113.9')
    expect(clientIp({ headers: { 'x-real-ip': ' 198.51.100.7 ' } })).toBe('198.51.100.7')
    expect(clientIp({ headers: {} })).toBe('unknown')     // never undefined: the hash and the limiter need a string

    // ---- hashIp: keyed, stable, and never the raw address ----
    vi.stubEnv('RATE_LIMIT_SALT', 'secret-a')
    const a = hashIp('203.0.113.9')
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(a).toBe(hashIp('203.0.113.9'))
    expect(a).not.toBe(hashIp('203.0.113.10'))
    vi.stubEnv('RATE_LIMIT_SALT', 'secret-b')
    expect(hashIp('203.0.113.9')).not.toBe(a)     // a different key, a different hash
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining('RATE_LIMIT_SALT'))

    // Without a key in production the module warns exactly once, and still hashes.
    vi.stubEnv('RATE_LIMIT_SALT', '')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.resetModules()
    const fresh = await import('../../api/_lib/auth.js')
    expect(fresh.hashIp('203.0.113.9')).toMatch(/^[0-9a-f]{32}$/)
    fresh.hashIp('203.0.113.9')
    expect(console.warn.mock.calls.filter((c) => String(c[0]).includes('RATE_LIMIT_SALT'))).toHaveLength(1)

    // ---- originFrom: only known hosts are echoed; production is always canonical ----
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(originFrom({ headers: { host: 'www.ballotwatch.io', 'x-forwarded-proto': 'https' } })).toBe('https://www.ballotwatch.io')
    expect(originFrom({ headers: { host: 'politicalapp-git-feat-x.vercel.app', 'x-forwarded-proto': 'https' } })).toBe('https://politicalapp-git-feat-x.vercel.app')
    expect(originFrom({ headers: { host: 'localhost:3000', 'x-forwarded-proto': 'http' } })).toBe('http://localhost:3000')
    expect(originFrom({ headers: { host: 'www.ballotwatch.io', 'x-forwarded-host': 'evil.example' } })).toBe('https://www.ballotwatch.io')
    expect(originFrom({ headers: { host: 'evil.example' } })).toBe('https://www.ballotwatch.io')
    expect(originFrom({ headers: {} })).toBe('https://www.ballotwatch.io')
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(originFrom({ headers: { host: 'politicalapp-git-feat-x.vercel.app', 'x-forwarded-proto': 'https' } })).toBe('https://www.ballotwatch.io')
  })
})
