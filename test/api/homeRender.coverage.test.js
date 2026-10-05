// Edge cases for the server-rendered homepage and static info pages that the
// end-to-end prerender test (homePrerender.test.js) does not reach: the data
// loader's empty and failure paths, escaping and fallbacks in the HTML and
// Markdown renderers, the static-page resolver, the shell head rewrite, the
// middleware, and the sitemap pages part.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '../fixtures/supabaseChain.js'
import { shell } from '../fixtures/pages.js'

const db = makeSupabaseMock()
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: (t) => db.from(t) } }))

import { getHomeVotes } from '../../api/_lib/pages.js'
import { renderHomeBody, homeMarkdown, renderStaticPage, staticMarkdown } from '../../api/_lib/renderHome.js'
import { injectIntoShell } from '../../api/_lib/renderPage.js'
import { buildUrlset } from '../../api/_lib/sitemapXml.js'
import { STATIC_PAGES } from '../../api/_lib/staticPages.js'

beforeEach(() => db.reset())

const vote = (over = {}) => ({
  id: 'house-119-2-295', chamber: 'House', congress: 119, session: 2, roll: 295,
  question: 'On Passage', description: null, voted_at: '2026-09-03',
  bill: { id: '119-hr-1', label: 'H.R. 1', path: '/bill/119/hr/1', title: 'Lower Costs Act' },
  tally: { yea: 215, nay: 205 }, result: 'Passed', ...over,
})

describe('getHomeVotes edge cases', () => {
  it('returns an empty record and skips the follow-up reads when no roll call has a valid id', async () => {
    db.responses.roll_calls = { data: [{ id: 'garbage', bill_id: null, question: 'x', voted_at: '2026-09-01' }] }
    expect(await getHomeVotes()).toEqual({ latest: null, recent: [] })
    expect(db.tables()).toEqual(['roll_calls'])
  })

  it('does not query bills when no roll call names one, and leaves latest null when every tally is corrupt', async () => {
    db.responses.roll_calls = { data: [
      { id: 'senate-119-2-1', bill_id: null, question: 'On the Nomination', description: null, voted_at: '2026-09-02' },
    ] }
    db.responses.roll_call_stats = { data: [{ roll_call_id: 'senate-119-2-1', dem_yea: 300, dem_nay: 0, rep_yea: 0, rep_nay: 0, ind_yea: 0, ind_nay: 0 }] }
    const out = await getHomeVotes()
    expect(db.tables()).not.toContain('bills')
    expect(out.latest).toBeNull()
    expect(out.recent).toHaveLength(1)
    expect(out.recent[0].tally).toBeNull()
    expect(out.recent[0].result).toBeNull()
  })

  it('caps the recent list at five', async () => {
    db.responses.roll_calls = { data: Array.from({ length: 8 }, (_, i) => ({ id: `house-119-2-${300 - i}`, bill_id: null, question: 'On Passage', voted_at: '2026-09-03' })) }
    db.responses.roll_call_stats = { data: [] }
    const out = await getHomeVotes()
    expect(out.recent.map((r) => r.roll)).toEqual([300, 299, 298, 297, 296])
  })

  it('throws when the stats or bills read fails, so the homepage drops the section', async () => {
    db.responses.roll_calls = { data: [{ id: 'house-119-2-295', bill_id: '119-hr-1', question: 'On Passage', voted_at: '2026-09-03' }] }
    db.responses.roll_call_stats = { data: null, error: { message: 'stats down' } }
    db.responses.bills = { data: [] }
    await expect(getHomeVotes()).rejects.toThrow(/roll_call_stats: stats down/)

    db.responses.roll_call_stats = { data: [] }
    db.responses.bills = { data: null, error: { message: 'bills down' } }
    await expect(getHomeVotes()).rejects.toThrow(/bills: bills down/)
  })
})

