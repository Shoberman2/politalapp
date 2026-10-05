// Server-rendered record pages for members, bills, and roll calls, plus the
// homepage (kind=home, reached through middleware.js because the static
// index.html wins over a vercel.json rewrite for `/`) and the static info
// pages (kind=static&page=about, ...).
//
// vercel.json rewrites /politician/:id, /politician/:id/record,
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
import { getMemberPage, getRecordPage, getRollCallPage, getBillPage, getHomeVotes, billPath } from './_lib/pages.js'
import { renderPage } from './_lib/renderPage.js'
import { renderMarkdown } from './_lib/markdown.js'
import { renderHomePage, homeMarkdown, renderStaticPage, staticMarkdown } from './_lib/renderHome.js'
import { STATIC_PAGES } from './_lib/staticPages.js'
import { getDataUpdatedAt } from './_lib/etlMeta.js'
import { buildRollCallId, rollCallPath } from './_lib/rollCallResult.js'
import { originFrom } from './_lib/request.js'
import { SITE_ORIGIN as SITE } from './_lib/site.js'
import { recordPath } from '../shared/memberRecord.js'

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
  if (q.kind === 'member' && q.id) return { kind: 'member', id: String(q.id).toUpperCase(), path: `/politician/${String(q.id).toUpperCase()}` }
  if (q.kind === 'record' && q.id) return { kind: 'record', id: String(q.id).toUpperCase(), path: recordPath(q.id) }
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

async function loadData(target) {
  if (target.kind === 'home') return loadHome()
  if (target.kind === 'static') return { kind: 'static', path: target.path, page: STATIC_PAGES[target.path], indexable: true }
  if (target.kind === 'member') return getMemberPage(target.id)
  if (target.kind === 'record') return getRecordPage(target.id)
  if (target.kind === 'bill') return getBillPage(target.id)
  return getRollCallPage(target.id)
}

function wantsMarkdown(req) {
  if (req.query?.format === 'md') return true
  const accept = String(req.headers?.accept || '')
  return /text\/markdown/i.test(accept) && !/text\/html/i.test(accept.split(',')[0])
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
    return sendHtml(res, shell, 404, SKIP_CACHE, { 'X-Robots-Tag': 'noindex' })
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
      return sendHtml(res, shell, 404, SKIP_CACHE, { 'X-Robots-Tag': 'noindex' })
    }

    const cache = data.kind === 'home'
      ? (data.votes ? HOME_CACHE : HOME_DEGRADED_CACHE)
      : data.kind === 'static' ? STATIC_CACHE : PAGE_CACHE

    if (markdown) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
      res.setHeader('Cache-Control', cache)
      res.setHeader('Vary', 'Accept')
      res.setHeader('Link', `<${SITE}${target.path}>; rel="canonical"`)
      if (!data.indexable) res.setHeader('X-Robots-Tag', 'noindex')
      const md = data.kind === 'home' ? homeMarkdown(data) : data.kind === 'static' ? staticMarkdown(data) : renderMarkdown(data)
      return res.end(md)
    }

    if (!shell) throw new Error('no shell')

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
