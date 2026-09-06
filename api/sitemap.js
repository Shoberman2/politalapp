// Generated sitemaps on the canonical domain.
//   /sitemap.xml           -> index pointing at the parts below
//   /sitemap-members.xml   -> every member with at least one recorded vote
//   /sitemap-votes.xml     -> every roll call with a sane, non-empty tally
//   /sitemap-bills.xml     -> every bill with a recorded vote and a real title
// Reads with the service role in pages of 1,000 (the PostgREST cap). Each
// part is memoized per instance for 15 minutes and the handler is rate
// limited per IP, so cache-busting query strings cannot turn it into a
// full-table-read amplifier.

import { supabaseAdmin } from './_lib/supabase.js'
import { buildSitemapIndex, buildUrlset, toDateOnly, chunk, SITEMAP_PART_SIZE } from './_lib/sitemapXml.js'
import { parseRollCallId, rollCallPath, saneTally, tallyFromStats } from './_lib/rollCallResult.js'
import { isPlaceholderTitle } from './_lib/indexGate.js'
import { billPath } from './_lib/pages.js'
import { SITE_ORIGIN } from './_lib/site.js'
import { checkRateLimit } from './_lib/rateLimit.js'
import { clientIp, hashIp } from './_lib/auth.js'

const PAGE = 1000
const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400'
const MEMO_TTL_MS = 15 * 60 * 1000
const PER_MINUTE = Number(process.env.SITEMAP_PER_MINUTE || 12)

const memo = new Map()

async function fetchAll(table, columns, modify, orderBy = 'id') {
  const out = []
  for (let from = 0; ; from += PAGE) {
    let q = supabaseAdmin.from(table).select(columns).order(orderBy).range(from, from + PAGE - 1)
    if (modify) q = modify(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return out
}

async function latestVoteDate() {
  const { data } = await supabaseAdmin.from('roll_calls').select('voted_at').not('voted_at', 'is', null).order('voted_at', { ascending: false }).limit(1)
  return toDateOnly(data?.[0]?.voted_at)
}

export async function memberEntries() {
  const [politicians, stats, lastmod] = await Promise.all([
    fetchAll('politicians', 'id'),
    fetchAll('member_stats', 'politician_id, total_votes', (q) => q.gt('total_votes', 0), 'politician_id'),
    latestVoteDate(),
  ])
  const withVotes = new Set(stats.map((s) => s.politician_id))
  return politicians.filter((p) => withVotes.has(p.id)).map((p) => ({ path: `/politician/${p.id}`, lastmod, changefreq: 'weekly' }))
}

export async function voteEntries() {
  const [calls, stats] = await Promise.all([
    fetchAll('roll_calls', 'id, voted_at'),
    fetchAll('roll_call_stats', 'roll_call_id, dem_yea, dem_nay, rep_yea, rep_nay, ind_yea, ind_nay', null, 'roll_call_id'),
  ])
  const statsById = new Map(stats.map((s) => [s.roll_call_id, s]))
  const entries = []
  for (const c of calls) {
    const meta = parseRollCallId(c.id)
    if (!meta) continue
    const t = tallyFromStats(statsById.get(c.id))
    if (!saneTally(t.yea, t.nay, meta.chamber)) continue
    entries.push({ path: rollCallPath(c.id), lastmod: toDateOnly(c.voted_at), changefreq: 'monthly' })
  }
  return entries
}

export async function billEntries() {
  const calls = await fetchAll('roll_calls', 'bill_id, voted_at', (q) => q.not('bill_id', 'is', null))
  const lastmodById = new Map()
  for (const c of calls) {
    const d = toDateOnly(c.voted_at)
    const prev = lastmodById.get(c.bill_id)
    if (!prev || (d && d > prev)) lastmodById.set(c.bill_id, d || prev || null)
  }
  const ids = [...lastmodById.keys()]
  const entries = []
  for (const group of chunk(ids, 200)) {
    const { data, error } = await supabaseAdmin.from('bills').select('id, title').in('id', group)
    if (error) throw new Error(`bills: ${error.message}`)
    for (const b of data || []) {
      if (isPlaceholderTitle(b.title)) continue
      const p = billPath(b.id)
      if (p) entries.push({ path: p, lastmod: lastmodById.get(b.id), changefreq: 'weekly' })
    }
  }
  return entries
}

let billsMemo = { entries: null, at: 0 }
async function billEntriesMemo() {
  if (billsMemo.entries && Date.now() - billsMemo.at < MEMO_TTL_MS) return billsMemo.entries
  const entries = await billEntries()
  billsMemo = { entries, at: Date.now() }
  return entries
}

async function billPartCount() {
  // Distinct bills with a real title, which is what the bills part contains.
  const entries = await billEntriesMemo()
  return Math.max(1, Math.ceil(entries.length / SITEMAP_PART_SIZE))
}

export async function buildPart(part) {
  if (!part) {
    const [lastmod, billParts] = await Promise.all([latestVoteDate(), billPartCount()])
    const parts = [{ name: 'members', lastmod }, { name: 'votes', lastmod }]
    if (billParts === 1) parts.push({ name: 'bills', lastmod })
    else for (let i = 1; i <= billParts; i += 1) parts.push({ name: `bills-${i}`, lastmod })
    return buildSitemapIndex(SITE_ORIGIN, parts)
  }
  if (part === 'members') return buildUrlset(SITE_ORIGIN, await memberEntries())
  if (part === 'votes') return buildUrlset(SITE_ORIGIN, await voteEntries())
  if (/^bills(-\d+)?$/.test(part)) {
    const n = part === 'bills' ? 1 : Number(part.split('-')[1])
    const all = await billEntriesMemo()
    if (n < 1 || n > Math.max(1, Math.ceil(all.length / SITEMAP_PART_SIZE))) return null
    return buildUrlset(SITE_ORIGIN, all.slice((n - 1) * SITEMAP_PART_SIZE, n * SITEMAP_PART_SIZE))
  }
  return null
}

export function _resetSitemapMemo() {
  memo.clear()
  billsMemo = { entries: null, at: 0 }
}

export default async function handler(req, res) {
  const part = req.query?.part ? String(req.query.part) : ''
  const rl = await checkRateLimit({ id: `sitemap:${hashIp(clientIp(req))}`, perMinute: PER_MINUTE })
  if (!rl.allowed) {
    res.statusCode = 429
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Retry-After', String(rl.retryAfter || 60))
    return res.end('Too many sitemap requests\n')
  }
  try {
    const cached = memo.get(part)
    let xml = cached && Date.now() - cached.at < MEMO_TTL_MS ? cached.xml : null
    if (!xml) {
      xml = await buildPart(part)
      if (xml) memo.set(part, { xml, at: Date.now() })
    }
    if (!xml) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      return res.end('Not found\n')
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', CACHE)
    res.end(xml)
  } catch (err) {
    console.error('[sitemap] failed:', err.message)
    res.statusCode = 503
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Retry-After', '60')
    res.end('Sitemap temporarily unavailable\n')
  }
}

export const config = { runtime: 'nodejs', maxDuration: 30 }
