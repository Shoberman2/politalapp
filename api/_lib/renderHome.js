// Server-rendered homepage (`/`) and static info pages (`/about`,
// `/how-it-works`, ...). Same approach as the record pages in renderPage.js:
// inject into the real SPA shell inside #root, so crawlers and agents that do
// not run JavaScript read the page and React replaces it on mount. Every vote
// shown here comes from getHomeVotes(); nothing is invented, and the section
// is left out when that read failed.

import { chrome, escapeHtml, injectIntoShell, fmtDate, clampText, ordinal } from './renderPage.js'
import { rollCallPath } from './rollCallResult.js'
import { SITE_ORIGIN as SITE } from './site.js'
import { staticPageTitle } from './staticPages.js'
import { BRAND } from '../../src/config/brand.js'
import { LANDING_FAQ } from '../../src/data/landingFaq.js'
import {
  HOME_TITLE, HOME_DESCRIPTION, HOME_ABOUT, HOME_FEATURES, HOME_LINKS, DEFAULT_OG_IMAGE, homeJsonLd,
} from '../../src/data/homeSeo.js'

// ---------- shared vote phrasing ----------

function voteSummary(v) {
  const parts = []
  if (v.tally) parts.push(`${v.tally.yea} yea, ${v.tally.nay} nay`)
  if (v.result) parts.push(v.result)
  return parts.join(' · ')
}

function voteHeading(v) {
  return v.question || v.description || 'Recorded vote'
}

// ---------- homepage ----------

export function homeMeta() {
  return { title: HOME_TITLE, description: HOME_DESCRIPTION, canonical: `${SITE}/` }
}

function latestVoteHtml(v) {
  const path = rollCallPath(v.id)
  const bill = v.bill
    ? ` on ${v.bill.path ? `<a href="${escapeHtml(v.bill.path)}">${escapeHtml(v.bill.label)}</a>` : escapeHtml(v.bill.label)}`
    : ''
  const standfirst = v.bill?.title || (v.description && v.description !== v.question ? v.description : '')
  return `<section class="home-latest" aria-labelledby="home-latest-h">
      <h2 id="home-latest-h">The latest recorded vote</h2>
      <p class="home-vote-meta">${escapeHtml(v.chamber)} roll call ${v.roll} · ${escapeHtml(ordinal(v.congress))} Congress${v.voted_at ? ` · ${escapeHtml(fmtDate(v.voted_at))}` : ''}</p>
      <p class="home-vote-question"><a href="${path}">${escapeHtml(voteHeading(v))}</a>${bill}</p>
      ${standfirst ? `<p class="home-vote-standfirst">${escapeHtml(clampText(standfirst, 220))}</p>` : ''}
      <p class="home-vote-tally">${escapeHtml(voteSummary(v))}</p>
      <p><a href="${path}">How each member voted</a> · <a href="${path}#tell-your-rep">Write to your rep about this vote</a></p>
    </section>`
}

function recentVotesHtml(list) {
  const items = list.map((v) => {
    const path = rollCallPath(v.id)
    const bill = v.bill ? ` · ${v.bill.path ? `<a href="${escapeHtml(v.bill.path)}">${escapeHtml(v.bill.label)}</a>` : escapeHtml(v.bill.label)}` : ''
    const summary = voteSummary(v)
    return `<li><a href="${path}">${escapeHtml(v.chamber)} roll call ${v.roll}: ${escapeHtml(voteHeading(v))}</a>${bill}${v.voted_at ? ` · ${escapeHtml(fmtDate(v.voted_at))}` : ''}${summary ? ` · ${escapeHtml(summary)}` : ''}</li>`
  }).join('')
  return `<section class="home-recent" aria-labelledby="home-recent-h">
      <h2 id="home-recent-h">Recent roll calls</h2>
      <ol>${items}</ol>
      <p><a href="/this-week">This week on the floor</a></p>
    </section>`
}

function featureHref(f, latest) {
  if (f.id === 'write' && latest) return `${rollCallPath(latest.id)}#tell-your-rep`
  return f.href
}

export function renderHomeBody(data) {
  const votes = data.votes
  const latest = votes?.latest || null
  const recent = votes?.recent || []
  const recorded = data.updatedAt ? fmtDate(data.updatedAt) : ''
  const features = HOME_FEATURES.map((f) => `<li><h3>${escapeHtml(f.title)}</h3><p>${escapeHtml(f.body)}</p><a href="${escapeHtml(featureHref(f, latest))}">${escapeHtml(f.label)}</a></li>`).join('')
  const faq = LANDING_FAQ.map(({ q, a }) => `<div class="home-faq-item"><h3>${escapeHtml(q)}</h3><p>${escapeHtml(a)}</p></div>`).join('')
  const links = HOME_LINKS.map((l) => `<a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a>`).join(' · ')

  return chrome(`<div class="bw landing">
  <section class="hero">
    <div class="hero-inner">
      <span class="hero-kicker">${recorded ? `Recorded through ${escapeHtml(recorded)} · ` : ''}119th Congress</span>
      <h1 class="hero-title">How did your representative vote <em>this week?</em></h1>
      <p class="hero-mission">${escapeHtml(BRAND.mission)}</p>
      <p class="home-about">${escapeHtml(HOME_ABOUT)}</p>
      <p><a class="btn btn-primary" href="/my-representative">Find my representatives</a></p>
    </div>
  </section>
  ${latest ? latestVoteHtml(latest) : ''}
  ${recent.length ? recentVotesHtml(recent) : ''}
  <section class="home-features" aria-labelledby="home-features-h">
    <h2 id="home-features-h">What you can do on ${escapeHtml(BRAND.name)}</h2>
    <ul>${features}</ul>
  </section>
  <section class="home-faq" aria-labelledby="home-faq-h">
    <h2 id="home-faq-h">Questions</h2>
    ${faq}
  </section>
  <footer class="home-links">${links} · <a href="/llms.txt">For agents</a></footer>
</div>`)
}

