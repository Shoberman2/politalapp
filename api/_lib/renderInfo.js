// Server-rendered /this-week and /developers, plus the head-only pages for the
// routes that need an account (/all, /bills, /my-representative) and the
// sign-in routes (/auth, /auth/*).
//
// /this-week and /developers carry real body text, injected into the SPA shell
// the same way the static info pages are (renderHome.js). The text comes from
// the data the React pages show: the House floor schedule
// (api/_lib/floorSchedule.js, the source of GET /api/v1/floor/schedule that
// ThisWeekOnFloor.jsx calls) and the recent roll calls (getHomeVotes, the same
// roll_calls table ThisWeekOnFloor.jsx reads). Titles and descriptions mirror
// the <SEO> props in ThisWeekPage.jsx and DeveloperPortal.jsx; keep them in
// step when either changes.
//
// The gated routes get their own <head> and nothing else. Their body stays the
// app shell, because a signed-out human sees the sign-in gate there: serving a
// crawler a list the visitor cannot see would be cloaking. /auth stays the
// shell and is kept out of search results.

import { chrome, escapeHtml, injectIntoShell, fmtDate, clampText, ordinal } from './renderPage.js'
import { voteSummary, voteHeading } from './renderHome.js'
import { rollCallPath } from './rollCallResult.js'
import { SITE_ORIGIN as SITE } from './site.js'
import { BRAND } from '../../src/config/brand.js'
import { SENATE_NOTE } from './floorSchedule.js'

const name = BRAND.name
const e = escapeHtml

const HOUSE_FLOOR_HOME = 'https://docs.house.gov/floor/'
const SCHEDULE_LIMIT = 20
const RECORDED_LIMIT = 12

function webPageJsonLd(meta, dateModified) {
  return [{
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: meta.title,
    description: meta.description,
    url: meta.canonical,
    isPartOf: { '@id': `${SITE}/#website` },
    ...(dateModified ? { dateModified } : {}),
  }]
}

function mdCell(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
}

// "2026-09-14" -> "Sep 14" without a timezone shift (ThisWeekOnFloor.jsx weekLabel).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function weekLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : (iso || '')
}

// ---------- /this-week ----------

export const THIS_WEEK_PATH = '/this-week'
export const THIS_WEEK_TITLE = `This Week on the Floor | ${name}`
export const THIS_WEEK_DESCRIPTION = 'What the U.S. House has scheduled for floor consideration this week, from the Majority Leader’s weekly schedule, beside the roll-call votes Congress most recently recorded.'
const THIS_WEEK_H1 = 'This Week On The Floor'
const THIS_WEEK_LEDE = 'What the House plans to take up this week, from the weekly schedule its majority leader publishes on docs.house.gov, next to the votes Congress has just recorded. A listing means a bill may come up that week, not that it will, and the schedule names the week, not the day.'

export function thisWeekMeta() {
  return { title: THIS_WEEK_TITLE, description: THIS_WEEK_DESCRIPTION, canonical: `${SITE}${THIS_WEEK_PATH}` }
}

// The votes ThisWeekOnFloor.jsx lists: those with something to say.
function usableVotes(votes) {
  return (votes?.recent || []).filter((v) => v.description || v.question || v.bill).slice(0, RECORDED_LIMIT)
}

// Published weeks with items, trimmed to SCHEDULE_LIMIT items in all, like the
// component does.
function publishedWeeks(schedule) {
  let remaining = SCHEDULE_LIMIT
  const out = []
  for (const w of (schedule?.weeks || []).filter((x) => x.status === 'published' && x.items?.length)) {
    if (remaining <= 0) break
    const shown = w.items.slice(0, remaining)
    remaining -= shown.length
    out.push({ week: w.week, sourceUrl: w.source_url, shown, hidden: w.items.length - shown.length })
  }
  return out
}

