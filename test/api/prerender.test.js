import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { member, rollCall, bill, shell } from '../fixtures/pages.js'

const pages = { getMemberPage: vi.fn(), getRollCallPage: vi.fn(), getBillPage: vi.fn() }
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: vi.fn() } }))
vi.mock('../../api/_lib/pages.js', async () => {
  const actual = await vi.importActual('../../api/_lib/pages.js')
  return { ...actual, getMemberPage: (...a) => pages.getMemberPage(...a), getRollCallPage: (...a) => pages.getRollCallPage(...a), getBillPage: (...a) => pages.getBillPage(...a) }
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
    pages.getMemberPage.mockReset(); pages.getRollCallPage.mockReset(); pages.getBillPage.mockReset()
    const mod = await import('../../api/prerender.js')
    handler = mod.default
    resolveTarget = mod.resolveTarget
  })

  it('resolves rewrite queries into targets', () => {
    expect(resolveTarget({ kind: 'member', id: 'p000197' })).toEqual({ kind: 'member', id: 'P000197', path: '/politician/P000197' })
    expect(resolveTarget({ kind: 'bill', congress: '119', type: 'HR', number: '1' })).toEqual({ kind: 'bill', id: '119-hr-1', path: '/bill/119/hr/1' })
    expect(resolveTarget({ kind: 'vote', congress: '119', chamber: 'house', session: '2', roll: '295' })).toEqual({ kind: 'vote', id: 'house-119-2-295', path: '/vote/119/house/2/295' })
    expect(resolveTarget({ kind: 'vote', congress: '119', chamber: 'joint', session: '2', roll: '1' })).toBeNull()
  })

  it('renders a member page into the shell with long-lived cache headers', async () => {
    pages.getMemberPage.mockResolvedValue(member)
    const res = makeRes()
    await handler(baseReq({ kind: 'member', id: 'P000197' }), res)
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
    expect(res.body).toContain('<div id="root"></div>')
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
    await handler(baseReq({ kind: 'member', id: 'P000197' }), res)
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