export function renderHomePage(shell, data) {
  return injectIntoShell(shell, {
    ...homeMeta(),
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    robots: 'index, follow',
    jsonLd: homeJsonLd({ dateModified: data.updatedAt || null }),
    body: renderHomeBody(data),
  })
}

function mdCell(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
}

export function homeMarkdown(data) {
  const latest = data.votes?.latest || null
  const recent = data.votes?.recent || []
  const lines = [
    `# ${BRAND.name}: how did your representative vote this week?`,
    '',
    HOME_ABOUT,
    '',
    `- Canonical: ${SITE}/`,
    `- Mission: ${BRAND.mission}`,
  ]
  if (data.updatedAt) lines.push(`- Data updated: ${data.updatedAt}`)
  if (latest) {
    lines.push('', '## Latest recorded vote', '')
    lines.push(`- ${latest.chamber} roll call ${latest.roll}, ${ordinal(latest.congress)} Congress${latest.voted_at ? `, ${latest.voted_at}` : ''}`)
    lines.push(`- Question: ${voteHeading(latest)}`)
    if (latest.bill) lines.push(`- Bill: ${latest.bill.path ? `[${latest.bill.label}](${SITE}${latest.bill.path})` : latest.bill.label}${latest.bill.title ? ` ${latest.bill.title}` : ''}`)
    if (latest.tally) lines.push(`- Tally: ${latest.tally.yea} yea, ${latest.tally.nay} nay`)
    if (latest.result) lines.push(`- Result (derived from tally and question): ${latest.result}`)
    lines.push(`- Every member's vote: ${SITE}${rollCallPath(latest.id)}`)
  }
  if (recent.length) {
    lines.push('', '## Recent roll calls', '', '| Date | Roll call | Question | Bill | Tally | Result |', '|---|---|---|---|---|---|')
    for (const v of recent) {
      lines.push(`| ${mdCell(v.voted_at)} | [${mdCell(`${v.chamber} ${v.roll}`)}](${SITE}${rollCallPath(v.id)}) | ${mdCell(voteHeading(v))} | ${v.bill ? (v.bill.path ? `[${mdCell(v.bill.label)}](${SITE}${v.bill.path})` : mdCell(v.bill.label)) : ''} | ${v.tally ? `${v.tally.yea}-${v.tally.nay}` : ''} | ${mdCell(v.result)} |`)
    }
  }
  lines.push('', '## What you can do', '')
  for (const f of HOME_FEATURES) lines.push(`- **${f.title}** (${SITE}${featureHref(f, latest)}): ${f.body}`)
  lines.push('', '## FAQ', '')
  for (const { q, a } of LANDING_FAQ) lines.push(`### ${q}`, '', a, '')
  lines.push('## More', '')
  for (const l of HOME_LINKS) lines.push(`- ${l.label}: ${SITE}${l.href}`)
  lines.push('', `Record URL patterns, API and MCP: ${SITE}/llms.txt`)
  return lines.join('\n') + '\n'
}

// ---------- static info pages ----------

export function staticMeta(data) {
  return { title: staticPageTitle(data.page), description: data.page.description, canonical: `${SITE}${data.path}` }
}

export function renderStaticPage(shell, data) {
  const meta = staticMeta(data)
  const body = chrome(`<div class="bw info-page">
  <section class="ip-hero"><div class="ip-inner">
    <h1>${escapeHtml(data.page.h1)}</h1>
    <p class="ip-lede">${escapeHtml(data.page.lede)}</p>
  </div></section>
</div>`)
  return injectIntoShell(shell, {
    ...meta,
    ogType: 'website',
    robots: 'index, follow',
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: meta.title,
      description: meta.description,
      url: meta.canonical,
      isPartOf: { '@id': `${SITE}/#website` },
    }],
    body,
  })
}

export function staticMarkdown(data) {
  return [
    `# ${data.page.h1}`,
    '',
    data.page.lede,
    '',
    `- Canonical: ${SITE}${data.path}`,
    '',
    `The full page needs JavaScript. Record URL patterns, API and MCP: ${SITE}/llms.txt`,
  ].join('\n') + '\n'
}
