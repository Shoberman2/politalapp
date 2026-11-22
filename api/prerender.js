// Server-rendered record pages for members, bills, and roll calls, plus the
// homepage (kind=home, reached through middleware.js because the static
// index.html wins over a vercel.json rewrite for `/`) and the static info
// pages (kind=static&page=about, ...). /this-week and /developers (kind=this-week,
// kind=developers) carry real text; /all, /bills, /my-representative and /auth
// (kind=shell) get their own <head> and keep the app shell as the body.
//
// vercel.json rewrites /members, /politician/:id, /politician/:id/record,
// /bill/:congress/:type/:number, and /vote/:congress/:chamber/:session/:roll
// here. The function injects the
// record into the real SPA shell (index.html, fetched at runtime because asset
// names are hashed per deploy), so bots and humans both get content and React
// still takes over on the client. With `Accept: text/markdown` the same record
// comes back as compact Markdown for agents.
//
// Failure path: any error or a slow database answer returns the plain shell
// with `Cache-Control: no-store`, which is exactly what the site served before
// this function existed. Never a text error page.

import { readFile } from 'fs/promises'
import { getMemberPage, getRecordPage, getRollCallPage, getBillPage, getHomeVotes, getMembersIndex, billPath } from './_lib/pages.js'
import { renderPage } from './_lib/renderPage.js'
import { renderMarkdown } from './_lib/markdown.js'
import { renderMembersPage, notFoundHtml } from './_lib/renderMembers.js'
import { renderHomePage, homeMarkdown, renderStaticPage, staticMarkdown } from './_lib/renderHome.js'
import { STATIC_PAGES } from './_lib/staticPages.js'
import {
  renderThisWeekPage, thisWeekMarkdown, renderDevelopersPage, developersMarkdown,
  renderGatedShell, renderAuthShell, GATED_SHELL_PAGES, AUTH_ROBOTS, THIS_WEEK_PATH, DEVELOPERS_PATH,
} from './_lib/renderInfo.js'
import { loadFloorSchedule, resolveFloorWeeks } from './_lib/floorSchedule.js'
import { getDataUpdatedAt } from './_lib/etlMeta.js'
import { buildRollCallId, rollCallPath } from './_lib/rollCallResult.js'
import { originFrom } from './_lib/request.js'
import { SITE_ORIGIN as SITE } from './_lib/site.js'
import { memberPath, parseMemberSegment } from '../shared/memberSlug.js'

export { originFrom }

const DATA_TIMEOUT_MS = Number(process.env.PRERENDER_TIMEOUT_MS || 5000)
const SHELL_TTL_MS = 5 * 60 * 1000
const PAGE_CACHE = 'public, s-maxage=900, stale-while-revalidate=86400'
// Not-found and skipped bills change rarely; cache them as long as pages.
const SKIP_CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400'
// The homepage leads with the latest vote: refresh it sooner than records.
const HOME_CACHE = 'public, s-maxage=300, stale-while-revalidate=86400'
// Homepage rendered without its votes section (the read failed): retry soon.
const HOME_DEGRADED_CACHE = 'public, s-maxage=60, stale-while-revalidate=600'
const STATIC_CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400'

let shellCache = { origin: null, html: null, fetchedAt: 0 }

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// The Vite build copies dist/index.html to api/_shell/index.html
// (vite.config.js). These must stay literal `new URL(..., import.meta.url)`
// expressions: that is what Vercel's file tracer follows to bundle the file
// with the function, so production and previews never depend on a network
// hop or on deployment protection to find their own asset tags.
const BUILT_SHELL_CANDIDATES = [
  new URL('./_shell/index.html', import.meta.url),
  new URL('../dist/index.html', import.meta.url),
]

async function readBuiltShell() {
  for (const url of BUILT_SHELL_CANDIDATES) {
    try {
      const html = await readFile(url, 'utf8')
      if (/<div id="root">/.test(html) && !/\/src\/main\.jsx/.test(html)) return html
    } catch { /* try the next location */ }
  }
  return null
}

