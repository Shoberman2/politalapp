// Server-rendered record pages for members, bills, and roll calls.
//
// vercel.json rewrites /politician/:id, /bill/:congress/:type/:number, and
// /vote/:congress/:chamber/:session/:roll here. The function injects the
// record into the real SPA shell (index.html, fetched at runtime because asset
// names are hashed per deploy), so bots and humans both get content and React
// still takes over on the client. With `Accept: text/markdown` the same record
// comes back as compact Markdown for agents.
//
// Failure path: any error or a slow database answer returns the plain shell
// with `Cache-Control: no-store`, which is exactly what the site served before
// this function existed. Never a text error page.

import { readFile } from 'fs/promises'
import { getMemberPage, getRollCallPage, getBillPage, billPath } from './_lib/pages.js'
import { renderPage } from './_lib/renderPage.js'
import { renderMarkdown } from './_lib/markdown.js'
import { buildRollCallId, rollCallPath } from './_lib/rollCallResult.js'
import { originFrom } from './_lib/request.js'
import { SITE_ORIGIN as SITE } from './_lib/site.js'

export { originFrom }

const DATA_TIMEOUT_MS = Number(process.env.PRERENDER_TIMEOUT_MS || 5000)
const SHELL_TTL_MS = 5 * 60 * 1000
const PAGE_CACHE = 'public, s-maxage=900, stale-while-revalidate=86400'
// Not-found and skipped bills change rarely; cache them as long as pages.
const SKIP_CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400'

let shellCache = { origin: null, html: null, fetchedAt: 0 }

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function readBuiltShell() {
  // The built shell is bundled into the function (vercel.json includeFiles),
  // so production and previews never depend on a network hop or on
  // deployment protection to find their own asset tags.
  for (const rel of ['../dist/index.html', './dist/index.html']) {
    try {
      const html = await readFile(new URL(rel, import.meta.url), 'utf8')
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
  if (q.kind === 'member' && q.id) return { kind: 'member', id: String(q.id).toUpperCase(), path: `/politician/${String(q.id).toUpperCase()}` }
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

async function loadData(target) {
  if (target.kind === 'member') return getMemberPage(target.id)
  if (target.kind === 'bill') return getBillPage(target.id)
  return getRollCallPage(target.id)
}

function wantsMarkdown(req) {
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

    if (markdown) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
      res.setHeader('Cache-Control', PAGE_CACHE)
      res.setHeader('Vary', 'Accept')
      res.setHeader('Link', `<${SITE}${target.path}>; rel="canonical"`)
      if (!data.indexable) res.setHeader('X-Robots-Tag', 'noindex')
      return res.end(renderMarkdown(data))
    }

    if (!shell) throw new Error('no shell')

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
    return sendHtml(res, shell, 200, 'no-store', { 'X-BallotWatch-Prerender': 'fallback' })
  }
}

export const config = { runtime: 'nodejs', maxDuration: 15 }
