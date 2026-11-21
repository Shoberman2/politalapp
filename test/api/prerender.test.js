import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { member, rollCall, bill, shell } from '../fixtures/pages.js'

const pages = { getMemberPage: vi.fn(), getRecordPage: vi.fn(), getRollCallPage: vi.fn(), getBillPage: vi.fn(), getMembersIndex: vi.fn() }
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: vi.fn() } }))
vi.mock('../../api/_lib/pages.js', async () => {
  const actual = await vi.importActual('../../api/_lib/pages.js')
  return { ...actual, getMemberPage: (...a) => pages.getMemberPage(...a), getRollCallPage: (...a) => pages.getRollCallPage(...a), getBillPage: (...a) => pages.getBillPage(...a), getRecordPage: (...a) => pages.getRecordPage(...a), getMembersIndex: (...a) => pages.getMembersIndex(...a) }
})

function makeRes() {
  const headers = new Map()
  return {
    statusCode: 0,
    headersSent: false,
    body: '',
    setHeader(k, v) { headers.set(k.toLowerCase(), v) },
    getHeader(k) { return headers.get(k.toLowerCase()) },
    end(b) { this.body = b || '' },
    headers,
  }
}

const baseReq = (query, accept = 'text/html') => ({ headers: { host: 'www.ballotwatch.io', 'x-forwarded-proto': 'https', accept }, query })