describe('renderHomeBody fallbacks and escaping', () => {
  it('escapes record text and falls back for a missing heading, bill path, tally and update time', () => {
    const latest = vote({
      question: '<script>alert(1)</script>',
      bill: { id: 'x', label: 'Odd & Bill', path: null, title: null },
    })
    const bare = vote({ id: 'senate-119-2-9', chamber: 'Senate', roll: 9, question: null, description: null, bill: null, tally: null, result: null, voted_at: null })
    const html = renderHomeBody({ votes: { latest, recent: [latest, bare] }, updatedAt: null })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain(' on Odd &amp; Bill</p>')      // no link without a path
    expect(html).toContain('Senate roll call 9: Recorded vote</a></li>')   // no date, no tally separator
    expect(html).not.toContain('Recorded through')
    expect(html).not.toContain('home-vote-standfirst')
  })

  it('uses the description as the standfirst only when it differs from the question', () => {
    const differs = renderHomeBody({ votes: { latest: vote({ bill: null, description: 'Confirming Jane Doe' }), recent: [] } })
    expect(differs).toContain('<p class="home-vote-standfirst">Confirming Jane Doe</p>')
    const same = renderHomeBody({ votes: { latest: vote({ bill: null, question: 'Same', description: 'Same' }), recent: [] } })
    expect(same).not.toContain('home-vote-standfirst')
  })

  it('points the Tell your rep feature at /how-it-works when there is no latest vote', () => {
    const html = renderHomeBody({ votes: null, updatedAt: null })
    expect(html).not.toContain('#tell-your-rep')
    expect(html).toMatch(/Then write to the person who cast it\.<\/h3><p>[^<]*<\/p><a href="\/how-it-works">/)
    expect(html).not.toContain('home-recent')
  })
})

describe('homeMarkdown fallbacks', () => {
  it('escapes pipes in table cells, renders unlinked bills, and omits sections without data', () => {
    const v = vote({ question: 'A | B', bill: { id: 'x', label: 'Odd', path: null, title: null }, tally: null, result: null })
    const md = homeMarkdown({ votes: { latest: v, recent: [v] }, updatedAt: null })
    expect(md).toContain('| A \\| B | Odd |  |  |')
    expect(md).toContain('- Bill: Odd\n')
    expect(md).not.toContain('- Tally:')
    expect(md).not.toContain('- Data updated:')

    const empty = homeMarkdown({ votes: null, updatedAt: null })
    expect(empty).not.toContain('## Latest recorded vote')
    expect(empty).not.toContain('## Recent roll calls')
    expect(empty).toContain('(https://www.ballotwatch.io/how-it-works)')
    expect(empty.endsWith('\n')).toBe(true)
  })
})

describe('static info pages', () => {
  it('renders every page with an escaped H1, WebPage JSON-LD tagged with its path, and Markdown', () => {
    for (const [path, page] of Object.entries(STATIC_PAGES)) {
      const html = renderStaticPage(shell, { path, page })
      expect(html).toContain(`data-bw-ssr="${path}"`)
      expect(html).toContain(`<link rel="canonical" href="https://www.ballotwatch.io${path}" />`)
      expect(html.match(/<h1>/g)).toHaveLength(1)
      expect(staticMarkdown({ path, page })).toContain(`- Canonical: https://www.ballotwatch.io${path}`)
    }
    const hostile = renderStaticPage(shell, { path: '/about', page: { title: 'T', description: 'D', h1: '<b>x</b>', lede: 'a & b' } })
    expect(hostile).toContain('<h1>&lt;b&gt;x&lt;/b&gt;</h1>')
    expect(hostile).toContain('a &amp; b')
  })
})

describe('resolveTarget static pages', () => {
  it('normalizes case and rejects prototype keys and a missing page', async () => {
    const { resolveTarget } = await import('../../api/prerender.js')
    expect(resolveTarget({ kind: 'static', page: 'ABOUT' })).toEqual({ kind: 'static', id: '/about', path: '/about' })
    expect(resolveTarget({ kind: 'static', page: '__proto__' })).toBeNull()
    expect(resolveTarget({ kind: 'static', page: 'hasOwnProperty' })).toBeNull()
    expect(resolveTarget({ kind: 'static' })).toBeNull()
  })
})

