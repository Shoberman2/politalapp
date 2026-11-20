import { describe, it, expect, vi } from 'vitest'

vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: vi.fn() } }))

import { renderPage, injectIntoShell, memberMeta, rollCallMeta, billMeta } from '../../api/_lib/renderPage.js'
import { renderMarkdown } from '../../api/_lib/markdown.js'
import { member, rollCall, bill, shell } from '../fixtures/pages.js'

describe('renderPage', () => {
  it('injects the member record into the shell with meta, JSON-LD, and a real body', () => {
    const html = renderPage(shell, member)
    expect(html).toContain('<title>Nancy Pelosi Voting Record (D-CA-11)</title>')
    expect(html).toContain('<link rel="canonical" href="https://www.ballotwatch.io/politician/P000197-nancy-pelosi" />')
    expect(html).toContain('<meta name="robots" content="index, follow" />')
    expect(html).toContain('"@type":"Person"')
    expect(html).toContain('"@type":"BreadcrumbList"')
    expect(html).not.toContain('"WebApplication"')
    expect(html).toContain('<div id="root"><div class="app">')
    expect(html).toContain('href="/vote/119/house/2/295"')
    expect(html).toContain('href="/bill/119/hr/4795"')
    expect(html).toContain('<script type="module" src="/assets/index-abc123.js"></script>')
  })

  it('adds sponsored and cosponsored bill sections after the existing ones, and omits them when the read failed', () => {
    const html = renderPage(shell, member)
    expect(html).toContain('Bills They Sponsored')
    expect(html).toContain('31 bills sponsored · most recent 1 shown')
    expect(html).toContain('href="/bill/119/hr/1234">H.R. 1234 · Housing &lt;Affordability&gt; Act</a>')
    expect(html).toContain('href="https://www.congress.gov/bill/119th-congress/house-bill/1234" rel="noopener">Congress.gov</a>')
    expect(html).toContain('140 bills cosponsored')
    expect(html.indexOf('How They Voted')).toBeLessThan(html.indexOf('Bills They Sponsored'))
    expect(html.indexOf('Bills They Sponsored')).toBeLessThan(html.indexOf('Bills They Cosponsored'))
    expect(html.indexOf('Bills They Cosponsored')).toBeLessThan(html.indexOf('rc-colophon'))
    const without = renderPage(shell, { ...member, bills: null })
    expect(without).not.toContain('Bills They')
    expect(without).toContain('How They Voted')
    expect(renderPage(shell, { ...member, bills: { sponsored: { total: 0, items: [] }, cosponsored: { total: 0, items: [] } } })).not.toContain('Bills They')
  })

  it('emits valid Person JSON-LD with the new fields and a /members breadcrumb', () => {
    const html = renderPage(shell, member)
    const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))
    const person = blocks.find((b) => b['@type'] === 'Person')
    expect(person.url).toBe('https://www.ballotwatch.io/politician/P000197-nancy-pelosi')
    expect(person.description).toBe(memberMeta(member).description)
    expect(person.givenName).toBe('Nancy')
    expect(person.familyName).toBe('Pelosi')
    expect(person.workLocation).toMatchObject({ '@type': 'Place', name: 'California district 11', address: { addressRegion: 'CA' } })
    expect(person.memberOf).toEqual({ '@type': 'OrganizationRole', memberOf: { '@type': 'Organization', name: 'United States House of Representatives' }, startDate: '2025-01-03' })
    expect(person.sameAs).toEqual([member.source_url, member.congress_gov_url])
    const crumbs = blocks.find((b) => b['@type'] === 'BreadcrumbList').itemListElement
    expect(crumbs[1].item).toBe('https://www.ballotwatch.io/members')
    expect(crumbs[2].item).toBe(person.url)

    // A three-word name is ambiguous: no guessed given/family names. No term: plain memberOf.
    const odd = renderPage(shell, { ...member, name: 'Mary Gay Scanlon', terms: [] })
    const p2 = JSON.parse(odd.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1])
    expect(p2.givenName).toBeUndefined()
    expect(p2.memberOf).toEqual({ '@type': 'Organization', name: 'United States House of Representatives' })
    // < is escaped so a name cannot close the script tag.
    expect(renderPage(shell, { ...member, name: 'A </script><b> B' })).not.toContain('</script><b>')
  })

  it('points og:image and twitter:image at the per-member card', () => {
    const html = renderPage(shell.replace('</head>', '<meta property="og:image" content="https://www.ballotwatch.io/congress.jpg" />\n<meta name="twitter:image" content="https://www.ballotwatch.io/congress.jpg" />\n</head>'), member)
    expect(html).toContain('<meta property="og:image" content="https://www.ballotwatch.io/api/og?kind=record&amp;id=P000197" />')
    expect(html).toContain('<meta name="twitter:image" content="https://www.ballotwatch.io/api/og?kind=record&amp;id=P000197" />')
  })

  it('marks a non-indexable page noindex and escapes content', () => {
    const html = renderPage(shell, { ...rollCall, indexable: false, noindexReason: 'tally_mismatch', question: 'On <Passage> & "more"' })
    expect(html).toContain('<meta name="robots" content="noindex, follow" />')
    expect(html).toContain('On &lt;Passage&gt; &amp; &quot;more&quot;')
    expect(html).not.toContain('On <Passage>')
  })

  it('renders roll-call and bill pages with tallies and links', () => {
    const rc = renderPage(shell, rollCall)
    expect(rc).toContain('380 Yea')
    expect(rc).toContain('rc-result-passed')
    expect(rc).toContain('href="/politician/A000055-robert-aderholt"')
    expect(rc).toContain('"@type":"Event"')
    expect(rollCallMeta(rollCall).canonical).toBe('https://www.ballotwatch.io/vote/119/house/2/295')

    const b = renderPage(shell, bill)
    expect(b).toContain('H.R. 1')
    expect(b).toContain('"@type":"Legislation"')
    expect(b).toContain('href="/vote/119/house/1/190"')
    expect(billMeta(bill).title).toContain('H.R. 1:')
  })

  it('keeps descriptions within 200 characters', () => {
    expect(memberMeta(member).description.length).toBeLessThanOrEqual(200)
    expect(rollCallMeta(rollCall).description.length).toBeLessThanOrEqual(200)
    expect(billMeta(bill).description.length).toBeLessThanOrEqual(200)
  })

  it('inserts record text containing replacement patterns literally', () => {
    const tricky = { ...bill, title: "Costs $' and $& and $$ and $1 million", summary: "Appropriates $' for $& projects." }
    const html = renderPage(shell, tricky)
    expect(html).toContain("Costs $&#39; and $&amp; and $$ and $1 million")
    expect(html.match(/<div id="root">/g)).toHaveLength(1)
    expect(html.match(/<\/head>/g)).toHaveLength(1)
    expect(html.match(/<script type="module"/g)).toHaveLength(1)
  })

  it('mirrors the real masthead and embeds roll-call data for the React page', () => {
    const html = renderPage(shell, rollCall)
    expect(html).toContain('<div class="bw bw-masthead"><div class="topbar-wrap"><div class="topbar"><a class="brand"')
    expect(html).toContain('<nav class="topnav">')
    expect(html).toContain('<script type="application/json" id="__bw_page">')
    expect(html).toContain('class="rc-filter"')
    expect(renderPage(shell, member)).not.toContain('id="__bw_page"')
  })

  it('drops non-http hrefs and shows initials when a member has no photo', () => {
    const html = renderPage(shell, { ...member, photo_url: 'javascript:alert(1)', votes: [{ ...member.votes[0], source_url: 'javascript:alert(1)' }] })
    expect(html).not.toContain('javascript:')
    expect(html).toContain('<div class="pol-photo-placeholder"><span>NP</span></div>')
  })

  it('leaves the shell untouched apart from head and root', () => {
    const html = injectIntoShell(shell, { title: 't', description: 'd', canonical: 'https://x/y', jsonLd: [], body: '<p>hi</p>' })
    expect(html).toContain('<div id="root"><p>hi</p></div>')
    expect(html).toContain('<meta charset="UTF-8" />')
  })
})

