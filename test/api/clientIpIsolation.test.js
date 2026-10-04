import { describe, expect, it, vi } from 'vitest'

// api/_lib/clientIp.js exists so routes that only need a per-IP limit
// (api/proxy/*) do not load the Supabase admin client. Fail loudly if it does.
vi.mock('../../api/_lib/supabase.js', () => {
  throw new Error('clientIp/proxyRoute must not import the Supabase admin client')
})

describe('api/_lib/clientIp', () => {
  it('loads, with the proxy route, without the Supabase admin client', async () => {
    const { clientIp, hashIp } = await import('../../api/_lib/clientIp.js')
    await expect(import('../../api/_lib/proxyRoute.js')).resolves.toHaveProperty('proxyHandler')
    expect(clientIp({ headers: { 'x-vercel-forwarded-for': '5.5.5.5, 6.6.6.6' } })).toBe('5.5.5.5')
    expect(clientIp({ headers: {}, connection: { remoteAddress: '7.7.7.7' } })).toBe('7.7.7.7')
    expect(clientIp({ headers: {} })).toBe('unknown')
    expect(hashIp('1.2.3.4')).toMatch(/^[0-9a-f]{32}$/)
  })

  it('keys the IP hash with RATE_LIMIT_SALT', async () => {
    const { hashIp } = await import('../../api/_lib/clientIp.js')
    const prev = process.env.RATE_LIMIT_SALT
    try {
      delete process.env.RATE_LIMIT_SALT
      const unsalted = hashIp('1.2.3.4')
      process.env.RATE_LIMIT_SALT = 'secret-a'
      const a = hashIp('1.2.3.4')
      process.env.RATE_LIMIT_SALT = 'secret-b'
      expect(a).not.toBe(unsalted)
      expect(hashIp('1.2.3.4')).not.toBe(a)
    } finally {
      if (prev === undefined) delete process.env.RATE_LIMIT_SALT
      else process.env.RATE_LIMIT_SALT = prev
    }
  })
})
