import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '../fixtures/supabaseChain.js'
import { shell } from '../fixtures/pages.js'

const db = makeSupabaseMock()
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: (t) => db.from(t) } }))

import { getRecordPage, getMemberPage } from '../../api/_lib/pages.js'
import { _resetEtlMetaCache } from '../../api/_lib/etlMeta.js'
import { renderPage, recordMeta } from '../../api/_lib/renderPage.js'
import { renderMarkdown } from '../../api/_lib/markdown.js'
import handler, { resolveTarget } from '../../api/prerender.js'
import { recordEntries, buildPart, _resetSitemapMemo } from '../../api/sitemap.js'
import { fetchRecordCardData } from '../../api/_lib/recordCard.js'

const reset = () => { db.reset(); _resetEtlMetaCache(); _resetSitemapMemo() }

function seedPelosi() {
  db.responses.politicians = { data: { id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', state: 'CA', district: null, party: 'Democratic', photo_url: null } }
  db.responses.member_congress_terms = { data: [{ congress: 119, chamber: 'house', state: 'CA', district: '11', party: 'D', term_start: '2025-01-03', term_end: null }] }
  db.responses.member_stats = { data: { congress: 119, total_votes: 676, yea_count: 256, nay_count: 355, present_count: 4, not_voting_count: 61 } }
  db.responses.votes = { count: 676, data: [
    { roll_call_id: 'house-119-2-295', position: 'Nay', voted_at: '2026-09-03', source_url: 'https://clerk.house.gov/Votes/2026295', bill_id: '119-hr-4795', bills: { id: '119-hr-4795', title: 'Water Resources <Development> Act of 2026' } },
    { roll_call_id: 'house-119-2-294', position: 'Not Voting', voted_at: '2026-09-03', source_url: 'javascript:alert(1)', bill_id: null, bills: null },
  ] }
  db.responses.roll_calls = { data: [{ id: 'house-119-2-295', question: 'On Passage', description: null, bill_id: '119-hr-4795' }, { id: 'house-119-2-294', question: 'On Motion to Adjourn', description: null, bill_id: null }] }
  db.responses.roll_call_stats = { data: [{ roll_call_id: 'house-119-2-295', dem_yea: 200, dem_nay: 10, rep_yea: 180, rep_nay: 30, ind_yea: 0, ind_nay: 0 }] }
  db.responses.etl_metadata = { data: { value: '2026-10-02T12:12:53Z' } }
}

function makeRes() {
  const headers = new Map()
  return {
    statusCode: 0, body: '',
    setHeader(k, v) { headers.set(k.toLowerCase(), v) },
    getHeader(k) { return headers.get(k.toLowerCase()) },
    end(b) { this.body = b || '' },
  }
}
const req = (query, accept = 'text/html') => ({ headers: { host: 'www.ballotwatch.io', 'x-forwarded-proto': 'https', accept }, query })

describe('record in 60 seconds: loader', () => {
  beforeEach(reset)

  it('loads ten votes with their roll calls and stats, and gates like the member page', async () => {
    seedPelosi()
    const r = await getRecordPage('p000197')
    expect(r).toMatchObject({ kind: 'record', id: 'P000197', district: '11', voteCount: 676, indexable: true, noindexReason: null, thin: false, updatedAt: '2026-10-02T12:12:53Z' })
    expect(r.recentVotes[0]).toMatchObject({ result: 'Passed', position: 'Nay', bill: { label: 'H.R. 4795' } })
    expect(r.recentVotes[1]).toMatchObject({ result: null, position: 'Not Voting', question: 'On Motion to Adjourn' })
    expect(db.ops('votes', 'limit')[0]).toEqual(['limit', 10])
    expect(db.ops('roll_calls', 'in')[0]).toEqual(['in', 'id', ['house-119-2-295', 'house-119-2-294']])
    expect(db.ops('roll_call_stats', 'in')[0]).toEqual(['in', 'roll_call_id', ['house-119-2-295', 'house-119-2-294']])
    // The card never reads campaign-finance tables or the party-majority score.
    expect(db.tables().some((t) => /fec|donation|contribut/i.test(t))).toBe(false)
    expect(db.ops('member_stats', 'select')[0][1]).not.toContain('party_loyalty_pct')

    reset()
    db.responses.politicians = { data: { id: 'A000383', name: 'Alan Armstrong', chamber: 'senate', state: 'OK', party: 'Republican' } }
    db.responses.votes = { count: 0, data: [] }
    const fresh = await getRecordPage('A000383')
    expect(fresh).toMatchObject({ voteCount: 0, recentVotes: [], indexable: false, noindexReason: 'no_votes' })
    expect(db.tables()).not.toContain('roll_calls')

    reset()
    expect(await getRecordPage('nancy')).toBeNull()
    expect(db.calls).toHaveLength(0)
    expect(await getRecordPage('Z999999')).toBeNull()
  })
})

describe('record in 60 seconds: rendering', () => {
  beforeEach(reset)

  it('renders HTML with record meta, a share image, embedded page data, and escaped, source-linked rows', async () => {
    seedPelosi()
    const r = await getRecordPage('P000197')
    const withImage = shell.replace('</head>', '<meta property="og:image" content="https://www.ballotwatch.io/congress.jpg" />\n<meta name="twitter:image" content="https://www.ballotwatch.io/congress.jpg" />\n</head>')
    const html = renderPage(withImage, r)
    expect(html).toContain("<title>Nancy Pelosi&#39;s record in 60 seconds (D-CA-11)</title>")
    expect(html).toContain('<link rel="canonical" href="https://www.ballotwatch.io/politician/P000197/record" />')
    expect(html).toContain('<meta property="og:image" content="https://www.ballotwatch.io/api/og?kind=record&amp;id=P000197" />')
    expect(html).toContain('<meta name="twitter:image" content="https://www.ballotwatch.io/api/og?kind=record&amp;id=P000197" />')
    expect(html).toContain('<meta property="og:type" content="profile" />')
    expect(html).toContain('<meta name="robots" content="index, follow" />')
    expect(html).toContain('"@type":"ProfilePage"')
    expect(html).toContain('<script type="application/json" id="__bw_page">')
    expect(html).toContain('href="/vote/119/house/2/295"')
    expect(html).toContain('href="/bill/119/hr/4795"')
    expect(html).toContain('href="https://clerk.house.gov/Votes/2026295"')
    expect(html).not.toContain('javascript:alert')
    expect(html).toContain('Water Resources &lt;Development&gt; Act of 2026')
    expect(html).toContain('<dd>676</dd>')
    expect(html).toContain('61 <span class="rec-facts-sub">(9%)</span>')
    expect(html).toContain('Data recorded through October 2, 2026.')
    expect(html).toContain('href="/politician/P000197">Full record')
    expect(html).toContain('Not derived')   // the adjournment vote has no trusted tally
    expect(html).not.toMatch(/party-majority|loyalty|votes with party/i)
    expect(recordMeta(r).description.length).toBeLessThanOrEqual(200)

    // A member with no votes: an honest note, no table, no placeholder rows, noindex.
    const empty = renderPage(shell, { ...r, voteCount: 0, recentVotes: [], stats: null, thin: true, indexable: false, noindexReason: 'no_votes' })
    expect(empty).toContain('No recorded votes for Nancy Pelosi in BallotWatch data yet.')
    expect(empty).toContain('Vote totals for the current Congress are not available yet.')
    expect(empty).not.toContain('<table')
    expect(empty).toContain('<meta name="robots" content="noindex, follow" />')

    const thin = renderPage(shell, { ...r, voteCount: 2, thin: true })
    expect(thin).toContain('Nancy Pelosi has 2 recorded votes so far. All are shown.')
  })

  it('renders the same facts as Markdown', async () => {
    seedPelosi()
    const md = renderMarkdown(await getRecordPage('P000197'))
    expect(md.startsWith("# Nancy Pelosi's record in 60 seconds\n")).toBe(true)
    expect(md).toContain('- 119th Congress: 676 roll calls, 615 votes cast (256 yea, 355 nay, 4 present), 61 not voting (9%)')
    expect(md).toContain('- Canonical: https://www.ballotwatch.io/politician/P000197/record')
    expect(md).toContain('| 2026-09-03 | [house-119-2-295](https://www.ballotwatch.io/vote/119/house/2/295) | On Passage | [H.R. 4795](https://www.ballotwatch.io/bill/119/hr/4795)')
    expect(md).toContain('| Nay | Passed | [record](https://clerk.house.gov/Votes/2026295) |')
  })
})

describe('record in 60 seconds: prerender kind, routing, sitemap', () => {
  beforeEach(() => { reset(); process.env.PRERENDER_SHELL_FROM_ORIGIN = '1'; global.fetch = vi.fn(async () => ({ ok: true, text: async () => shell })) })

  it('resolves kind=record and serves HTML or Markdown', async () => {
    expect(resolveTarget({ kind: 'record', id: 'p000197' })).toEqual({ kind: 'record', id: 'P000197', path: '/politician/P000197/record' })
    expect(resolveTarget({ kind: 'record' })).toBeNull()

    seedPelosi()
    let res = makeRes()
    await handler(req({ kind: 'record', id: 'P000197' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.getHeader('x-ballotwatch-prerender')).toBe('index')
    expect(res.getHeader('vary')).toBe('Accept')
    expect(res.body).toContain('class="rec"')

    reset(); seedPelosi()
    res = makeRes()
    await handler(req({ kind: 'record', id: 'P000197' }, 'text/markdown'), res)
    expect(res.getHeader('content-type')).toContain('text/markdown')
    expect(res.getHeader('link')).toBe('<https://www.ballotwatch.io/politician/P000197/record>; rel="canonical"')
    expect(res.body).toContain("# Nancy Pelosi's record in 60 seconds")

    reset()
    db.responses.politicians = { data: null }
    res = makeRes()
    await handler(req({ kind: 'record', id: 'Z999999' }), res)
    expect(res.statusCode).toBe(404)
    expect(res.getHeader('x-robots-tag')).toBe('noindex')
  })

  it('rewrites /politician/:id/record to the prerender function ahead of the SPA catch-all', () => {
    const { rewrites } = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'))
    const i = rewrites.findIndex((r) => r.source === '/politician/:bioguideId/record')
    expect(rewrites[i]).toEqual({ source: '/politician/:bioguideId/record', destination: '/api/prerender?kind=record&id=:bioguideId' })
    expect(i).toBeLessThan(rewrites.findIndex((r) => r.destination === '/index.html'))
    expect(readFileSync(resolve(process.cwd(), 'public/llms.txt'), 'utf8')).toContain('/politician/{bioguide_id}/record')
  })

  it('lists a record card for every member with votes', async () => {
    db.responses.politicians = { data: [{ id: 'P000197' }, { id: 'Z000000' }] }
    db.responses.member_stats = { data: [{ politician_id: 'P000197', total_votes: 676 }] }
    db.responses.roll_calls = { data: [{ voted_at: '2026-09-03T14:00:00Z' }] }
    expect(await recordEntries()).toEqual([{ path: '/politician/P000197/record', lastmod: '2026-09-03', changefreq: 'weekly' }])
    reset()
    db.responses.roll_calls = { data: [{ voted_at: '2026-09-03T00:00:00Z' }] }
    expect(await buildPart(null)).toContain('<loc>https://www.ballotwatch.io/sitemap-records.xml</loc>')
  })
})

describe('record in 60 seconds: share image data', () => {
  it('reads only seat and vote counts, never campaign-finance tables', async () => {
    const mock = makeSupabaseMock()
    mock.responses.politicians = { data: { id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', state: 'CA', district: null, party: 'Democratic' } }
    mock.responses.member_congress_terms = { data: [{ congress: 119, district: '11', term_start: '2025-01-03', term_end: null }] }
    mock.responses.member_stats = { data: { congress: 119, total_votes: 676, yea_count: 256, nay_count: 355, present_count: 4, not_voting_count: 61 } }
    mock.responses.etl_metadata = { data: { value: '2026-10-02T12:12:53Z' } }
    const r = await fetchRecordCardData('p000197', mock)
    expect(r).toMatchObject({ name: 'Nancy Pelosi', district: '11', stats: { total: 676, cast: 615, notVoting: 61 }, updatedAt: '2026-10-02T12:12:53Z' })
    expect(mock.tables().sort()).toEqual(['etl_metadata', 'member_congress_terms', 'member_stats', 'politicians'])
    expect(await fetchRecordCardData('bad id', mock)).toBeNull()
  })
})

// A failed read must never shape a real member as "no votes" (which the
// prerender, sitemap, and share image would cache): every query error throws.
describe('record loaders throw on any query error', () => {
  beforeEach(reset)

  it.each([
    ['member_congress_terms', 'terms down'],
    ['member_stats', 'stats down'],
    ['roll_calls', 'rc down'],
    ['roll_call_stats', 'rcs down'],
  ])('getRecordPage throws when %s fails', async (table, message) => {
    seedPelosi()
    db.responses[table] = { data: null, error: { message } }
    await expect(getRecordPage('P000197')).rejects.toThrow(message)
  })

  it.each([
    ['member_congress_terms', 'terms down'],
    ['member_stats', 'stats down'],
    ['roll_calls', 'rc down'],
  ])('getMemberPage throws when %s fails', async (table, message) => {
    seedPelosi()
    db.responses[table] = { data: null, error: { message } }
    await expect(getMemberPage('P000197')).rejects.toThrow(message)
  })

  it.each(['politicians', 'member_congress_terms', 'member_stats', 'etl_metadata'])(
    'fetchRecordCardData throws when %s fails (og.jsx then serves the short-cache fallback)',
    async (table) => {
      const mock = makeSupabaseMock()
      mock.responses.politicians = { data: { id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', state: 'CA', district: null, party: 'Democratic' } }
      mock.responses.member_congress_terms = { data: [] }
      mock.responses.member_stats = { data: { congress: 119, total_votes: 676, yea_count: 256, nay_count: 355, present_count: 4, not_voting_count: 61 } }
      mock.responses.etl_metadata = { data: { value: '2026-10-02T12:12:53Z' } }
      mock.responses[table] = { data: null, error: { message: `${table} down` } }
      await expect(fetchRecordCardData('P000197', mock)).rejects.toThrow(`${table} down`)
    },
  )
})