describe('renderMarkdown', () => {
  it('produces compact Markdown with canonical and source links', () => {
    const md = renderMarkdown(member)
    expect(md.startsWith('# Nancy Pelosi')).toBe(true)
    expect(md).toContain('- Canonical: https://www.ballotwatch.io/politician/P000197-nancy-pelosi')
    expect(md).toContain('## Bills sponsored (31, most recent 1 shown)')
    expect(md).toContain('| 2026-09-03 | [house-119-2-295](https://www.ballotwatch.io/vote/119/house/2/295) | On Passage |')
    expect(md.length).toBeLessThan(renderPage(shell, member).length / 4)

    const rc = renderMarkdown(rollCall)
    expect(rc).toContain('- Tally: 380 yea, 40 nay, 15 not voting')
    expect(rc).toContain('- Result (derived from tally and question): Passed')
    expect(rc).toContain('| [Nancy Pelosi](https://www.ballotwatch.io/politician/P000197-nancy-pelosi) | Democratic CA-11 | Nay |')

    const b = renderMarkdown(bill)
    expect(b).toContain('# H.R. 1: An act to provide for reconciliation')
    expect(b).toContain('| 2025-07-03 | House | On Passage | 218-214 | Passed | https://www.ballotwatch.io/vote/119/house/1/190 |')
  })
})
