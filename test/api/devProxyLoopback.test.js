// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { devApiProxy } from '../../vite.config.js'
import { _resetMemory } from '../../api/_lib/rateLimit.js'

// `vite --host` exposes the dev server beyond localhost; the dev proxy spends
// the real keys from .env, so it must only answer loopback clients.

function mountMiddleware(env = { CONGRESS_API_KEY: 'dev-key' }) {
  let mw
  devApiProxy(env).configureServer({ middlewares: { use: (fn) => { mw = fn } } })
  return mw
}

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: null }
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v }
  res.end = (b) => { res.body = b }
  return res
}

describe('dev /api/proxy middleware', () => {
  beforeEach(() => _resetMemory())

  it.each(['192.168.1.20', '10.0.0.5', '::ffff:192.168.1.20'])('refuses non-loopback client %s without calling upstream', async (remoteAddress) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const mw = mountMiddleware()
    const res = fakeRes()
    await mw({ url: '/api/proxy/congress/member', method: 'GET', socket: { remoteAddress } }, res, () => {})
    expect(res.statusCode).toBe(403)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('serves loopback clients', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"members":[]}', { status: 200, headers: { 'content-type': 'application/json' } }))
    const mw = mountMiddleware()
    const res = fakeRes()
    await mw({ url: '/api/proxy/congress/member', method: 'GET', socket: { remoteAddress: '127.0.0.1' } }, res, () => {})
    expect(res.statusCode).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    fetchSpy.mockRestore()
  })

  it('rate limits loopback clients too', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    const mw = mountMiddleware({ CONGRESS_API_KEY: 'dev-key', PROXY_PER_MINUTE: '2', PROXY_PER_DAY: '100' })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-05T14:00:00.000Z'))
    const statuses = []
    try {
      for (let i = 0; i < 3; i++) {
        const res = fakeRes()
        await mw({ url: '/api/proxy/congress/member', method: 'GET', socket: { remoteAddress: '::1' } }, res, () => {})
        statuses.push(res.statusCode)
      }
    } finally {
      vi.useRealTimers()
    }
    expect(statuses).toEqual([200, 200, 429])
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    fetchSpy.mockRestore()
  })

  it('passes non-proxy requests on', async () => {
    const mw = mountMiddleware()
    const next = vi.fn()
    await mw({ url: '/src/main.jsx', method: 'GET', socket: { remoteAddress: '192.168.1.20' } }, fakeRes(), next)
    expect(next).toHaveBeenCalled()
  })
})
