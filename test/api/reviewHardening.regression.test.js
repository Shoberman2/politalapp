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

describe('proxy bill type casing', () => {
  it('accepts an uppercase bill type and forwards it lowercased', async () => {
    let forwarded = null
    const fetchImpl = async (u) => { forwarded = String(u); return new Response('{"summaries":[]}', { status: 200, headers: { 'content-type': 'application/json' } }) }
    const out = await proxyUpstream({ service: 'congress', method: 'GET', url: '/api/proxy/congress/bill/119/HR/1/summaries', env: { CONGRESS_API_KEY: 'k' }, fetchImpl })
    expect(out.status).toBe(200)
    expect(forwarded).toContain('/bill/119/hr/1/summaries')
  })
})

import { recordSeatTitle, recordSeatCode, shapeMemberRecord } from '../../shared/memberRecord.js'

describe('House seat titles never come from a missing district number', () => {
  it('labels at-large members Representative, and delegates by jurisdiction', () => {
    expect(recordSeatTitle({ chamber: 'house', state: 'WY', district: null })).toBe('Representative')
    expect(recordSeatTitle({ chamber: 'house', state: 'DC', district: null })).toBe('Delegate')
    expect(recordSeatTitle({ chamber: 'house', state: 'PR', district: null })).toBe('Resident Commissioner')
    expect(recordSeatTitle({ chamber: 'senate', state: 'WY' })).toBe('Senator')
  })

  it('never shows "district 0" from the terms table', () => {
    const r = shapeMemberRecord({ member: { id: 'H001096', name: 'Harriet Hageman', chamber: 'house', state: 'WY', district: null, party: 'Republican' }, terms: [{ congress: 119, district: '0', term_start: '2023-01-03' }] })
    expect(r.district).toBeNull()
    expect(recordSeatCode(r)).toBe('R-WY-AL')
  })
})

import { houseDistrict } from '../../shared/memberRecord.js'

describe('houseDistrict', () => {
  it('drops "0" and at-large/delegate districts, keeps real numbers', () => {
    expect(houseDistrict('AK', '0')).toBeNull()
    expect(houseDistrict('DC', '0')).toBeNull()
    expect(houseDistrict('WY', '1')).toBeNull()
    expect(houseDistrict('CA', '0')).toBeNull()
    expect(houseDistrict('MT', '2')).toBe('2')
    expect(houseDistrict('CA', 11)).toBe('11')
    expect(houseDistrict('CA', null)).toBeNull()
  })
})