describe('api/prerender', () => {
  let handler, resolveTarget
  afterEach(() => { delete process.env.PRERENDER_SHELL_FROM_ORIGIN; delete process.env.PRERENDER_TIMEOUT_MS })

  beforeEach(async () => {
    vi.resetModules()
    process.env.PRERENDER_SHELL_FROM_ORIGIN = '1'
    global.fetch = vi.fn(async () => ({ ok: true, text: async () => shell }))
    pages.getMemberPage.mockReset(); pages.getRecordPage.mockReset(); pages.getMembersIndex.mockReset(); pages.getRollCallPage.mockReset(); pages.getBillPage.mockReset()
    const mod = await import('../../api/prerender.js')
    handler = mod.default
    resolveTarget = mod.resolveTarget
  })

  it('resolves rewrite queries into targets', () => {
    expect(resolveTarget({ kind: 'member', id: 'p000197' })).toEqual({ kind: 'member', id: 'P000197', segment: 'p000197', alias: false, path: '/politician/P000197' })
    expect(resolveTarget({ kind: 'member', id: 'P000197-nancy-pelosi' })).toMatchObject({ id: 'P000197', segment: 'P000197-nancy-pelosi' })
    expect(resolveTarget({ kind: 'member', id: 'nancy' })).toBeNull()
    expect(resolveTarget({ kind: 'members' })).toEqual({ kind: 'members', id: 'members', path: '/members' })
    expect(resolveTarget({ kind: 'bill', congress: '119', type: 'HR', number: '1' })).toEqual({ kind: 'bill', id: '119-hr-1', path: '/bill/119/hr/1' })
    expect(resolveTarget({ kind: 'vote', congress: '119', chamber: 'house', session: '2', roll: '295' })).toEqual({ kind: 'vote', id: 'house-119-2-295', path: '/vote/119/house/2/295' })
    expect(resolveTarget({ kind: 'vote', congress: '119', chamber: 'joint', session: '2', roll: '1' })).toBeNull()
  })

  it('renders a member page into the shell with long-lived cache headers', async () => {
    pages.getMemberPage.mockResolvedValue(member)
    const res = makeRes()
    await handler(baseReq({ kind: 'member', id: 'P000197-nancy-pelosi' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.getHeader('content-type')).toContain('text/html')
    expect(res.getHeader('cache-control')).toBe('public, s-maxage=900, stale-while-revalidate=86400')
    expect(res.getHeader('x-ballotwatch-prerender')).toBe('index')
    expect(res.body).toContain('Nancy Pelosi Voting Record')
    expect(res.body).toContain('/assets/index-abc123.js')
    expect(global.fetch).toHaveBeenCalledWith('https://www.ballotwatch.io/index.html', expect.anything())
  })

  it('returns Markdown when asked and marks noindex pages in a header', async () => {
    pages.getRollCallPage.mockResolvedValue({ ...rollCall, indexable: false, noindexReason: 'tally_mismatch' })
    const res = makeRes()
    await handler(baseReq({ kind: 'vote', congress: '119', chamber: 'house', session: '2', roll: '295' }, 'text/markdown'), res)
    expect(res.statusCode).toBe(200)
    expect(res.getHeader('content-type')).toContain('text/markdown')
    expect(res.getHeader('link')).toBe('<https://www.ballotwatch.io/vote/119/house/2/295>; rel="canonical"')
    expect(res.getHeader('x-robots-tag')).toBe('noindex')
    expect(res.body.startsWith('# House roll call 295')).toBe(true)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('serves the plain shell with a 404 for unknown records', async () => {
    pages.getMemberPage.mockResolvedValue(null)
    const res = makeRes()
    await handler(baseReq({ kind: 'member', id: 'Z999999' }), res)
    expect(res.statusCode).toBe(404)
    expect(res.getHeader('x-robots-tag')).toBe('noindex')
    // A dedicated 404 body, not the homepage's title, robots and canonical.
    expect(res.body).toContain('<title>Member not found | BallotWatch</title>')
    expect(res.body).toContain('<meta name="robots" content="noindex" />')
    expect(res.body).not.toContain('rel="canonical"')
    expect(res.body).toContain('Member Not Found')
    expect(res.body).not.toContain('<meta name="robots" content="index, follow" />')
  })

  it('serves the same 404 body for a malformed member id and for a record card', async () => {
    let res = makeRes()
    await handler(baseReq({ kind: 'member', id: 'nancy-pelosi' }), res)
    expect(res.statusCode).toBe(404)
    expect(res.body).toContain('<title>Member not found | BallotWatch</title>')
    pages.getRecordPage.mockResolvedValue(null)
    res = makeRes()
    await handler(baseReq({ kind: 'record', id: 'Z999999' }), res)
    expect(res.statusCode).toBe(404)
    expect(res.getHeader('x-robots-tag')).toBe('noindex')
    expect(res.body).toContain('<meta name="robots" content="noindex" />')
  })

  it('301s a bare id, a wrong slug and a lowercase id to the slugged canonical, keeping the query string', async () => {
    pages.getMemberPage.mockResolvedValue(member)
    for (const id of ['P000197', 'P000197-pelosi', 'P000197-nancy-pelosi-2', 'p000197-nancy-pelosi', 'P000197-Nancy-Pelosi']) {
      const res = makeRes()
      await handler(baseReq({ kind: 'member', id, utm_source: 'x' }), res)
      expect(res.statusCode, id).toBe(301)
      expect(res.getHeader('location')).toBe('/politician/P000197-nancy-pelosi?utm_source=x')
      expect(res.getHeader('cache-control')).toContain('s-maxage')
      expect(res.body).toBe('')
    }
    const res = makeRes()
    await handler(baseReq({ kind: 'member', id: 'P000197' }), res)
    expect(res.getHeader('location')).toBe('/politician/P000197-nancy-pelosi')
  })

  it('301s the record card to the slugged /record and serves the canonical form', async () => {
    pages.getRecordPage.mockResolvedValue({ kind: 'record', id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', state: 'CA', district: '11', party: 'Democratic', stats: null, voteCount: 0, recentVotes: [], thin: true, sources: { congressGov: 'https://www.congress.gov/member/P000197', bioguide: 'https://bioguide.congress.gov/search/bio/P000197', chamberVotes: 'https://clerk.house.gov/Votes' }, indexable: true })
    let res = makeRes()
    await handler(baseReq({ kind: 'record', id: 'P000197' }), res)
    expect(res.statusCode).toBe(301)
    expect(res.getHeader('location')).toBe('/politician/P000197-nancy-pelosi/record')
    res = makeRes()
    await handler(baseReq({ kind: 'record', id: 'P000197-nancy-pelosi' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('rel="canonical" href="https://www.ballotwatch.io/politician/P000197-nancy-pelosi/record"')
  })

  it('redirects Markdown requests the same way and links the slugged canonical', async () => {
    pages.getMemberPage.mockResolvedValue(member)
    let res = makeRes()
    await handler(baseReq({ kind: 'member', id: 'P000197' }, 'text/markdown'), res)
    expect(res.statusCode).toBe(301)
    expect(res.getHeader('location')).toBe('/politician/P000197-nancy-pelosi')
    res = makeRes()
    await handler(baseReq({ kind: 'member', id: 'P000197-nancy-pelosi' }, 'text/markdown'), res)
    expect(res.statusCode).toBe(200)
    expect(res.getHeader('link')).toBe('<https://www.ballotwatch.io/politician/P000197-nancy-pelosi>; rel="canonical"')
  })

  it('/member/:id (alias=1) always redirects, even on an already-canonical segment, and 404s unknown ids', async () => {
    pages.getMemberPage.mockResolvedValue(member)
    let res = makeRes()
    await handler(baseReq({ kind: 'member', id: 'P000197-nancy-pelosi', alias: '1' }), res)
    expect(res.statusCode).toBe(301)
    expect(res.getHeader('location')).toBe('/politician/P000197-nancy-pelosi')
    pages.getMemberPage.mockResolvedValue(null)
    res = makeRes()
    await handler(baseReq({ kind: 'member', id: 'Z999999', alias: '1' }), res)
    expect(res.statusCode).toBe(404)
  })

  it('renders the public members index: slugged links, groups, ItemList, canonical, cache', async () => {
    const mk = (id, name, chamber, state, district, party, current = true) => ({ id, name, chamber, state, district, party, current })
    const members = [
      mk('S000148', 'Charles Schumer', 'senate', 'NY', null, 'Democratic'),
      mk('P000197', 'Nancy Pelosi', 'house', 'CA', '11', 'Democratic'),
      mk('N000147', 'Eleanor Holmes Norton', 'house', 'DC', null, 'Democratic'),
      mk('X000001', 'Old Member', 'house', 'TX', '2', 'Republican', false),
    ]
    const { groupMembers } = await import('../../shared/membersIndex.js')
    pages.getMembersIndex.mockResolvedValue({ kind: 'members', members, groups: groupMembers(members), total: 4, indexable: true, updatedAt: '2026-11-19T00:00:00Z' })
    const res = makeRes()
    await handler(baseReq({ kind: 'members' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.getHeader('cache-control')).toBe('public, s-maxage=900, stale-while-revalidate=86400')
    const html = res.body
    expect(html).toContain('<title>Members of Congress, 119th Congress | BallotWatch</title>')
    expect(html).toContain('<link rel="canonical" href="https://www.ballotwatch.io/members" />')
    expect(html).toContain('<meta name="robots" content="index, follow" />')
    expect(html).toContain('<a href="/politician/S000148-charles-schumer">Charles Schumer</a> <span class="mi-meta">D · New York · Senator</span>')
    expect(html).toContain('<a href="/politician/P000197-nancy-pelosi">Nancy Pelosi</a> <span class="mi-meta">D · California · Representative, district 11</span>')
    expect(html).toContain('Delegate')
    expect(html.indexOf('<h2>Senate</h2>')).toBeLessThan(html.indexOf('<h2>House of Representatives</h2>'))
    expect(html).toContain('<h2>Delegates and Resident Commissioner</h2>')
    expect(html).toContain('<h2>Left office or replaced during recorded votes</h2>')
    const ld = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))
    const list = ld.find((b) => b['@type'] === 'CollectionPage').mainEntity
    expect(list['@type']).toBe('ItemList')
    expect(list.numberOfItems).toBe(4)
    expect(list.itemListElement[0].url).toBe('https://www.ballotwatch.io/politician/S000148-charles-schumer')
    expect(html).toContain('<script type="application/json" id="__bw_page">')

    const md = makeRes()
    await handler(baseReq({ kind: 'members' }, 'text/markdown'), md)
    expect(md.body).toContain('[Charles Schumer](https://www.ballotwatch.io/politician/S000148-charles-schumer)')
  })

  it('serves the plain shell uncached when the members read fails', async () => {
    pages.getMembersIndex.mockRejectedValue(new Error('db down'))
    const res = makeRes()
    await handler(baseReq({ kind: 'members' }), res)
    expect(res.getHeader('cache-control')).toBe('no-store')
    expect(res.getHeader('x-ballotwatch-prerender')).toBe('fallback')
  })

  it('skips rendering for bills with no vote and no summary', async () => {
    pages.getBillPage.mockResolvedValue({ ...bill, rollCalls: [], indexable: false, noindexReason: 'no_vote_or_summary' })
    const res = makeRes()
    await handler(baseReq({ kind: 'bill', congress: '119', type: 'hr', number: '7038' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.getHeader('x-ballotwatch-prerender')).toBe('skipped')
    expect(res.getHeader('cache-control')).toContain('s-maxage=3600')
    expect(res.body).toContain('<div id="root"></div>')
  })

  it('falls back to the uncached shell when the data layer fails', async () => {
    pages.getMemberPage.mockRejectedValue(new Error('db down'))
    const res = makeRes()
    await handler(baseReq({ kind: 'member', id: 'P000197-nancy-pelosi' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.getHeader('cache-control')).toBe('no-store')
    expect(res.getHeader('x-ballotwatch-prerender')).toBe('fallback')
    expect(res.body).toContain('<div id="root"></div>')
  })

  it('falls back when the data layer is slower than the budget', async () => {
    process.env.PRERENDER_TIMEOUT_MS = '20'
    vi.resetModules()
    const mod = await import('../../api/prerender.js')
    pages.getMemberPage.mockImplementation(() => new Promise((r) => setTimeout(() => r(member), 200)))
    const res = makeRes()
    await mod.default(baseReq({ kind: 'member', id: 'P000197' }), res)
    expect(res.getHeader('x-ballotwatch-prerender')).toBe('fallback')
  })
})
