import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { member, shell } from '../fixtures/pages.js'

const mocks = { loadFloorSchedule: vi.fn(), getHomeVotes: vi.fn(), getMemberPage: vi.fn() }
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: vi.fn() } }))
vi.mock('../../api/_lib/etlMeta.js', () => ({ getDataUpdatedAt: async () => '2026-11-20T10:00:00.000Z' }))
vi.mock('../../api/_lib/floorSchedule.js', async () => {
  const actual = await vi.importActual('../../api/_lib/floorSchedule.js')
  return { ...actual, loadFloorSchedule: (...a) => mocks.loadFloorSchedule(...a) }
})
vi.mock('../../api/_lib/pages.js', async () => {
  const actual = await vi.importActual('../../api/_lib/pages.js')
  return { ...actual, getHomeVotes: (...a) => mocks.getHomeVotes(...a), getMemberPage: (...a) => mocks.getMemberPage(...a) }
})

import { renderPage, memberTallySentence, memberFaq, memberJsonLd } from '../../api/_lib/renderPage.js'
import { memberMarkdown } from '../../api/_lib/markdown.js'
import { renderHomeBody, homeMarkdown } from '../../api/_lib/renderHome.js'
import { renderDevelopersPage, renderGatedShell, renderAuthShell, GATED_SHELL_PAGES } from '../../api/_lib/renderInfo.js'
import { isGatedPath } from '../../shared/access.js'

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')
const vercel = JSON.parse(read('vercel.json'))
const EM_DASH = String.fromCharCode(0x2014)

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
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))
const head = (html, re) => (html.match(re) || [])[1]

const schedule = { chamber: 'house', senate_note: 'x', weeks: [
  { week: '2026-11-16', chamber: 'house', status: 'published', source_url: 'https://docs.house.gov/floor/Default.aspx?date=2026-11-16', items: [
    { item_id: '1', label: 'H.R. 1234', title: 'Housing <Affordability> Act', category: 'Suspensions', bill_path: '/bill/119/hr/1234' },
    { item_id: '2', label: null, title: 'A rule', category: null, bill_path: null },
  ] },
  { week: '2026-11-23', chamber: 'house', status: 'not_published', items: [] },
] }
const votes = { latest: null, recent: [
  { id: 'house-119-2-295', chamber: 'House', congress: 119, session: 2, roll: 295, question: 'On Passage', description: null, voted_at: '2026-11-19', bill: { id: '119-hr-1', label: 'H.R. 1', path: '/bill/119/hr/1', title: 'Lower Costs Act' }, tally: { yea: 215, nay: 205 }, result: 'Passed' },
] }