function scheduledItemHtml(item) {
  const label = item.label || 'No number'
  const num = item.bill_path ? `<a href="${e(item.bill_path)}">${e(label)}</a>` : e(label)
  return `<li><p>${e(item.title || 'Untitled floor item')}</p><p>${num}${item.category ? ` · ${e(item.category)}` : ''} · Not voted on yet</p></li>`
}

function recordedItemHtml(v) {
  const path = rollCallPath(v.id)
  const text = clampText(v.description || v.question || '', 200)
  const bill = v.bill ? ` · ${v.bill.path ? `<a href="${e(v.bill.path)}">${e(v.bill.label)}</a>` : e(v.bill.label)}` : ''
  const summary = voteSummary(v)
  return `<li>${text ? `<p>${e(text)}</p>` : ''}<p><a href="${e(path)}">${e(v.chamber)} roll call ${v.roll}</a>${bill}${v.voted_at ? ` · ${e(fmtDate(v.voted_at))}` : ''}${summary ? ` · ${e(summary)}` : ''}</p></li>`
}

export function renderThisWeekBody(data) {
  const weeks = publishedWeeks(data.schedule)
  const votes = usableVotes(data.votes)
  const scheduleFailed = !data.schedule
  const thisWeek = data.schedule?.weeks?.[0]

  let scheduled
  if (scheduleFailed) {
    scheduled = `<p class="twof-empty">The House floor schedule couldn’t be loaded right now. The official copy is on <a href="${HOUSE_FLOOR_HOME}" rel="noopener noreferrer">docs.house.gov</a>.</p>`
  } else if (!weeks.length) {
    scheduled = `<p class="twof-empty">No floor schedule published for this week${thisWeek ? ` (week of ${e(weekLabel(thisWeek.week))})` : ''}. The House may not be meeting this week. <a href="${e(thisWeek?.source_url || HOUSE_FLOOR_HOME)}" rel="noopener noreferrer">Check docs.house.gov</a></p>`
  } else {
    scheduled = weeks.map((w, i) => `<div class="twof-week"><p class="twof-week-label">${i === 0 && w.week === thisWeek?.week ? 'This week' : 'Next week'} · week of ${e(weekLabel(w.week))}</p><ul class="twof-list">${w.shown.map(scheduledItemHtml).join('')}</ul>${w.hidden > 0 ? `<p><a class="twof-more" href="${e(w.sourceUrl)}" rel="noopener noreferrer">${w.hidden} more on the official schedule</a></p>` : ''}</div>`).join('')
  }

  const recorded = votes.length
    ? `<ul class="twof-list">${votes.map(recordedItemHtml).join('')}</ul>`
    : '<p class="twof-empty">No recorded votes to show right now.</p>'

  const updated = data.updatedAt ? `<p class="ip-updated">Data updated ${e(fmtDate(data.updatedAt))}.</p>` : ''
  return chrome(`<div class="bw twof-page">
  <div class="info-page ip-wide">
    <section class="ip-hero"><div class="ip-inner">
      <h1 class="ip-title">${e(THIS_WEEK_H1)}</h1>
      <p class="ip-lede">${e(THIS_WEEK_LEDE)}</p>
      ${updated}
    </div></section>
  </div>
  <div class="twof-page-body">
    <section class="twof twof--page" aria-label="This week on the floor">
      <div class="twof-grid">
        <div class="twof-col twof-col--scheduled">
          <h2 class="twof-col-title">Scheduled</h2>
          <p class="twof-col-sub">Coming up. The House may vote on these this week.</p>
          ${scheduled}
          <p class="twof-footnote">${e(SENATE_NOTE)}</p>
        </div>
        <div class="twof-col twof-col--recorded">
          <h2 class="twof-col-title">Recorded</h2>
          <p class="twof-col-sub">Already decided. Each one shows the result and the count.</p>
          ${recorded}
        </div>
      </div>
    </section>
    <p><a href="/how-it-works">How it works</a> · <a href="/methodology">Methodology</a> · <a href="/llms.txt">For agents</a></p>
  </div>
</div>`)
}

