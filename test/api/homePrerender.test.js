import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { makeSupabaseMock } from '../fixtures/supabaseChain.js'
import { shell } from '../fixtures/pages.js'
import { LANDING_FAQ } from '../../src/data/landingFaq.js'
import { BRAND } from '../../src/config/brand.js'
import { HOME_TITLE, HOME_DESCRIPTION, homeJsonLdGraph } from '../../src/data/homeSeo.js'

const db = makeSupabaseMock()
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: (t) => db.from(t) } }))

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
const req = (query, accept = 'text/html') => ({ headers: { host: 'www.ballotwatch.io', 'x-forwarded-proto': 'https', accept }, query })

function seedVotes() {
  db.responses.roll_calls = { data: [
    // Corrupt tally (double-counted): listed, but never the headline.
    { id: 'senate-119-2-510', bill_id: null, question: 'On the Cloture Motion', description: 'A nomination', voted_at: '2026-09-04' },
    { id: 'house-119-2-295', bill_id: '119-hr-1', question: 'On Passage', description: null, voted_at: '2026-09-03' },
    { id: 'house-119-2-294', bill_id: '119-hr-2', question: 'On Motion to Recommit', description: null, voted_at: '2026-09-03' },
  ] }
  db.responses.roll_call_stats = { data: [
    { roll_call_id: 'senate-119-2-510', dem_yea: 90, dem_nay: 0, rep_yea: 90, rep_nay: 0, ind_yea: 0, ind_nay: 0 },
    { roll_call_id: 'house-119-2-295', dem_yea: 10, dem_nay: 200, rep_yea: 205, rep_nay: 5, ind_yea: 0, ind_nay: 0 },
  ] }
  db.responses.bills = { data: [{ id: '119-hr-1', title: 'Lower Costs Act' }, { id: '119-hr-2', title: 'HR 2' }] }
  db.responses.etl_metadata = { data: { value: '2026-09-05T10:25:32.028Z' } }
}

function ldBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))
}

function rootText(html) {
  const root = html.slice(html.indexOf('<div id="root">'))
  return root.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ')
}

