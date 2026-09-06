import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { checkRateLimit, _resetMemory, _memorySize, hasSharedStore } from '../../api/_lib/rateLimit.js'

describe('rateLimit (memory store)', () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    _resetMemory()
  })

  it('allows up to the per-minute limit and then refuses', async () => {
    expect(hasSharedStore()).toBe(false)
    const now = Date.UTC(2026, 8, 5, 12, 0, 30)
    for (let i = 0; i < 3; i += 1) {
      const r = await checkRateLimit({ id: 'ip:a', perMinute: 3, now })
      expect(r.allowed).toBe(true)
      expect(r.remaining).toBe(2 - i)
    }
    const blocked = await checkRateLimit({ id: 'ip:a', perMinute: 3, now })
    expect(blocked.allowed).toBe(false)
    expect(blocked.window).toBe('minute')
    expect(blocked.retryAfter).toBe(30)
    expect(blocked.store).toBe('memory')
  })

  it('keeps identities and windows separate', async () => {
    const now = Date.UTC(2026, 8, 5, 12, 0, 0)
    await checkRateLimit({ id: 'ip:a', perMinute: 1, now })
    expect((await checkRateLimit({ id: 'ip:b', perMinute: 1, now })).allowed).toBe(true)
    expect((await checkRateLimit({ id: 'ip:a', perMinute: 1, now })).allowed).toBe(false)
    expect((await checkRateLimit({ id: 'ip:a', perMinute: 1, now: now + 60_000 })).allowed).toBe(true)
  })

  it('enforces the daily cap independently of the minute cap', async () => {
    const now = Date.UTC(2026, 8, 5, 12, 0, 0)
    await checkRateLimit({ id: 'ip:c', perMinute: 100, perDay: 2, now })
    await checkRateLimit({ id: 'ip:c', perMinute: 100, perDay: 2, now: now + 61_000 })
    const r = await checkRateLimit({ id: 'ip:c', perMinute: 100, perDay: 2, now: now + 122_000 })
    expect(r.allowed).toBe(false)
    expect(r.window).toBe('day')
  })
})

describe('rateLimit (Upstash store)', () => {
  beforeEach(() => {
    _resetMemory()
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'
  })
  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    vi.restoreAllMocks()
  })

  it('reads minute and day counts from the pipeline result', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => [{ result: 3 }, { result: 1 }, { result: 6 }, { result: 1 }] }))
    const r = await checkRateLimit({ id: 'ip:u', perMinute: 100, perDay: 5, now: Date.UTC(2026, 8, 5) })
    expect(r).toMatchObject({ allowed: false, window: 'day', store: 'upstash' })
    const [url, init] = global.fetch.mock.calls[0]
    expect(url).toBe('https://example.upstash.io/pipeline')
    expect(init.headers.Authorization).toBe('Bearer token')
    expect(JSON.parse(init.body)).toHaveLength(4)
  })

  it('sends only the minute commands when there is no daily cap', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => [{ result: 1 }, { result: 1 }] }))
    const r = await checkRateLimit({ id: 'ip:v', perMinute: 10, now: Date.UTC(2026, 8, 5) })
    expect(r).toMatchObject({ allowed: true, remaining: 9, store: 'upstash' })
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toHaveLength(2)
  })

  it('falls back to memory when Upstash fails', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500 }))
    const r = await checkRateLimit({ id: 'ip:w', perMinute: 1, now: Date.UTC(2026, 8, 5) })
    expect(r).toMatchObject({ allowed: true, store: 'memory' })
  })
})

describe('rateLimit memory cap', () => {
  beforeEach(() => { _resetMemory(); delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN })

  it('never grows past the cap', async () => {
    const now = Date.UTC(2026, 8, 5)
    for (let i = 0; i < 50_050; i += 1) await checkRateLimit({ id: `ip:${i}`, perMinute: 10, now })
    expect(_memorySize()).toBeLessThanOrEqual(50_000)
  })
})