describe('/this-week and /developers prerender', () => {
  let handler, resolveTarget
  beforeEach(async () => {
    vi.resetModules()
    process.env.PRERENDER_SHELL_FROM_ORIGIN = '1'
    global.fetch = vi.fn(async () => ({ ok: true, text: async () => shell }))
    mocks.loadFloorSchedule.mockReset(); mocks.getHomeVotes.mockReset()
    const mod = await import('../../api/prerender.js')
    handler = mod.default; resolveTarget = mod.resolveTarget
  })
  afterEach(() => { delete process.env.PRERENDER_SHELL_FROM_ORIGIN })

  it('rewrites both routes ahead of the SPA catch-all', () => {
    const catchAll = vercel.rewrites.findIndex((r) => r.destination === '/index.html')
    for (const [source, destination] of [['/this-week', '/api/prerender?kind=this-week'], ['/developers', '/api/prerender?kind=developers']]) {
      const i = vercel.rewrites.findIndex((r) => r.source === source)
      expect(vercel.rewrites[i].destination).toBe(destination)
      expect(i).toBeLessThan(catchAll)
    }
    expect(resolveTarget({ kind: 'this-week' })).toMatchObject({ kind: 'this-week', path: '/this-week' })
    expect(resolveTarget({ kind: 'developers' })).toMatchObject({ kind: 'developers', path: '/developers' })
  })

  it('renders /this-week with the head, JSON-LD and the week\'s votes and bills linked', async () => {
    mocks.loadFloorSchedule.mockResolvedValue({ allFailed: false, data: schedule })
    mocks.getHomeVotes.mockResolvedValue(votes)
    const res = makeRes()
    await handler(req({ kind: 'this-week' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.getHeader('cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=86400')
    const html = res.body
    expect(head(html, /<title>([^<]*)<\/title>/)).toBe('This Week on the Floor | BallotWatch')
    expect(html).toContain('<link rel="canonical" href="https://www.ballotwatch.io/this-week" />')
    expect(html).toContain('<meta property="og:url" content="https://www.ballotwatch.io/this-week" />')
    expect(html).toContain('<meta property="og:title" content="This Week on the Floor | BallotWatch" />')
    expect(html).toContain('<meta name="twitter:title" content="This Week on the Floor | BallotWatch" />')
    expect(html).toMatch(/<meta name="twitter:description" content="What the U\.S\. House has scheduled/)
    expect(html).toContain('<h1 class="ip-title">This Week On The Floor</h1>')
    expect(html).toContain('<a href="/bill/119/hr/1234">H.R. 1234</a>')
    expect(html).toContain('Housing &lt;Affordability&gt; Act')
    expect(html).toContain('<a href="/vote/119/house/2/295">House roll call 295</a>')
    expect(html).toContain('<a href="/bill/119/hr/1">H.R. 1</a>')
    expect(html).toContain('<div id="root"><div class="app">')
    expect(html).toContain('/assets/index-abc123.js')
    const blocks = ld(html)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ '@type': 'WebPage', url: 'https://www.ballotwatch.io/this-week' })
    expect(html).not.toContain(EM_DASH)
  })

  it('falls back to a plain description when both reads fail, and caches it briefly', async () => {
    mocks.loadFloorSchedule.mockRejectedValue(new Error('boom'))
    mocks.getHomeVotes.mockRejectedValue(new Error('boom'))
    const res = makeRes()
    await handler(req({ kind: 'this-week' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.getHeader('cache-control')).toBe('public, s-maxage=60, stale-while-revalidate=600')
    expect(res.body).toContain('couldn’t be loaded right now')
    expect(res.body).toContain('No recorded votes to show right now.')
    expect(res.body).toContain('This Week On The Floor')
  })

  it('answers Accept: text/markdown for /this-week and /developers', async () => {
    mocks.loadFloorSchedule.mockResolvedValue({ allFailed: false, data: schedule })
    mocks.getHomeVotes.mockResolvedValue(votes)
    let res = makeRes()
    await handler(req({ kind: 'this-week' }, 'text/markdown'), res)
    expect(res.getHeader('content-type')).toContain('text/markdown')
    expect(res.getHeader('link')).toBe('<https://www.ballotwatch.io/this-week>; rel="canonical"')
    expect(res.body).toContain('[H.R. 1234](https://www.ballotwatch.io/bill/119/hr/1234)')
    expect(res.body).toContain('https://www.ballotwatch.io/vote/119/house/2/295')
    res = makeRes()
    await handler(req({ kind: 'developers' }, 'text/markdown'), res)
    expect(res.body).toContain('JSON API base URL: https://www.ballotwatch.io/api/v1')
    expect(res.body).toContain('https://www.ballotwatch.io/mcp')
    expect(res.body).not.toContain(EM_DASH)
  })

  it('renders /developers with its own head, text and links', async () => {
    const res = makeRes()
    await handler(req({ kind: 'developers' }), res)
    const html = res.body
    expect(res.statusCode).toBe(200)
    expect(head(html, /<title>([^<]*)<\/title>/)).toBe('For Developers: API, MCP Server and Open Data | BallotWatch')
    expect(html).toContain('<link rel="canonical" href="https://www.ballotwatch.io/developers" />')
    expect(html).toContain('<meta property="og:url" content="https://www.ballotwatch.io/developers" />')
    for (const href of ['/developers/docs', '/openapi.yaml', '/llms.txt']) expect(html).toContain(`href="${href}"`)
    expect(html).toContain('https://www.ballotwatch.io/api/v1')
    expect(html).toContain('https://www.ballotwatch.io/mcp')
    expect(ld(html)[0]).toMatchObject({ '@type': 'WebPage', url: 'https://www.ballotwatch.io/developers' })
    expect(renderDevelopersPage(shell)).not.toContain(EM_DASH)
  })
})

describe('gated routes and /auth', () => {
  it('rewrites them and keeps them gated, off the sitemap source and without a redirect', () => {
    for (const p of Object.keys(GATED_SHELL_PAGES)) expect(isGatedPath(p)).toBe(true)
    const r = vercel.rewrites.find((x) => x.source === '/:page(all|bills|my-representative)')
    expect(r.destination).toBe('/api/prerender?kind=shell&page=:page')
    expect(vercel.redirects.some((x) => x.source === '/all')).toBe(false)
  })

  it('gives each its own head, with /all canonical to /members, and no body content', () => {
    const all = renderGatedShell(shell, '/all')
    expect(all).toContain('<link rel="canonical" href="https://www.ballotwatch.io/members" />')
    expect(all).toContain('<meta property="og:url" content="https://www.ballotwatch.io/members" />')
    expect(head(all, /<title>([^<]*)<\/title>/)).toBe('Current Members and Delegates of Congress | BallotWatch')
    for (const p of ['/bills', '/my-representative']) {
      const html = renderGatedShell(shell, p)
      expect(html).toContain(`<link rel="canonical" href="https://www.ballotwatch.io${p}" />`)
      expect(html).toContain(`<meta property="og:url" content="https://www.ballotwatch.io${p}" />`)
      expect(html).toMatch(/<meta name="twitter:description" content="[^"]+" \/>/)
    }
    expect(all).toContain('<div id="root"></div>')
    expect(all).not.toContain('<main')
  })

  it('serves them through the handler, 404s other pages and has no Markdown view', async () => {
    vi.resetModules()
    process.env.PRERENDER_SHELL_FROM_ORIGIN = '1'
    global.fetch = vi.fn(async () => ({ ok: true, text: async () => shell }))
    const { default: handler } = await import('../../api/prerender.js')
    let res = makeRes()
    await handler(req({ kind: 'shell', page: 'bills' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Congressional Bill Tracker | BallotWatch')
    res = makeRes()
    await handler(req({ kind: 'shell', page: 'compare' }), res)
    expect(res.statusCode).toBe(404)
    res = makeRes()
    await handler(req({ kind: 'shell', page: 'bills' }, 'text/markdown'), res)
    expect(res.statusCode).toBe(404)
    delete process.env.PRERENDER_SHELL_FROM_ORIGIN
  })

  it('noindexes /auth and /auth/* in the page and the header', async () => {
    expect(renderAuthShell(shell)).toContain('<meta name="robots" content="noindex, follow" />')
    expect(renderAuthShell(shell)).not.toContain('content="index, follow"')
    expect(renderAuthShell('<html><head></head><body></body></html>')).toContain('<meta name="robots" content="noindex, follow" />')
    for (const source of ['/auth', '/auth/:path*']) expect(vercel.rewrites.find((r) => r.source === source).destination).toBe('/api/prerender?kind=shell&page=auth')
    for (const source of ['/auth', '/auth/(.*)']) {
      const h = vercel.headers.find((x) => x.source === source)
      expect(h.headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex, follow' })
    }
    vi.resetModules()
    process.env.PRERENDER_SHELL_FROM_ORIGIN = '1'
    global.fetch = vi.fn(async () => ({ ok: true, text: async () => shell }))
    const { default: handler } = await import('../../api/prerender.js')
    const res = makeRes()
    await handler(req({ kind: 'shell', page: 'auth' }), res)
    expect(res.getHeader('x-robots-tag')).toBe('noindex, follow')
    expect(res.body).toContain('<meta name="robots" content="noindex, follow" />')
    delete process.env.PRERENDER_SHELL_FROM_ORIGIN
  })
})

describe('member tally sentence and FAQ', () => {
  it('opens with the tally built from the stats row, in place of the standfirst', () => {
    expect(memberTallySentence(member)).toBe('Nancy Pelosi (D-CA-11) has 890 recorded roll-call votes in the 119th Congress: 400 yea, 380 nay, 0 present, 110 not voting.')
    const html = renderPage(shell, member)
    expect(html).toContain('<p class="pol-standfirst pol-tally">Nancy Pelosi (D-CA-11) has 890 recorded roll-call votes')
    expect(html.indexOf('pol-tally')).toBeGreaterThan(html.indexOf('<h1 class="pol-name">'))
    // One tally on the page: the description-style standfirst is not repeated.
    const body = html.slice(html.indexOf('<article class="pol">'))
    expect(body.match(/recorded (roll-call )?votes in the 119th Congress/g)).toHaveLength(3) // sentence + two FAQ answers
    expect(body).not.toContain('890 recorded votes in the 119th Congress')
  })

  it('always names present votes, and skips the sentence without counts', () => {
    expect(memberTallySentence({ ...member, stats: { ...member.stats, present_count: 3 } })).toContain('380 nay, 3 present, 110 not voting')
    expect(memberTallySentence({ ...member, stats: null })).toBe('')
    expect(memberTallySentence({ ...member, stats: { ...member.stats, nay_count: null } })).toBe('')
    const html = renderPage(shell, { ...member, stats: null })
    expect(html).not.toContain('pol-tally')
    expect(html).not.toContain('pol-faq')
    expect(html).toContain('<p class="pol-standfirst">')
    expect(ld(html).map((b) => b['@type'])).toEqual(['Person', 'BreadcrumbList'])
  })

  it('builds the same text for the React page from the shared module', async () => {
    const shared = await import('../../shared/memberFaq.js')
    const facts = { name: member.name, party: member.party, state: member.state, district: member.district, stats: member.stats }
    expect(shared.memberTallySentence(facts)).toBe(memberTallySentence(member))
    expect(shared.memberFaq(facts)).toEqual(memberFaq(member))
    const blocks = ld(renderPage(shell, member))
    expect(blocks[2]).toEqual(shared.memberFaqJsonLd(facts))
  })

  it('adds a FAQPage block beside Person and BreadcrumbList, and the same Q&A is visible', () => {
    const html = renderPage(shell, member)
    const blocks = ld(html)
    expect(blocks.map((b) => b['@type'])).toEqual(['Person', 'BreadcrumbList', 'FAQPage'])
    const faq = blocks[2]
    expect(faq.mainEntity.map((q) => q.name)).toEqual([
      'How did Nancy Pelosi vote in the 119th Congress?',
      'How many votes has Nancy Pelosi missed?',
      'Where does BallotWatch get Nancy Pelosi\'s votes?',
    ])
    const visible = html.slice(html.indexOf('class="pol-editorial pol-faq"'))
    for (const q of faq.mainEntity) {
      expect(visible).toContain(`<h3>${q.name.replace(/'/g, '&#39;')}</h3>`)
      expect(visible).toContain(q.acceptedAnswer.text.replace(/'/g, '&#39;'))
    }
    expect(faq.mainEntity[0].acceptedAnswer.text).toContain('400 yea, 380 nay, 0 present, 110 not voting')
    expect(faq.mainEntity[1].acceptedAnswer.text).toContain('110 not-voting entries among 890')
    expect(memberJsonLd(member)[0]['@type']).toBe('Person')
    expect(memberFaq({ ...member, stats: null })).toEqual([])
  })

  it('mirrors the sentence and the Q&A in the Markdown view', () => {
    const md = memberMarkdown(member)
    expect(md).toContain(memberTallySentence(member))
    expect(md).toContain('### How many votes has Nancy Pelosi missed?')
    expect(memberMarkdown({ ...member, stats: null })).not.toContain('## Questions')
    expect(md).not.toContain(EM_DASH)
  })
})

describe('homepage latest vote names its sponsor', () => {
  const latest = { ...votes.recent[0], bill: { ...votes.recent[0].bill, sponsor: { id: 'P000197', name: 'Nancy Pelosi' } } }
  it('links the sponsor to the member page, in HTML and Markdown', () => {
    const html = renderHomeBody({ votes: { latest, recent: [latest] }, updatedAt: null })
    expect(html).toContain('<p class="home-vote-sponsor">Sponsor: <a href="/politician/P000197-nancy-pelosi">Nancy Pelosi</a></p>')
    expect(homeMarkdown({ votes: { latest, recent: [latest] } })).toContain('- Sponsor: [Nancy Pelosi](https://www.ballotwatch.io/politician/P000197-nancy-pelosi)')
  })
  it('adds nothing when the bill has no sponsor', () => {
    const bare = { ...latest, bill: { ...latest.bill, sponsor: null } }
    expect(renderHomeBody({ votes: { latest: bare, recent: [bare] }, updatedAt: null })).not.toContain('home-vote-sponsor')
    expect(homeMarkdown({ votes: { latest: bare, recent: [bare] } })).not.toContain('Sponsor:')
  })
})