describe('prerender kind=home', () => {
  let handler, resolveTarget

  beforeEach(async () => {
    vi.resetModules()
    db.reset()
    process.env.PRERENDER_SHELL_FROM_ORIGIN = '1'
    global.fetch = vi.fn(async () => ({ ok: true, text: async () => shell }))
    const mod = await import('../../api/prerender.js')
    handler = mod.default
    resolveTarget = mod.resolveTarget
  })
  afterEach(() => { delete process.env.PRERENDER_SHELL_FROM_ORIGIN; delete process.env.PRERENDER_TIMEOUT_MS })

  it('resolves home and known static pages only', () => {
    expect(resolveTarget({ kind: 'home' })).toEqual({ kind: 'home', id: 'home', path: '/' })
    expect(resolveTarget({ kind: 'static', page: 'about' })).toEqual({ kind: 'static', id: '/about', path: '/about' })
    expect(resolveTarget({ kind: 'static', page: 'constructor' })).toBeNull()
    expect(resolveTarget({ kind: 'static', page: '../etc' })).toBeNull()
  })

  it('renders the H1, mission, real latest vote, recent roll calls, features and FAQ inside #root', async () => {
    seedVotes()
    const res = makeRes()
    await handler(req({ kind: 'home' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.getHeader('cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=86400')
    expect(res.getHeader('x-ballotwatch-prerender')).toBe('index')
    const html = res.body
    const text = rootText(html)

    expect(html).toMatch(/<div id="root">[\s\S]*<h1 class="hero-title">How did your representative vote <em>this week\?<\/em><\/h1>/)
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(text).toContain(BRAND.mission)
    expect(text).toContain('free, open-source, nonpartisan record of the U.S. Congress')
    // Headline is the newest roll call with a sane tally, not the corrupt one.
    expect(html).toMatch(/home-latest[\s\S]*href="\/vote\/119\/house\/2\/295">On Passage<\/a> on <a href="\/bill\/119\/hr\/1">H\.R\. 1<\/a>/)
    expect(text).toContain('215 yea, 205 nay · Passed')
    expect(text).toContain('Lower Costs Act')
    // Recent list: all three, the corrupt one without a tally, placeholder title dropped.
    expect(html).toContain('href="/vote/119/senate/2/510"')
    expect(html).toContain('href="/vote/119/house/2/294"')
    expect(text).not.toContain('180 yea')
    expect(text).not.toMatch(/HR 2\b/)
    // Features and links.
    for (const href of ['/my-representative', '/this-week', '/bills', '/all', '/vote/119/house/2/295#tell-your-rep', '/alerts', '/how-it-works', '/methodology', '/about', '/offices']) {
      expect(html).toContain(`href="${href}"`)
    }
    for (const { q, a } of LANDING_FAQ) {
      expect(text).toContain(q)
      expect(text).toContain(a.replace(/’/g, '’'))
    }
  })

  it('sets the homepage head: title, description, canonical, Open Graph and Twitter', async () => {
    seedVotes()
    // The real index.html states a default image; the fixture shell does not.
    const withImage = shell.replace('<meta name="robots"', '<meta property="og:image" content="https://www.ballotwatch.io/congress.jpg" />\n    <meta name="twitter:image" content="https://www.ballotwatch.io/congress.jpg" />\n    <meta name="robots"')
    global.fetch = vi.fn(async () => ({ ok: true, text: async () => withImage }))
    const res = makeRes()
    await handler(req({ kind: 'home' }), res)
    const html = res.body
    expect(HOME_TITLE.length).toBeLessThanOrEqual(60)
    expect(HOME_DESCRIPTION.length).toBeLessThanOrEqual(155)
    expect(HOME_TITLE.toLowerCase()).toContain('how did my rep')
    expect(HOME_DESCRIPTION.toLowerCase()).toContain('congressional voting record')
    expect(html).toContain(`<title>${HOME_TITLE}</title>`)
    expect(html.match(/<title>/g)).toHaveLength(1)
    expect(html).toContain(`<meta name="description" content="${HOME_DESCRIPTION}" />`)
    expect(html.match(/<meta name="description"/g)).toHaveLength(1)
    expect(html).toContain('<link rel="canonical" href="https://www.ballotwatch.io/" />')
    expect(html).toContain('<meta property="og:type" content="website" />')
    expect(html).toContain('<meta property="og:image" content="https://www.ballotwatch.io/congress.jpg" />')
    expect(html.match(/og:image:width/g)).toHaveLength(1)
    expect(html).toContain('<meta property="og:image:height" content="630" />')
    expect(html).toContain('<meta name="twitter:image" content="https://www.ballotwatch.io/congress.jpg" />')
    expect(html).toContain('<meta name="robots" content="index, follow" />')
  })

  it('embeds Organization, WebSite, FAQPage and Dataset JSON-LD exactly once each, all parseable', async () => {
    seedVotes()
    const res = makeRes()
    await handler(req({ kind: 'home' }), res)
    const blocks = ldBlocks(res.body)
    const types = blocks.map((b) => b['@type']).sort()
    expect(types).toEqual(['Dataset', 'FAQPage', 'Organization', 'WebSite'])
    expect(res.body).not.toContain('WebApplication')
    expect(res.body).toContain('data-bw-ssr="/"')
    const byType = Object.fromEntries(blocks.map((b) => [b['@type'], b]))
    for (const b of blocks) expect(b['@context']).toBe('https://schema.org')
    expect(byType.Organization.sameAs).toContain('https://github.com/Shoberman2/politalapp')
    expect(byType.Organization.logo).toMatch(/^https:\/\/www\.ballotwatch\.io\//)
    expect(byType.WebSite.potentialAction).toBeUndefined()   // /bills ignores ?search=
    expect(byType.FAQPage.mainEntity).toHaveLength(LANDING_FAQ.length)
    expect(byType.FAQPage.mainEntity[0]).toEqual({ '@type': 'Question', name: LANDING_FAQ[0].q, acceptedAnswer: { '@type': 'Answer', text: LANDING_FAQ[0].a } })
    expect(byType.Dataset.isAccessibleForFree).toBe(true)
    expect(byType.Dataset.dateModified).toBe('2026-09-05T10:25:32.028Z')
    expect(byType.Dataset.temporalCoverage).toBe('2025-01-03/..')
    expect(byType.Dataset.distribution.map((d) => d.contentUrl)).toEqual(['https://www.ballotwatch.io/api/v1', 'https://www.ballotwatch.io/openapi.yaml'])
  })

  it('serves compact Markdown for Accept: text/markdown', async () => {
    seedVotes()
    const res = makeRes()
    await handler(req({ kind: 'home' }, 'text/markdown'), res)
    expect(res.statusCode).toBe(200)
    expect(res.getHeader('content-type')).toContain('text/markdown')
    expect(res.getHeader('link')).toBe('<https://www.ballotwatch.io/>; rel="canonical"')
    expect(res.body.startsWith('# BallotWatch: how did your representative vote this week?')).toBe(true)
    expect(res.body).toContain('- Tally: 215 yea, 205 nay')
    expect(res.body).toContain('https://www.ballotwatch.io/vote/119/house/2/295')
    expect(res.body).toContain(`### ${LANDING_FAQ[0].q}`)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('drops the votes section and shortens the cache when the vote read fails', async () => {
    seedVotes()
    db.responses.roll_calls = { data: null, error: { message: 'boom' } }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = makeRes()
    await handler(req({ kind: 'home' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.getHeader('cache-control')).toBe('public, s-maxage=60, stale-while-revalidate=600')
    expect(res.getHeader('x-ballotwatch-prerender')).toBe('index:no-votes')
    expect(res.body).not.toContain('home-latest')
    expect(res.body).not.toContain('Recent roll calls')
    expect(res.body).toContain('How did your representative vote')
    expect(rootText(res.body)).toContain(LANDING_FAQ[0].q)
  })

  it('falls back to the plain shell, uncached, when the data load times out', async () => {
    vi.resetModules()
    process.env.PRERENDER_TIMEOUT_MS = '30'
    const mod = await import('../../api/prerender.js')
    db.responses.roll_calls = new Promise(() => {})
    db.responses.etl_metadata = new Promise(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = makeRes()
    await mod.default(req({ kind: 'home' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.getHeader('cache-control')).toBe('no-store')
    expect(res.getHeader('x-ballotwatch-prerender')).toBe('fallback')
    expect(res.body).toContain('<div id="root"></div>')
  })

  it('renders static info pages with their own head, H1 and lede', async () => {
    const res = makeRes()
    await handler(req({ kind: 'static', page: 'how-it-works' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.getHeader('cache-control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400')
    expect(res.body).toContain('<title>How It Works | BallotWatch</title>')
    expect(res.body).toContain('<link rel="canonical" href="https://www.ballotwatch.io/how-it-works" />')
    expect(res.body).toMatch(/<div id="root">[\s\S]*<h1>The public record, made easy to read and easy to act on\.<\/h1>/)
    expect(ldBlocks(res.body).map((b) => b['@type'])).toEqual(['WebPage'])

    const md = makeRes()
    await handler(req({ kind: 'static', page: 'about' }, 'text/markdown'), md)
    expect(md.body).toContain(BRAND.mission)

    const missing = makeRes()
    await handler(req({ kind: 'static', page: 'nope' }), missing)
    expect(missing.statusCode).toBe(404)
  })
})

describe('homepage routing', () => {
  const vercel = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'))
  const rewrites = vercel.rewrites
  const catchAll = rewrites.findIndex((r) => r.destination === '/index.html')

  it('rewrites exactly `/` to kind=home before the SPA catch-all', () => {
    const i = rewrites.findIndex((r) => r.source === '/')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(rewrites[i].destination).toBe('/api/prerender?kind=home')
    expect(i).toBeLessThan(catchAll)
  })

  it('rewrites each static info page before the catch-all, and nothing else', async () => {
    const i = rewrites.findIndex((r) => r.destination === '/api/prerender?kind=static&page=:page')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(i).toBeLessThan(catchAll)
    const { STATIC_PATHS } = await import('../../api/_lib/staticPages.js')
    const m = /^\/:page\(([^)]+)\)$/.exec(rewrites[i].source)
    expect(m[1].split('|').map((p) => `/${p}`).sort()).toEqual([...STATIC_PATHS].sort())
  })

  it('middleware rewrites `/` (and only `/`) to the prerender function', async () => {
    const { default: middleware, config } = await import('../../middleware.js')
    expect(config.matcher).toBe('/')
    const res = middleware(new Request('https://www.ballotwatch.io/'))
    expect(res.headers.get('x-middleware-rewrite')).toBe('https://www.ballotwatch.io/api/prerender?kind=home')
    expect(middleware(new Request('https://www.ballotwatch.io/assets/index.js'))).toBeUndefined()
  })

  it('index.html defaults match the homepage title and description', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
    expect(html).toContain(`<title>${HOME_TITLE}</title>`)
    expect(html).toContain(`<meta name="description" content="${HOME_DESCRIPTION}" />`)
    expect(html.match(/<h1[\s>]/g)).toBeNull()
  })

  it('client graph carries the same four blocks without per-block @context', () => {
    const g = homeJsonLdGraph({ dateModified: null })
    expect(g['@graph'].map((b) => b['@type'])).toEqual(['Organization', 'WebSite', 'FAQPage', 'Dataset'])
    expect(g['@graph'].every((b) => !('@context' in b))).toBe(true)
    expect(g['@graph'][3].dateModified).toBeUndefined()
  })
})

describe('sitemap pages part', () => {
  beforeEach(() => db.reset())

  it('lists the homepage and every static info page, and the index points at it', async () => {
    const { buildPart, _resetSitemapMemo } = await import('../../api/sitemap.js')
    _resetSitemapMemo()
    db.responses.roll_calls = { data: [{ voted_at: '2026-09-03T14:00:00Z' }] }
    const xml = await buildPart('pages')
    expect(xml).toContain('<url><loc>https://www.ballotwatch.io/</loc><lastmod>2026-09-03</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>')
    for (const p of ['/how-it-works', '/methodology', '/data-sources', '/about', '/this-week', '/offices', '/contact', '/privacy', '/terms']) {
      expect(xml).toContain(`<loc>https://www.ballotwatch.io${p}</loc>`)
    }
    db.responses.bills = { data: [] }
    expect(await buildPart(null)).toContain('<loc>https://www.ballotwatch.io/sitemap-pages.xml</loc>')
  })
})

describe('robots.txt and llms.txt', () => {
  it('allows the major AI crawlers and never blocks /api/v1 or /mcp', () => {
    const robots = readFileSync(resolve(process.cwd(), 'public/robots.txt'), 'utf8')
    for (const bot of ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'CCBot']) {
      expect(robots).toMatch(new RegExp(`User-agent: ${bot}\\nAllow: /\\n`))
    }
    expect(robots).not.toMatch(/Disallow: \/(api\/v1|mcp|api\/mcp)\b/)
    expect(robots).toContain('Sitemap: https://www.ballotwatch.io/sitemap.xml')
  })

  it('llms.txt opens with what BallotWatch is, the URLs to cite, and how to cite', () => {
    const llms = readFileSync(resolve(process.cwd(), 'public/llms.txt'), 'utf8')
    const head = llms.slice(0, 2500)
    expect(head).toContain('how did my representative vote')
    expect(head).toContain('## Cite these URLs')
    expect(head).toContain('## How to cite')
    for (const u of ['https://www.ballotwatch.io/', '/politician/{bioguide_id}/record', '/vote/{congress}/{house|senate}/{session}/{roll}', '/this-week', '/how-it-works', '/data-sources']) {
      expect(llms).toContain(u)
    }
  })
})