export async function getShell(origin, fetchImpl = fetch) {
  const now = Date.now()
  if (shellCache.html && shellCache.origin === origin && now - shellCache.fetchedAt < SHELL_TTL_MS) return shellCache.html
  if (!process.env.PRERENDER_SHELL_FROM_ORIGIN) {
    const built = await readBuiltShell()
    if (built) {
      shellCache = { origin, html: built, fetchedAt: now }
      return built
    }
  }
  try {
    const res = await withTimeout(fetchImpl(`${origin}/index.html`, { headers: { 'x-ballotwatch-shell': '1' } }), DATA_TIMEOUT_MS, 'shell fetch')
    if (!res.ok) throw new Error(`shell ${res.status}`)
    const html = await res.text()
    if (!/<div id="root">/.test(html)) throw new Error('shell has no root')
    shellCache = { origin, html, fetchedAt: now }
    return html
  } catch (err) {
    if (shellCache.html) return shellCache.html
    // Local development without the static server in front: fall back to the
    // source index.html so the page still renders through Vite.
    try {
      const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
      shellCache = { origin, html, fetchedAt: now }
      return html
    } catch {
      throw err
    }
  }
}

export function resolveTarget(query) {
  const q = query || {}
  if (q.kind === 'home') return { kind: 'home', id: 'home', path: '/' }
  if (q.kind === 'static' && q.page) {
    const path = `/${String(q.page).toLowerCase()}`
    if (Object.hasOwn(STATIC_PAGES, path)) return { kind: 'static', id: path, path }
    return null
  }
  if (q.kind === 'members') return { kind: 'members', id: 'members', path: '/members' }
  if (q.kind === 'this-week') return { kind: 'this-week', id: 'this-week', path: THIS_WEEK_PATH }
  if (q.kind === 'developers') return { kind: 'developers', id: 'developers', path: DEVELOPERS_PATH }
  // Head-only pages: the routes that need an account, and /auth.
  if (q.kind === 'shell' && q.page) {
    const path = `/${String(Array.isArray(q.page) ? q.page[0] : q.page).toLowerCase()}`
    if (path === '/auth' || Object.hasOwn(GATED_SHELL_PAGES, path)) return { kind: 'shell', id: path, path }
    return null
  }
  // The rewrite passes the whole path segment ("P000197-nancy-pelosi"). The id
  // is the part before the first hyphen; the slug is checked after the member
  // is loaded, because only then do we know the right one.
  if ((q.kind === 'member' || q.kind === 'record') && q.id) {
    const seg = parseMemberSegment(Array.isArray(q.id) ? q.id[0] : q.id)
    if (!seg) return null
    const suffix = q.kind === 'record' ? '/record' : ''
    return { kind: q.kind, id: seg.id, segment: String(Array.isArray(q.id) ? q.id[0] : q.id), alias: Boolean(q.alias), path: `/politician/${seg.id}${suffix}` }
  }
  if (q.kind === 'bill' && q.congress && q.type && q.number) {
    const id = `${q.congress}-${String(q.type).toLowerCase()}-${q.number}`
    return { kind: 'bill', id, path: billPath(id) }
  }
  if (q.kind === 'vote') {
    const id = buildRollCallId({ congress: q.congress, chamber: q.chamber, session: q.session, roll: q.roll })
    if (id) return { kind: 'vote', id, path: rollCallPath(id) }
  }
  return null
}

// The homepage always renders: a failed vote read drops that section (and
// shortens the cache) instead of failing the page.
// Each homepage read gets its own short budget, so a slow database degrades
// to the briefly cached no-votes page instead of an uncached fallback.
const HOME_READ_TIMEOUT_MS = 2500

async function loadHome() {
  const [votes, updatedAt] = await Promise.all([
    withTimeout(getHomeVotes(), HOME_READ_TIMEOUT_MS, 'home votes').catch((err) => { console.error('[prerender] home votes unavailable:', err.message); return null }),
    withTimeout(getDataUpdatedAt(), HOME_READ_TIMEOUT_MS, 'etl meta').catch(() => null),
  ])
  return { kind: 'home', votes, updatedAt, indexable: true }
}

// /this-week reads the same two sources the React page does. Each read has its
// own budget and a failed one drops its column, so the page always renders.
async function loadThisWeek() {
  const [schedule, votes, updatedAt] = await Promise.all([
    withTimeout(loadFloorSchedule(resolveFloorWeeks()), HOME_READ_TIMEOUT_MS, 'floor schedule')
      .then((r) => (r.allFailed ? null : r.data))
      .catch((err) => { console.error('[prerender] floor schedule unavailable:', err.message); return null }),
    withTimeout(getHomeVotes(), HOME_READ_TIMEOUT_MS, 'recent votes').catch((err) => { console.error('[prerender] recent votes unavailable:', err.message); return null }),
    withTimeout(getDataUpdatedAt(), HOME_READ_TIMEOUT_MS, 'etl meta').catch(() => null),
  ])
  return { kind: 'this-week', path: THIS_WEEK_PATH, schedule, votes, updatedAt, indexable: true }
}