describe('injectIntoShell head rewrite', () => {
  it('drops the shell default og:image size/alt before writing its own, and tags JSON-LD with the canonical path', () => {
    const withDefaults = shell.replace('</head>', '<meta property="og:image" content="https://www.ballotwatch.io/congress.jpg" />\n<meta property="og:image:width" content="1" />\n<meta property="og:image:height" content="2" />\n<meta property="og:image:alt" content="old" />\n</head>')
    const html = injectIntoShell(withDefaults, { title: 'T', description: 'D', canonical: 'https://www.ballotwatch.io/x/y', ogImage: 'https://www.ballotwatch.io/i.png', jsonLd: [{ a: 1 }], body: '' })
    expect(html).not.toContain('content="old"')
    expect(html).not.toContain('og:image:width" content="1"')
    expect(html.match(/og:image:width/g)).toHaveLength(1)
    expect(html).toContain('data-bw-ssr="/x/y"')

    const bad = injectIntoShell(shell, { title: 'T', description: 'D', canonical: 'not a url', jsonLd: [{ a: 1 }], body: '' })
    expect(bad).toContain('data-bw-ssr="/"')
  })
})

describe('middleware', () => {
  it('ignores the query string on `/` so it cannot choose another prerender kind', async () => {
    const { default: middleware } = await import('../../middleware.js')
    const res = middleware(new Request('https://www.ballotwatch.io/?kind=member&id=P000197'))
    expect(res.headers.get('x-middleware-rewrite')).toBe('https://www.ballotwatch.io/api/prerender?kind=home')
    expect(middleware(new Request('https://www.ballotwatch.io/about'))).toBeUndefined()
  })
})

describe('sitemap pages part', () => {
  it('gives /this-week the latest vote date, other info pages none, and omits lastmod when there are no votes', async () => {
    const { pageEntries, _resetSitemapMemo } = await import('../../api/sitemap.js')
    _resetSitemapMemo?.()
    db.responses.roll_calls = { data: [{ voted_at: '2026-09-03T14:00:00Z' }] }
    const entries = await pageEntries()
    expect(entries.find((e) => e.path === '/this-week').lastmod).toBe('2026-09-03')
    expect(entries.find((e) => e.path === '/about').lastmod).toBeNull()
    expect(entries).toHaveLength(1 + Object.keys(STATIC_PAGES).length)

    _resetSitemapMemo?.()
    db.reset()
    db.responses.roll_calls = { data: [] }
    const none = await pageEntries()
    const xml = buildUrlset('https://www.ballotwatch.io', none)
    expect(xml).not.toContain('<lastmod>')
    expect(xml).toContain('<loc>https://www.ballotwatch.io/terms</loc><changefreq>yearly</changefreq><priority>0.3</priority>')

    // Priority: one decimal, 0 kept, omitted when absent.
    const pri = buildUrlset('https://x.test', [{ path: '/a', priority: 0 }, { path: '/b', priority: 1 }, { path: '/c' }])
    expect(pri).toContain('<loc>https://x.test/a</loc><priority>0.0</priority>')
    expect(pri).toContain('<loc>https://x.test/b</loc><priority>1.0</priority>')
    expect(pri).toContain('<loc>https://x.test/c</loc></url>')
  })
})

import middleware, { prefersMarkdown, HOME_MARKDOWN_PATH, HOME_PRERENDER_PATH } from '../../middleware.js'

// Ship review (2026-10-04): Markdown must never share a cache key with the
// HTML homepage, so middleware rewrites it to its own URL.
describe('middleware Markdown routing', () => {
  const rewriteOf = (accept) => middleware(new Request('https://www.ballotwatch.io/', { headers: accept ? { accept } : {} })).headers.get('x-middleware-rewrite')

  it('sends browsers to the HTML prerender and agents asking for Markdown to their own URL', () => {
    expect(rewriteOf('text/html,application/xhtml+xml')).toBe(`https://www.ballotwatch.io${HOME_PRERENDER_PATH}`)
    expect(rewriteOf('text/markdown')).toBe(`https://www.ballotwatch.io${HOME_MARKDOWN_PATH}`)
    expect(rewriteOf(undefined)).toBe(`https://www.ballotwatch.io${HOME_PRERENDER_PATH}`)
  })

  it('treats text/html-first Accept headers as HTML', () => {
    expect(prefersMarkdown('text/html, text/markdown;q=0.5')).toBe(false)
    expect(prefersMarkdown('text/markdown, text/html;q=0.1')).toBe(true)
  })
})
