// Link previews for /politician/:id/record. Runs the real prerender handler
// against the real index.html shell (the one Vite ships) with mocked data, and
// checks every tag a link-preview crawler reads. Then checks the share image
// function's slow-path fallbacks without touching the network.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSupabaseMock } from '../fixtures/supabaseChain.js'

const db = makeSupabaseMock()
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: (t) => db.from(t) } }))

const og = vi.hoisted(() => ({ record: vi.fn() }))
vi.mock('../../api/_lib/recordCard.js', () => ({ fetchRecordCardData: og.record }))
// Stand-in for @vercel/og so the test never fetches fonts or rasterizes.
vi.mock('@vercel/og', () => ({
  ImageResponse: class {
    constructor(element, opts) {
      this.element = element
      this.status = 200
      this.headers = new Headers(opts.headers)
      this.opts = opts
    }
  },
}))

import handler from '../../api/prerender.js'
import ogHandler, { CACHE_OK, CACHE_FALLBACK, DATA_TIMEOUT_MS } from '../../api/og.jsx'
import { _resetEtlMetaCache } from '../../api/_lib/etlMeta.js'
import { shapeMemberRecord } from '../../shared/memberRecord.js'

const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

function seed() {
  db.responses.politicians = { data: { id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', state: 'CA', district: null, party: 'Democratic', photo_url: null } }
  db.responses.member_congress_terms = { data: [{ congress: 119, chamber: 'house', state: 'CA', district: '11', party: 'D', term_start: '2025-01-03', term_end: null }] }
  db.responses.member_stats = { data: { congress: 119, total_votes: 676, yea_count: 256, nay_count: 355, present_count: 4, not_voting_count: 61 } }
  db.responses.votes = { count: 676, data: [{ roll_call_id: 'house-119-2-295', position: 'Nay', voted_at: '2026-09-03', source_url: 'https://clerk.house.gov/Votes/2026295', bill_id: '119-hr-4795', bills: { id: '119-hr-4795', title: 'Water Resources Development Act of 2026' } }] }
  db.responses.roll_calls = { data: [{ id: 'house-119-2-295', question: 'On Passage', description: null, bill_id: '119-hr-4795' }] }
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

// Every occurrence of a meta tag, keyed by property or name.
function metas(html, key) {
  const re = new RegExp(`<meta (?:property|name)="${key.replace(/[:.]/g, '\\$&')}" content="([^"]*)"`, 'g')
  return [...html.matchAll(re)].map((m) => m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'"))
}

describe('record card link preview (prerendered HTML)', () => {
  beforeEach(() => {
    db.reset(); _resetEtlMetaCache()
    process.env.PRERENDER_SHELL_FROM_ORIGIN = '1'
    global.fetch = vi.fn(async () => ({ ok: true, text: async () => indexHtml }))
  })

  it('carries complete Open Graph and Twitter tags, each exactly once, with absolute URLs', async () => {
    seed()
    const res = makeRes()
    await handler({ headers: { host: 'www.ballotwatch.io', 'x-forwarded-proto': 'https', accept: 'text/html' }, query: { kind: 'record', id: 'P000197' } }, res)
    expect(res.statusCode).toBe(200)
    const html = res.body
    const canonical = 'https://www.ballotwatch.io/politician/P000197/record'
    const image = 'https://www.ballotwatch.io/congress.jpg'
    const title = "Nancy Pelosi's record in 60 seconds (D-CA-11)"

    expect(metas(html, 'og:title')).toEqual([title])
    expect(metas(html, 'twitter:title')).toEqual([title])
    const [description] = metas(html, 'og:description')
    expect(description).toMatch(/^Nancy Pelosi, U\.S\. Representative for California district 11\. 119th Congress: voted on 615 of 676 roll calls/)
    expect(description.length).toBeLessThanOrEqual(200)
    expect(metas(html, 'twitter:description')).toEqual([description])
    expect(metas(html, 'og:url')).toEqual([canonical])
    expect(html).toContain(`<link rel="canonical" href="${canonical}" />`)
    expect(metas(html, 'og:type')).toEqual(['profile'])
    expect(metas(html, 'og:image')).toEqual([image])
    expect(metas(html, 'twitter:image')).toEqual([image])
    expect(metas(html, 'og:image:width')).toEqual(['1200'])
    expect(metas(html, 'og:image:height')).toEqual(['630'])
    expect(metas(html, 'og:image:alt')).toEqual([title])
    expect(metas(html, 'twitter:card')).toEqual(['summary_large_image'])
    for (const u of [...metas(html, 'og:image'), ...metas(html, 'og:url')]) expect(u).toMatch(/^https:\/\//)
    // Until /api/og is served in production (TODOS.md), record previews use the
    // static 1200x630 card rather than a broken image URL.
  })
})

describe('record share image (api/og.jsx)', () => {
  const record = shapeMemberRecord({
    member: { id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', state: 'CA', district: '11', party: 'Democratic' },
    stats: { congress: 119, total_votes: 676, yea_count: 256, nay_count: 355, present_count: 4, not_voting_count: 61 },
    voteCount: 676,
  })
  const req = () => new Request('https://www.ballotwatch.io/api/og?kind=record&id=P000197')
  const text = (el) => JSON.stringify(el, (k, v) => (k === '_owner' || k === '_store' ? undefined : v))

  beforeEach(() => {
    og.record.mockReset()
    global.fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('renders the member card at 1200x630 and caches it for a day', async () => {
    og.record.mockResolvedValue(record)
    const res = await ogHandler(req())
    expect(og.record).toHaveBeenCalledWith('P000197')
    expect(res.opts).toMatchObject({ width: 1200, height: 630 })
    expect(res.headers.get('cache-control')).toBe(CACHE_OK)
    expect(text(res.element)).toContain('Nancy Pelosi')
    expect(text(res.element)).toContain('615')
  })

  it('renders the generic card with a short cache when the database is slow or down', async () => {
    og.record.mockRejectedValue(new Error('db down'))
    let res = await ogHandler(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe(CACHE_FALLBACK)
    expect(text(res.element)).not.toContain('Nancy Pelosi')

    vi.useFakeTimers()
    og.record.mockReturnValue(new Promise(() => {}))
    const pending = ogHandler(req())
    await vi.advanceTimersByTimeAsync(DATA_TIMEOUT_MS + 10)
    res = await pending
    expect(res.headers.get('cache-control')).toBe(CACHE_FALLBACK)
  })

  it('redirects to the static Capitol image when fonts cannot load, never a text error', async () => {
    og.record.mockResolvedValue(record)
    global.fetch = vi.fn(async () => ({ ok: false, status: 503 }))
    // A fresh module, so fonts cached by the earlier tests do not mask the failure.
    vi.resetModules()
    const { default: fresh } = await import('../../api/og.jsx')
    const res = await fresh(req())
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://www.ballotwatch.io/congress.jpg')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