async function loadData(target) {
  if (target.kind === 'home') return loadHome()
  if (target.kind === 'this-week') return loadThisWeek()
  if (target.kind === 'developers') return { kind: 'developers', path: DEVELOPERS_PATH, indexable: true }
  if (target.kind === 'shell') return { kind: 'shell', path: target.path, indexable: target.path !== '/auth' }
  if (target.kind === 'static') return { kind: 'static', path: target.path, page: STATIC_PAGES[target.path], indexable: true }
  if (target.kind === 'member') return getMemberPage(target.id)
  if (target.kind === 'record') return getRecordPage(target.id)
  if (target.kind === 'members') return getMembersIndex()
  if (target.kind === 'bill') return getBillPage(target.id)
  return getRollCallPage(target.id)
}

function wantsMarkdown(req) {
  if (req.query?.format === 'md') return true
  const accept = String(req.headers?.accept || '')
  return /text\/markdown/i.test(accept) && !/text\/html/i.test(accept.split(',')[0])
}

// The query string a redirect keeps: everything the visitor sent, minus the
// parameters the vercel.json rewrite added.
// Vercel also copies named rewrite params (:bioguideId) into the query.
const REWRITE_PARAMS = new Set(['kind', 'id', 'alias', 'bioguideId'])
export function forwardedQuery(query) {
  const out = new URLSearchParams()
  for (const [k, v] of Object.entries(query || {})) {
    if (REWRITE_PARAMS.has(k)) continue
    for (const item of Array.isArray(v) ? v : [v]) out.append(k, item)
  }
  const qs = out.toString()
  return qs ? `?${qs}` : ''
}

// Where a member or record request belongs: the canonical slugged path, or
// null when the request already is it. Bare ids, wrong or stale slugs,
// lowercase ids and the old /member/:id alias all redirect there.
export function canonicalRedirect(target, data) {
  if (target.kind !== 'member' && target.kind !== 'record') return null
  const canonical = memberPath(data.id, data.name, target.kind === 'record' ? '/record' : '')
  if (!target.alias && canonical.split('/')[2] === target.segment) return null
  return canonical
}

function sendRedirect(res, location) {
  res.statusCode = 301
  res.setHeader('Location', location)
  res.setHeader('Cache-Control', SKIP_CACHE)
  res.setHeader('Vary', 'Accept')
  res.end()
}

function sendHtml(res, html, status, cache, extra = {}) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', cache)
  res.setHeader('Vary', 'Accept')
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v)
  res.end(html)
}

