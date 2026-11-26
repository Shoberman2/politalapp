import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeSupabaseMock } from '../fixtures/supabaseChain.js'

const db = makeSupabaseMock()
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: (t) => db.from(t), rpc: (fn, args) => db.rpc(fn, args) } }))

import { isGatedPath } from '../../shared/access.js'
import handler, { memberEntries, recordEntries, pageEntries, voteEntries, billEntries, buildPart, splitUrlsetParts, _resetSitemapMemo } from '../../api/sitemap.js'
import { SITEMAP_PART_SIZE } from '../../api/_lib/sitemapXml.js'
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
    db.responses.politicians = { data: [{ id: 'P000197', name: 'Nancy Pelosi' }, { id: 'Z000000', name: 'No Votes' }] }
    db.responses.member_stats = { data: [{ politician_id: 'P000197', total_votes: 890 }] }
    db.responses.roll_calls = { data: [{ voted_at: '2026-09-03T14:00:00Z' }] }   // site-wide newest vote: not used for members
    db.responses['rpc:member_last_vote_dates'] = { data: [{ politician_id: 'P000197', last_voted_at: '2026-07-15' }, { politician_id: 'Z000000', last_voted_at: '2025-01-03' }] }
    expect(await memberEntries()).toEqual([{ path: '/politician/P000197-nancy-pelosi', lastmod: '2026-07-15', changefreq: 'weekly' }])
    expect(await recordEntries()).toEqual([{ path: '/politician/P000197-nancy-pelosi/record', lastmod: '2026-07-15', changefreq: 'weekly' }])
    expect(db.ops('rpc:member_last_vote_dates', 'rpc')).toEqual([['rpc', 'member_last_vote_dates', undefined]])   // memoized: one read for both
    expect(db.ops('rpc:member_last_vote_dates', 'order')[0]).toEqual(['order', 'politician_id'])
    expect(db.ops('rpc:member_last_vote_dates', 'range')[0]).toEqual(['range', 0, 999])
    expect(db.tables()).not.toContain('votes')   // the votes table never leaves the database
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

  it('keeps pages that need an account out of the pages part', async () => {
    db.responses.roll_calls = { data: [{ voted_at: '2026-09-03' }] }
    const pages = (await pageEntries()).map((e) => e.path)
    expect(pages[0]).toBe('/')
    expect(pages).toContain('/how-it-works')
    expect(pages.filter((p) => isGatedPath(p))).toEqual([])
  })

  it('lists /this-week (dated by the newest vote) and /developers (undated), and none of the gated routes', async () => {
    db.responses.roll_calls = { data: [{ voted_at: '2026-09-03' }] }
    const entries = await pageEntries()
    expect(entries.find((e) => e.path === '/this-week')).toEqual({ path: '/this-week', lastmod: '2026-09-03', changefreq: 'daily', priority: 0.7 })
    expect(entries.find((e) => e.path === '/developers')).toEqual({ path: '/developers', lastmod: null, changefreq: 'monthly', priority: 0.6 })
    for (const gated of ['/all', '/bills', '/my-representative', '/auth']) expect(entries.map((e) => e.path)).not.toContain(gated)
  })

  it('serves the index on the canonical origin only, memoizes parts, rate-limits per ip, and 503s when the database fails', async () => {
    // One roll_calls response serves both the newest-vote lookup and the bill part count.
    db.responses.roll_calls = { data: [{ voted_at: '2026-09-03T00:00:00Z' }], count: 2 }
    let res = makeRes()
    await handler(req(null, { host: 'evil.example', 'x-forwarded-host': 'evil.example' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.getHeader('content-type')).toBe('application/xml; charset=utf-8')
    expect(res.getHeader('cache-control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400')
    expect(res.body).toContain('<loc>https://www.ballotwatch.io/sitemap-pages.xml</loc><lastmod>2026-09-03</lastmod>')
    expect(res.body).toContain('<loc>https://www.ballotwatch.io/sitemap-members.xml</loc></sitemap>')   // no member dates: no lastmod
    expect(res.body).toContain('<loc>https://www.ballotwatch.io/sitemap-records.xml</loc></sitemap>')
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
    db.responses.politicians = { data: [{ id: 'P000197', name: 'Nancy Pelosi' }] }
    db.responses.member_stats = { data: [{ politician_id: 'P000197', total_votes: 1 }] }
    db.responses.roll_calls = { data: [] }
    res = makeRes()
    await handler(req('members'), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<url><loc>https://www.ballotwatch.io/politician/P000197-nancy-pelosi</loc><changefreq>weekly</changefreq></url>')

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

  it('pages member and record lastmod through the RPC in thousands', async () => {
    const ids = Array.from({ length: 1500 }, (_, i) => `M${String(i).padStart(6, '0')}`)
    db.responses.politicians = (call) => {
      const [, from, to] = call.ops.find((o) => o[0] === 'range')
      return { data: ids.slice(from, to + 1).map((id) => ({ id, name: `Member ${id}` })) }
    }
    db.responses.member_stats = (call) => {
      const [, from, to] = call.ops.find((o) => o[0] === 'range')
      return { data: ids.slice(from, to + 1).map((id) => ({ politician_id: id, total_votes: 1 })) }
    }
    db.responses['rpc:member_last_vote_dates'] = (call) => {
      const [, from, to] = call.ops.find((o) => o[0] === 'range')
      return { data: ids.slice(from, to + 1).map((id) => ({ politician_id: id, last_voted_at: id === 'M001499' ? '2026-11-20' : '2026-01-05' })) }
    }
    const entries = await memberEntries()
    expect(entries).toHaveLength(1500)
    expect(entries.at(-1).lastmod).toBe('2026-11-20')
    expect(db.ops('rpc:member_last_vote_dates', 'range')).toEqual([['range', 0, 999], ['range', 1000, 1999]])
  })

  it('serves members and records without lastmod (200, not 503) when the RPC fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    db.responses.politicians = { data: [{ id: 'P000197', name: 'Nancy Pelosi' }] }
    db.responses.member_stats = { data: [{ politician_id: 'P000197', total_votes: 1 }] }
    db.responses.roll_calls = { data: [{ voted_at: '2026-09-03' }] }
    db.responses['rpc:member_last_vote_dates'] = { data: null, error: { message: 'function does not exist' } }
    for (const [part, loc] of [['members', '/politician/P000197-nancy-pelosi'], ['records', '/politician/P000197-nancy-pelosi/record']]) {
      const res = makeRes()
      await handler(req(part), res)
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain(`<url><loc>https://www.ballotwatch.io${loc}</loc><changefreq>weekly</changefreq></url>`)
      expect(res.body).not.toContain('<lastmod>')
    }
    expect(console.warn).toHaveBeenCalledWith('[sitemap] member lastmod unavailable:', 'member_last_vote_dates: function does not exist')
  })

  it('omits lastmod only for a member missing from the RPC', async () => {
    db.responses.politicians = { data: [{ id: 'A000001', name: 'Ann Able' }, { id: 'B000002', name: 'Bo Baker' }] }
    db.responses.member_stats = { data: [{ politician_id: 'A000001', total_votes: 3 }, { politician_id: 'B000002', total_votes: 2 }] }
    db.responses['rpc:member_last_vote_dates'] = { data: [{ politician_id: 'A000001', last_voted_at: '2026-10-01' }] }
    expect(await memberEntries()).toEqual([
      { path: '/politician/A000001-ann-able', lastmod: '2026-10-01', changefreq: 'weekly' },
      { path: '/politician/B000002-bo-baker', lastmod: null, changefreq: 'weekly' },
    ])
    const xml = await buildPart('records')
    expect(xml).toContain('<url><loc>https://www.ballotwatch.io/politician/A000001-ann-able/record</loc><lastmod>2026-10-01</lastmod>')
    expect(xml).toContain('<url><loc>https://www.ballotwatch.io/politician/B000002-bo-baker/record</loc><changefreq>weekly</changefreq></url>')
  })

  it('dates the index members and records entries by the newest member lastmod', async () => {
    db.responses.politicians = { data: [{ id: 'A000001', name: 'Ann Able' }, { id: 'B000002', name: 'Bo Baker' }, { id: 'C000003', name: 'No Votes' }] }
    db.responses.member_stats = { data: [{ politician_id: 'A000001', total_votes: 3 }, { politician_id: 'B000002', total_votes: 2 }] }
    db.responses['rpc:member_last_vote_dates'] = { data: [
      { politician_id: 'A000001', last_voted_at: '2026-10-01' },
      { politician_id: 'B000002', last_voted_at: '2026-11-18' },
      { politician_id: 'C000003', last_voted_at: '2026-11-24' },   // not in the sitemap (no member_stats votes)
    ] }
    db.responses.roll_calls = { data: [{ voted_at: '2026-11-24' }] }
    const xml = await buildPart('')
    expect(xml).toContain('<loc>https://www.ballotwatch.io/sitemap-pages.xml</loc><lastmod>2026-11-24</lastmod>')
    expect(xml).toContain('<loc>https://www.ballotwatch.io/sitemap-members.xml</loc><lastmod>2026-11-18</lastmod>')
    expect(xml).toContain('<loc>https://www.ballotwatch.io/sitemap-records.xml</loc><lastmod>2026-11-18</lastmod>')
    expect(xml).toContain('<loc>https://www.ballotwatch.io/sitemap-votes.xml</loc><lastmod>2026-11-24</lastmod>')
    expect(db.ops('rpc:member_last_vote_dates', 'rpc')).toHaveLength(1)   // shared by members and records
  })

  it('splits members and records into numbered parts above SITEMAP_PART_SIZE', async () => {
    const n = SITEMAP_PART_SIZE + 2
    const ids = Array.from({ length: n }, (_, i) => `M${String(i).padStart(6, '0')}`)
    const page = (rows) => (call) => {
      const [, from, to] = call.ops.find((o) => o[0] === 'range')
      return { data: rows.slice(from, to + 1) }
    }
    db.responses.politicians = page(ids.map((id) => ({ id, name: 'X' })))
    db.responses.member_stats = page(ids.map((id) => ({ politician_id: id, total_votes: 1 })))
    db.responses['rpc:member_last_vote_dates'] = page(ids.map((id) => ({ politician_id: id, last_voted_at: '2026-11-01' })))
    db.responses.roll_calls = { data: [] }
    const index = await buildPart('')
    for (const name of ['members-1', 'members-2', 'records-1', 'records-2']) expect(index).toContain(`/sitemap-${name}.xml</loc><lastmod>2026-11-01</lastmod>`)
    expect(index).not.toContain('/sitemap-members.xml')
    expect(index).not.toContain('/sitemap-records.xml')
    const second = await buildPart('members-2')
    expect(second.match(/<url>/g)).toHaveLength(2)
    expect((await buildPart('records-1')).match(/<url>/g)).toHaveLength(SITEMAP_PART_SIZE)
    expect((await buildPart('members')).match(/<url>/g)).toHaveLength(SITEMAP_PART_SIZE)   // the plain name is part 1
    expect(await buildPart('members-3')).toBeNull()
    expect(await buildPart('records-0')).toBeNull()
  })

  it('keeps one plain members part below the size limit and halves a part over the byte guard', async () => {
    db.responses.politicians = { data: [{ id: 'A000001', name: 'Ann Able' }] }
    db.responses.member_stats = { data: [{ politician_id: 'A000001', total_votes: 1 }] }
    db.responses.roll_calls = { data: [] }
    const index = await buildPart('')
    expect(index).toContain('/sitemap-members.xml')
    expect(index).not.toContain('/sitemap-members-1.xml')
    expect(await buildPart('members-2')).toBeNull()

    const entries = Array.from({ length: 8 }, (_, i) => ({ path: `/politician/M00000${i}-x`, lastmod: '2026-11-01', changefreq: 'weekly' }))
    const pieces = splitUrlsetParts(entries, 600)
    expect(pieces.length).toBeGreaterThan(1)
    expect(pieces.flat()).toEqual(entries)
    expect(splitUrlsetParts(entries)).toEqual([entries])
  })

  it('never lists a gated path in any part', async () => {
    db.responses.politicians = { data: [{ id: 'P000197', name: 'Nancy Pelosi' }] }
    db.responses.member_stats = { data: [{ politician_id: 'P000197', total_votes: 1 }] }
    db.responses['rpc:member_last_vote_dates'] = { data: [{ politician_id: 'P000197', last_voted_at: '2026-09-03' }] }
    db.responses.roll_calls = (call) => {
      const cols = call.ops.find((o) => o[0] === 'select')?.[1]
      if (cols === 'bill_id, voted_at') return { data: [{ bill_id: '119-hr-1', voted_at: '2026-09-03' }] }
      if (cols === 'id, voted_at') return { data: [{ id: 'house-119-2-295', voted_at: '2026-09-03' }] }
      return { data: [{ voted_at: '2026-09-03' }] }
    }
    db.responses.roll_call_stats = { data: [{ roll_call_id: 'house-119-2-295', dem_yea: 200, dem_nay: 10, rep_yea: 180, rep_nay: 30, ind_yea: 0, ind_nay: 0 }] }
    db.responses.bills = { data: [{ id: '119-hr-1', title: 'One Big Beautiful Bill Act' }] }
    const locs = []
    for (const part of ['pages', 'members', 'records', 'votes', 'bills']) {
      const xml = await buildPart(part)
      const found = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
      expect(found.length).toBeGreaterThan(0)
      locs.push(...found)
    }
    for (const loc of locs) {
      expect(loc.startsWith('https://www.ballotwatch.io/')).toBe(true)
      expect(isGatedPath(new URL(loc).pathname)).toBe(false)
    }
    const paths = locs.map((l) => new URL(l).pathname)
    for (const gated of ['/all', '/bills', '/my-representative']) {
      expect(isGatedPath(gated)).toBe(true)
      expect(paths).not.toContain(gated)
    }
  })
})