export function renderThisWeekPage(shell, data) {
  const meta = thisWeekMeta()
  return injectIntoShell(shell, {
    ...meta,
    ogType: 'website',
    robots: 'index, follow',
    jsonLd: webPageJsonLd(meta, data.updatedAt || null),
    body: renderThisWeekBody(data),
  })
}

export function thisWeekMarkdown(data) {
  const weeks = publishedWeeks(data.schedule)
  const votes = usableVotes(data.votes)
  const lines = [`# ${THIS_WEEK_H1}`, '', THIS_WEEK_LEDE, '', `- Canonical: ${SITE}${THIS_WEEK_PATH}`]
  if (data.updatedAt) lines.push(`- Data updated: ${data.updatedAt}`)
  lines.push('', '## Scheduled in the House', '')
  if (!data.schedule) lines.push(`The House floor schedule could not be loaded. The official copy is at ${HOUSE_FLOOR_HOME}.`)
  else if (!weeks.length) lines.push(`No floor schedule is published for this week. Check ${HOUSE_FLOOR_HOME}.`)
  for (const w of weeks) {
    lines.push(`### Week of ${w.week}`, '')
    for (const item of w.shown) {
      const label = item.label || 'No number'
      lines.push(`- ${item.bill_path ? `[${mdCell(label)}](${SITE}${item.bill_path})` : mdCell(label)}: ${mdCell(item.title || 'Untitled floor item')} (not voted on yet)`)
    }
    if (w.hidden > 0) lines.push(`- ${w.hidden} more: ${w.sourceUrl}`)
    lines.push('')
  }
  lines.push(SENATE_NOTE, '', '## Recorded votes', '')
  if (!votes.length) lines.push('No recorded votes to show right now.')
  else {
    lines.push('| Date | Roll call | Question | Bill | Tally | Result |', '|---|---|---|---|---|---|')
    for (const v of votes) {
      lines.push(`| ${mdCell(v.voted_at)} | [${mdCell(`${v.chamber} ${v.roll}`)}](${SITE}${rollCallPath(v.id)}) | ${mdCell(clampText(v.description || voteHeading(v), 200))} | ${v.bill ? (v.bill.path ? `[${mdCell(v.bill.label)}](${SITE}${v.bill.path})` : mdCell(v.bill.label)) : ''} | ${v.tally ? `${v.tally.yea}-${v.tally.nay}` : ''} | ${mdCell(v.result)} |`)
    }
  }
  lines.push('', `Record URL patterns, API and MCP: ${SITE}/llms.txt`)
  return lines.join('\n') + '\n'
}

// ---------- /developers ----------

export const DEVELOPERS_PATH = '/developers'
export const DEVELOPERS_TITLE = `For Developers: API, MCP Server and Open Data | ${name}`
export const DEVELOPERS_DESCRIPTION = 'Build on the congressional record: a free JSON API with no key needed to read, an MCP server for Claude, ChatGPT and other AI assistants, and bulk open data.'
const DEVELOPERS_H1 = 'Build On Source-Linked Congressional Data'
const DEVELOPERS_LEDE = 'Every GET endpoint is open without a key. Read the OpenAPI contract, or point an agent at /llms.txt or the MCP server.'
const API_BASE = `${SITE}/api/v1`
const MCP_URL = `${SITE}/mcp`