export default async function handler(req, res) {
  const origin = originFrom(req)
  const target = resolveTarget(req.query)
  const markdown = wantsMarkdown(req)

  // Markdown never needs the shell; HTML loads shell and data together.
  const shellPromise = markdown
    ? Promise.resolve(null)
    : getShell(origin).catch((err) => { console.error('[prerender] shell unavailable:', err.message); return null })

  if (!target) {
    const shell = await shellPromise
    if (markdown) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.end('Not found\n') }
    if (!shell) { res.statusCode = 500; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.end('unavailable\n') }
    const isMemberRoute = req.query?.kind === 'member' || req.query?.kind === 'record'
    return sendHtml(res, isMemberRoute ? notFoundHtml(shell) : shell, 404, SKIP_CACHE, { 'X-Robots-Tag': 'noindex' })
  }

  let shell = null
  try {
    const [shellResult, data] = await Promise.all([
      shellPromise,
      withTimeout(loadData(target), DATA_TIMEOUT_MS, `${target.kind} ${target.id}`),
    ])
    shell = shellResult

    if (!data) {
      if (markdown) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.end(`Not found: ${target.id}\n`) }
      if (!shell) throw new Error('no shell for 404')
      const isMemberRoute = target.kind === 'member' || target.kind === 'record'
      return sendHtml(res, isMemberRoute ? notFoundHtml(shell) : shell, 404, SKIP_CACHE, { 'X-Robots-Tag': 'noindex' })
    }

    const redirectTo = canonicalRedirect(target, data)
    if (redirectTo) return sendRedirect(res, `${redirectTo}${forwardedQuery(req.query)}`)

    const cache = data.kind === 'home'
      ? (data.votes ? HOME_CACHE : HOME_DEGRADED_CACHE)
      : data.kind === 'this-week' ? (data.schedule || data.votes ? HOME_CACHE : HOME_DEGRADED_CACHE)
        : data.kind === 'static' || data.kind === 'developers' || data.kind === 'shell' ? STATIC_CACHE : PAGE_CACHE

    // The app-shell pages (/all, /bills, /my-representative, /auth) have no text view.
    if (markdown && data.kind === 'shell') { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.end('No Markdown view of this page\n') }

    if (markdown) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
      res.setHeader('Cache-Control', cache)
      res.setHeader('Vary', 'Accept')
      res.setHeader('Link', `<${SITE}${data.kind === 'member' || data.kind === 'record' ? memberPath(data.id, data.name, data.kind === 'record' ? '/record' : '') : target.path}>; rel="canonical"`)
      if (!data.indexable) res.setHeader('X-Robots-Tag', 'noindex')
      const md = data.kind === 'home' ? homeMarkdown(data)
        : data.kind === 'static' ? staticMarkdown(data)
          : data.kind === 'this-week' ? thisWeekMarkdown(data)
            : data.kind === 'developers' ? developersMarkdown()
              : renderMarkdown(data)
      return res.end(md)
    }

    if (!shell) throw new Error('no shell')

    if (data.kind === 'members') {
      return sendHtml(res, renderMembersPage(shell, data), 200, PAGE_CACHE, { 'X-BallotWatch-Prerender': 'index' })
    }

    if (data.kind === 'this-week') {
      return sendHtml(res, renderThisWeekPage(shell, data), 200, cache, { 'X-BallotWatch-Prerender': data.schedule || data.votes ? 'index' : 'index:no-data' })
    }
    if (data.kind === 'developers') {
      return sendHtml(res, renderDevelopersPage(shell), 200, cache, { 'X-BallotWatch-Prerender': 'index' })
    }
    if (data.kind === 'shell') {
      if (data.path === '/auth') {
        return sendHtml(res, renderAuthShell(shell), 200, cache, { 'X-Robots-Tag': AUTH_ROBOTS, 'X-BallotWatch-Prerender': 'shell:noindex' })
      }
      return sendHtml(res, renderGatedShell(shell, data.path), 200, cache, { 'X-BallotWatch-Prerender': 'shell:head' })
    }

    if (data.kind === 'home' || data.kind === 'static') {
      const html = data.kind === 'home' ? renderHomePage(shell, data) : renderStaticPage(shell, data)
      return sendHtml(res, html, 200, cache, { 'X-BallotWatch-Prerender': data.kind === 'home' && !data.votes ? 'index:no-votes' : 'index' })
    }

    // Bills without a vote or a summary are not worth a rendered page yet:
    // hand back the app shell with a short cache so crawlers following links
    // into 180,000 bill URLs do not fan out into uncached queries.
    if (data.kind === 'bill' && data.noindexReason === 'no_vote_or_summary') {
      return sendHtml(res, shell, 200, SKIP_CACHE, { 'X-Robots-Tag': 'noindex', 'X-BallotWatch-Prerender': 'skipped' })
    }

    const html = renderPage(shell, data)
    return sendHtml(res, html, 200, PAGE_CACHE, {
      'X-BallotWatch-Prerender': data.indexable ? 'index' : `noindex:${data.noindexReason}`,
      ...(data.indexable ? {} : { 'X-Robots-Tag': 'noindex' }),
    })
  } catch (err) {
    console.error(`[prerender] ${target.kind} ${target.id} failed:`, err.message)
    if (!shell && !markdown) shell = await shellPromise
    if (markdown) { res.statusCode = 503; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.setHeader('Retry-After', '30'); return res.end('Temporarily unavailable\n') }
    if (!shell) { res.statusCode = 503; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.end('Temporarily unavailable\n') }
    // The homepage fallback is cached briefly so an incident doesn't send every
    // visit to the database; record pages keep no-store (their shell is generic).
    return sendHtml(res, shell, 200, target.kind === 'home' ? 'public, s-maxage=30' : 'no-store', { 'X-BallotWatch-Prerender': 'fallback' })
  }
}

export const config = { runtime: 'nodejs', maxDuration: 15 }
