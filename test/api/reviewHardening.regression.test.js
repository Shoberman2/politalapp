import { describe, expect, it } from 'vitest'
import { resolveFloorWeeks } from '../../api/_lib/floorSchedule.js'
import { proxyUpstream } from '../../api/_lib/upstreamProxy.js'

// Pre-landing review fixes (2026-10-04): impossible or out-of-range floor
// weeks are rejected instead of rolling over, and the API proxy never serves
// an upstream HTML page as HTML on our origin.

describe('resolveFloorWeeks input validation', () => {
  const today = new Date('2026-10-04T12:00:00Z')

  it.each(['2026-02-30', '2026-02-29', '2026-13-01', '0001-01-01', '9999-12-31', '2027-06-01'])(
    'rejects %s',
    (week) => { expect(resolveFloorWeeks(week, today)).toBeNull() },
  )

  it('still snaps a real day to its Monday', () => {
    expect(resolveFloorWeeks('2026-09-16', today)).toEqual(['2026-09-14'])
  })
})

describe('proxy response content type', () => {
  it('forces JSON and nosniff when upstream answers with HTML', async () => {
    const fetchImpl = async () => new Response('<html><script>x</script></html>', { status: 502, headers: { 'content-type': 'text/html' } })
    const out = await proxyUpstream({ service: 'congress', method: 'GET', url: '/api/proxy/congress/member', env: { CONGRESS_API_KEY: 'k' }, fetchImpl })
    expect(out.headers['Content-Type']).not.toMatch(/html/i)
    expect(out.headers['X-Content-Type-Options']).toBe('nosniff')
  })

  it('keeps an upstream JSON content type', async () => {
    const fetchImpl = async () => new Response('{"members":[]}', { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } })
    const out = await proxyUpstream({ service: 'congress', method: 'GET', url: '/api/proxy/congress/member', env: { CONGRESS_API_KEY: 'k' }, fetchImpl })
    expect(out.headers['Content-Type']).toBe('application/json; charset=utf-8')
  })
})