// Mirrors the endpoint cards in DeveloperPortal.jsx.
const ENDPOINTS = [
  ['GET /api/v1/members', 'The current congressional roster. Filter members and delegates by state, chamber, or party, with photos, contact info, and districts.'],
  ['GET /api/v1/bills', '10,000+ bills with CRS summaries, source-linked explanations, policy areas, and full status tracking.'],
  ['GET /api/v1/members/:id/votes', 'Complete voting history for any member. Joined with bill metadata for context.'],
  ['GET /api/v1/stats', 'Party-alignment statistics, attendance stats, bills by policy area. Pre-computed, fast.'],
  ['GET /api/v1/votes/:rollCallId', 'Full roll call breakdown: every member\'s vote, party splits, pass/fail summary.'],
  ['GET /api/v1/search', 'Cross-table search. Find members by name, bills by keyword. One query, all results.'],
]
const MCP_TEXT = 'Connect Claude, ChatGPT or any MCP client and ask how your representative voted. Every answer cites the official record. No key and no account are needed: add the server address below as a custom connector.'
const JSON_TEXT = 'Sixty requests a minute and five thousand a day per IP, no signup. Every response carries data_updated_at and the official source URL. Member, bill, and roll-call pages also answer Accept: text/markdown.'
const OPEN_DATA_TEXT = `${name} publishes every member, bill, roll call and vote as daily CC0 bulk files, plus schema samples and an OpenAPI spec, so civic hackers, classrooms, and newsrooms can build without a plan.`
const KEY_TEXT = 'A free key raises the limit from 60 requests a minute to 600. Paid plans add monthly volume and support.'

export function developersMeta() {
  return { title: DEVELOPERS_TITLE, description: DEVELOPERS_DESCRIPTION, canonical: `${SITE}${DEVELOPERS_PATH}` }
}

export function renderDevelopersBody() {
  const endpoints = ENDPOINTS.map(([code, text]) => `<li><code>${e(code)}</code><p>${e(text)}</p></li>`).join('')
  return chrome(`<div class="bw dev-portal">
  <section class="dev-hero">
    <h1>${e(DEVELOPERS_H1)}</h1>
    <p class="dev-hero-subtitle">Every GET endpoint is open without a key. Read the <a href="/openapi.yaml">OpenAPI contract</a>, or point an agent at <a href="/llms.txt"><code>/llms.txt</code></a> or the MCP server.</p>
    <p><a href="/developers/docs">Read the docs</a> · <a href="/open">Explore open data</a> · <a href="/developers/keys">Get a free API key</a></p>
  </section>
  <section class="dev-endpoints">
    <h2>What You Can Build</h2>
    <p>The JSON API base URL is <code>${e(API_BASE)}</code>.</p>
    <ul>${endpoints}</ul>
  </section>
  <section class="dev-agents" id="mcp">
    <h2>Ask Your AI Assistant</h2>
    <p>${e(MCP_TEXT)}</p>
    <pre class="dev-curl"><code>${e(MCP_URL)}</code></pre>
    <p><a href="/.well-known/mcp/server-card.json">MCP server card</a> · <a href="/llms.txt">llms.txt (site map for agents)</a> · <a href="/llms-full.txt">Everything for agents in one file</a></p>
  </section>
  <section class="dev-agents">
    <h2>The Same Record As JSON</h2>
    <p>${e(JSON_TEXT)}</p>
    <pre class="dev-curl"><code>curl ${e(API_BASE)}/members/P000197/votes?limit=5</code></pre>
    <p><a href="/developers/docs">API documentation</a> · <a href="/openapi.yaml">OpenAPI spec</a> · <a href="/sitemap.xml">Sitemap</a></p>
  </section>
  <section class="dev-open-data">
    <h2>Download The Full Record</h2>
    <p>${e(OPEN_DATA_TEXT)}</p>
    <p><a href="/open#download">Full record downloads (CC0)</a> · <a href="/data/full/manifest.json">Open-data manifest</a> · <a href="/data/datapackage.json">Sample Data Package metadata</a></p>
  </section>
  <section class="dev-pricing" id="pricing">
    <h2>API Keys</h2>
    <p>${e(KEY_TEXT)} <a href="/developers/keys">Get a free key</a></p>
  </section>
</div>`)
}

export function renderDevelopersPage(shell) {
  const meta = developersMeta()
  return injectIntoShell(shell, {
    ...meta,
    ogType: 'website',
    robots: 'index, follow',
    jsonLd: webPageJsonLd(meta, null),
    body: renderDevelopersBody(),
  })
}

