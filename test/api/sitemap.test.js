import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeSupabaseMock } from '../fixtures/supabaseChain.js'

const db = makeSupabaseMock()
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: (t) => db.from(t) } }))

import handler, { memberEntries, voteEntries, billEntries, buildPart, _resetSitemapMemo } from '../../api/sitemap.js'
import { _resetMemory } from '../../api/_lib/rateLimit.js'

function makeRes() {
  const headers = new Map()
  return {
    statusCode: 0,
    body: '',
    setHeader(k, v) { headers.set(k.toLowerCase(), v) },
    getHeader(k) { return headers.get(k.toLowerCase()) },
    end(b) { this.body = b || '' },
  }
}
const req = (part, headers = {}) => ({ headers: { host: 'www.ballotwatch.io', 'x-forwarded-proto': 'https', 'x-real-ip': '203.0.113.9', ...headers }, query: part ? { part } : {} })
const reset = () => { db.reset(); _resetSitemapMemo(); _resetMemory() }

describe('api/sitemap', () => {
  beforeEach(reset)
  afterEach(() => vi.restoreAllMocks())

  it('lists only members with votes, roll calls with sane tallies, and bills with real titles', async () => {
    db.responses.politicians = { data: [{ id: 'P000197' }, { id: 'Z000000' }] }
    db.responses.member_stats = { data: [{ politician_id: 'P000197', total_votes: 890 }] }
    db.responses.roll_calls = { data: [{ voted_at: '2026-09-03T14:00:00Z' }] }
    expect(await memberEntries()).toEqual([{ path: '/politician/P000197', lastmod: '2026-09-03', changefreq: 'weekly' }])
    expect(db.ops('member_stats', 'gt')[0]).toEqual(['gt', 'total_votes', 0])
    expect(db.ops('member_stats', 'order')[0]).toEqual(['order', 'politician_id'])   // stable paging key
    expect(db.ops('politicians', 'range')[0]).toEqual(['range', 0, 999])

    reset()
    db.responses.roll_calls = { data: [
      { id: 'house-119-2-295', voted_at: '2026-09-03' },
      { id: 'senate-119-1-262', voted_at: '2026-07-01' },   // 110 yea+nay in a 100-seat chamber
      { id: 'house-119-2-1', voted_at: '2026-01-03' },      // no stats row
      { id: 'joint-119-1-1', voted_at: '2026-01-03' },      // not a roll call id
    ] }
    db.responses.roll_call_stats = { data: [
      { roll_call_id: 'house-119-2-295', dem_yea: 200, dem_nay: 10, rep_yea: 180, rep_nay: 30, ind_yea: 0, ind_nay: 0 },
      { roll_call_id: 'senate-119-1-262', dem_yea: 0, dem_nay: 47, rep_yea: 60, rep_nay: 3, ind_yea: 0, ind_nay: 0 },
    ] }
    expect(await voteEntries()).toEqual([{ path: '/vote/119/house/2/295', lastmod: '2026-09-03', changefreq: 'monthly' }])

    reset()
    db.responses.roll_calls = { data: [
      { bill_id: '119-hr-1', voted_at: '2025-05-22' },
      { bill_id: '119-hr-1', voted_at: '2025-07-03T12:00:00Z' },
      { bill_id: '119-hr-915', voted_at: '2026-01-01' },
      { bill_id: '119-s-5051', voted_at: null },
    ] }
    db.responses.bills = { data: [
      { id: '119-hr-1', title: 'An act to provide for reconciliation pursuant to title II of H. Con. Res. 14.' },
      { id: '119-hr-915', title: 'HR 915' },
      { id: '119-s-5051', title: 'Water Resources Development Act of 2026' },
    ] }
    expect(await billEntries()).toEqual([
      { path: '/bill/119/hr/1', lastmod: '2025-07-03', changefreq: 'weekly' },     // the later of the two votes
      { path: '/bill/119/s/5051', lastmod: null, changefreq: 'weekly' },
    ])
    expect(db.ops('roll_calls', 'not')[0]).toEqual(['not', 'bill_id', 'is', null])
    expect(db.ops('bills', 'in')[0]).toEqual(['in', 'id', ['119-hr-1', '119-hr-915', '119-s-5051']])
    expect(await buildPart('bogus')).toBeNull()
  })

  it('serves the index on the canonical origin only, memoizes parts, rate-limits per ip, and 503s when the database fails', async () => {
    // One roll_calls response serves both the newest-vote lookup and the bill part count.
    db.responses.roll_calls = { data: [{ voted_at: '2026-09-03T00:00:00Z' }], count: 2 }
    let res = makeRes()
    await handler(req(null, { host: 'evil.example', 'x-forwarded-host': 'evil.example' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.getHeader('content-type')).toBe('application/xml; charset=utf-8')
    expect(res.getHeader('cache-control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400')
    expect(res.body).toContain('<loc>https://www.ballotwatch.io/sitemap-members.xml</loc><lastmod>2026-09-03</lastmod>')
    expect(res.body).toContain('<loc>https://www.ballotwatch.io/sitemap-votes.xml</loc>')
    expect(res.body).toContain('<loc>https://www.ballotwatch.io/sitemap-bills.xml</loc>')
    expect(res.body).not.toContain('sitemap-bills-1.xml')
    expect(res.body).not.toContain('evil.example')      // a spoofed Host never becomes a cached <loc>
    expect(db.ops('roll_calls', 'select')).toContainEqual(['select', 'bill_id, voted_at'])

    // The index is memoized: a second request answers without touching the database.
    const callsBefore = db.calls.length
    res = makeRes()
    await handler(req(null), res)
    expect(res.statusCode).toBe(200)
    expect(db.calls.length).toBe(callsBefore)

    // A part renders a urlset.
    reset()
    db.responses.politicians = { data: [{ id: 'P000197' }] }
    db.responses.member_stats = { data: [{ politician_id: 'P000197', total_votes: 1 }] }
    db.responses.roll_calls = { data: [] }
    res = makeRes()
    await handler(req('members'), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<url><loc>https://www.ballotwatch.io/politician/P000197</loc><changefreq>weekly</changefreq></url>')

    res = makeRes()
    await handler(req('nope'), res)
    expect(res.statusCode).toBe(404)
    expect(res.getHeader('content-type')).toBe('text/plain; charset=utf-8')
    expect(res.body).toBe('Not found\n')

    // Twelve requests a minute per ip, memoized or not; the thirteenth waits.
    reset()
    db.responses.roll_calls = { data: [], count: 0 }
    for (let i = 0; i < 12; i += 1) {
      res = makeRes()
      await handler(req(null), res)
      expect(res.statusCode).toBe(200)
    }
    res = makeRes()
    await handler(req(null), res)
    expect(res.statusCode).toBe(429)
    expect(Number(res.getHeader('retry-after'))).toBeGreaterThan(0)
    expect(res.body).toBe('Too many sitemap requests\n')
    res = makeRes()
    await handler(req(null, { 'x-real-ip': '198.51.100.7' }), res)   // a different ip is unaffected
    expect(res.statusCode).toBe(200)

    reset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.responses.roll_calls = { data: null, error: { message: 'connection reset' } }
    res = makeRes()
    await handler(req('votes'), res)
    expect(res.statusCode).toBe(503)
    expect(res.getHeader('retry-after')).toBe('60')
    expect(res.body).toBe('Sitemap temporarily unavailable\n')
    expect(console.error).toHaveBeenCalledWith('[sitemap] failed:', 'roll_calls: connection reset')
  })
})