export function developersMarkdown() {
  const lines = [
    `# ${DEVELOPERS_H1}`,
    '',
    DEVELOPERS_LEDE,
    '',
    `- Canonical: ${SITE}${DEVELOPERS_PATH}`,
    `- JSON API base URL: ${API_BASE}`,
    `- MCP server: ${MCP_URL}`,
    `- API documentation: ${SITE}/developers/docs`,
    `- OpenAPI spec: ${SITE}/openapi.yaml`,
    `- Agent guide: ${SITE}/llms.txt`,
    `- Open data: ${SITE}/open`,
    '',
    '## What you can build',
    '',
    ...ENDPOINTS.map(([code, text]) => `- \`${code}\`: ${text}`),
    '',
    '## Ask your AI assistant',
    '',
    MCP_TEXT,
    '',
    `    ${MCP_URL}`,
    '',
    '## The same record as JSON',
    '',
    JSON_TEXT,
    '',
    '## Download the full record',
    '',
    OPEN_DATA_TEXT,
    '',
    '## API keys',
    '',
    KEY_TEXT,
  ]
  return lines.join('\n') + '\n'
}

// ---------- gated routes: head only ----------

// Each entry is the page's own <head>. `canonical` is a path. /all points at
// /members, the public version of the same list. Mirrors the <SEO> props in
// AllPoliticians.jsx, BillsPage.jsx and MyPolitician.jsx.
export const GATED_SHELL_PAGES = {
  '/all': {
    title: 'Current Members and Delegates of Congress',
    description: 'Browse the current congressional roster of members and delegates. Filter by chamber, party, and state.',
    canonical: '/members',
    noscript: 'The current roster of members and delegates of Congress, with filters for chamber, party and state. A free account is needed to use this page; the public list is at /members.',
  },
  '/bills': {
    title: 'Congressional Bill Tracker',
    description: 'Browse and search legislation from the U.S. Congress. Review source-linked explanations and follow the legislative process.',
    canonical: '/bills',
    noscript: 'Browse and search legislation from the U.S. Congress. A free account is needed to use this page.',
  },
  '/my-representative': {
    title: 'Find My Representative',
    description: 'Look up your U.S. senators and house representative by address. Find out who represents you in Congress.',
    canonical: '/my-representative',
    noscript: 'Look up your U.S. senators and house representative by address. A free account is needed to use this page.',
  },
}

export function gatedShellMeta(path) {
  const p = GATED_SHELL_PAGES[path]
  if (!p) return null
  return { title: `${p.title} | ${name}`, description: p.description, canonical: `${SITE}${p.canonical}` }
}

// Adds one plain sentence ahead of the shell's existing noscript text.
function addNoscriptLine(html, sentence) {
  return String(html).replace(/<noscript>/i, () => `<noscript>\n      <p>${e(sentence)}</p>`)
}

export function renderGatedShell(shell, path) {
  const p = GATED_SHELL_PAGES[path]
  const meta = gatedShellMeta(path)
  if (!p || !meta) return shell
  // The app shell is the body; only the head differs. injectIntoShell swaps the
  // generic WebApplication JSON-LD for the (empty) list, so put no block here:
  // the homepage's description of the whole app does not describe this page.
  const html = injectIntoShell(shell, { ...meta, ogType: 'website', robots: 'index, follow', jsonLd: [], body: '' })
  return addNoscriptLine(html, p.noscript)
}

// ---------- /auth: shell, noindex ----------

export const AUTH_ROBOTS = 'noindex, follow'

export function renderAuthShell(shell) {
  const html = String(shell)
  const tag = `<meta name="robots" content="${AUTH_ROBOTS}" />`
  return /<meta name="robots" content="[^"]*"\s*\/?>/i.test(html)
    ? html.replace(/<meta name="robots" content="[^"]*"\s*\/?>/i, () => tag)
    : html.replace(/<\/head>/i, () => `${tag}\n</head>`)
}
