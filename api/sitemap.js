// Generated sitemaps on the canonical domain.
//   /sitemap.xml           -> index pointing at the parts below
//   /sitemap-pages.xml     -> the homepage, /members, /this-week, /developers and the static info pages, minus
//                             the ones that need an account (shared/access.js)
//   /sitemap-members.xml   -> every member with at least one recorded vote; each <lastmod> is that
//                             member's latest recorded vote (member_last_vote_dates RPC)
//   /sitemap-records.xml   -> the "record in 60 seconds" card for the same members, same <lastmod>
//                             Above 50,000 URLs (or 45 MB) these split into members-1..N / records-1..N.
//                             If the RPC fails, both parts are still served, without <lastmod>.
//   /sitemap-votes.xml     -> every roll call with a sane, non-empty tally
//   /sitemap-bills.xml     -> every bill with a recorded vote and a real title
// Reads with the service role in pages of 1,000 (the PostgREST cap). Each
// part is memoized per instance for 15 minutes and the handler is rate
// limited per IP, so cache-busting query strings cannot turn it into a
// full-table-read amplifier.

import { supabaseAdmin } from './_lib/supabase.js'
import { isGatedPath } from '../shared/access.js'
import { buildSitemapIndex, buildUrlset, toDateOnly, chunk, SITEMAP_PART_SIZE } from './_lib/sitemapXml.js'
import { parseRollCallId, rollCallPath, saneTally, tallyFromStats } from './_lib/rollCallResult.js'
import { isPlaceholderTitle } from './_lib/indexGate.js'
import { billPath } from './_lib/pages.js'
import { SITE_ORIGIN } from './_lib/site.js'
import { checkRateLimit } from './_lib/rateLimit.js'
import { recordPath } from '../shared/memberRecord.js'
import { memberPath } from '../shared/memberSlug.js'
import { clientIp, hashIp } from './_lib/auth.js'
import { STATIC_PAGES } from './_lib/staticPages.js'

const PAGE = 1000
const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400'
const MEMO_TTL_MS = 15 * 60 * 1000
const PER_MINUTE = Number(process.env.SITEMAP_PER_MINUTE || 12)
// Defensive: sitemaps.org caps a file at 50 MB uncompressed; stay well under it.
const MAX_PART_BYTES = 45 * 1024 * 1024

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

// The homepage changes with every recorded vote; the info pages rarely.
export async function pageEntries() {
  const lastmod = await latestVoteDate()
  return [
    { path: '/', lastmod, changefreq: 'daily', priority: 1.0 },
    { path: '/members', lastmod, changefreq: 'daily', priority: 0.8 },
    // This week lists the latest recorded votes, so it moves with them.
    { path: '/this-week', lastmod, changefreq: 'daily', priority: 0.7 },
    // Static developer text: no honest modified date, so none is claimed.
    { path: '/developers', lastmod: null, changefreq: 'monthly', priority: 0.6 },
    ...Object.entries(STATIC_PAGES).filter(([path]) => !isGatedPath(path)).map(([path, p]) => ({
      path,
      lastmod: null,
      changefreq: p.changefreq,
      priority: p.priority,
    })),
  ]
}

// Each member's latest recorded vote date (YYYY-MM-DD), computed in the
// database (GROUP BY on votes) so the votes table never leaves Postgres.
// Paged by 1,000 because PostgREST caps the rows per response.
async function memberLastVoteDates() {
  const out = new Map()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin.rpc('member_last_vote_dates').order('politician_id').range(from, from + PAGE - 1)
    if (error) throw new Error(`member_last_vote_dates: ${error.message}`)
    for (const r of data || []) {
      const d = toDateOnly(r.last_voted_at)
      if (r.politician_id && d) out.set(r.politician_id, d)
    }
    if (!data || data.length < PAGE) break
  }
  return out
}

// Every politician with at least one recorded vote (the member pages' index
// gate), plus a Map of politician_id -> latest vote date. <lastmod> is
// optional, so a failed lookup degrades to an empty Map (no dates) rather
// than failing the part; no other date is ever substituted.
async function membersWithVotes() {
  let lastmodOk = true
  const [politicians, stats, lastmodById] = await Promise.all([
    fetchAll('politicians', 'id, name'),
    fetchAll('member_stats', 'politician_id, total_votes', (q) => q.gt('total_votes', 0), 'politician_id'),
    memberLastVoteDates().catch((err) => {
      console.warn('[sitemap] member lastmod unavailable:', err.message)
      lastmodOk = false
      return new Map()
    }),
  ])
  const withVotes = new Set(stats.map((s) => s.politician_id))
  return { members: politicians.filter((p) => withVotes.has(p.id)), lastmodById, lastmodOk }
}

// One read per memo window, shared by the members part, the records part and the index.
// The promise is memoized so the index's concurrent members/records reads share one fetch.
let membersMemo = { promise: null, at: 0 }
function membersWithVotesMemo() {
  if (membersMemo.promise && Date.now() - membersMemo.at < MEMO_TTL_MS) return membersMemo.promise
  const promise = membersWithVotes()
  const memo = { promise, at: Date.now() }
  membersMemo = memo
  // A failed or degraded read is not kept, so the next build retries.
  const drop = () => { if (membersMemo === memo) membersMemo = { promise: null, at: 0 } }
  promise.then((v) => { if (!v.lastmodOk) drop() }, drop)
  return promise
}

function memberLikeEntries({ members, lastmodById }, toPath) {
  return members.map((p) => ({ path: toPath(p.id, p.name), lastmod: lastmodById.get(p.id) || null, changefreq: 'weekly' }))
}

// <loc> values are the slugged canonical URLs (/politician/P000197-nancy-pelosi).
export async function memberEntries() {
  return memberLikeEntries(await membersWithVotesMemo(), memberPath)
}

// Same members and the same gate as the member pages (at least one vote).
export async function recordEntries() {
  return memberLikeEntries(await membersWithVotesMemo(), recordPath)
}

// Chunks of at most SITEMAP_PART_SIZE URLs, halved further while a chunk's
// XML would exceed maxBytes. Always at least one (possibly empty) chunk.
export function splitUrlsetParts(entries, maxBytes = MAX_PART_BYTES) {
  const out = []
  const fit = (piece) => {
    if (piece.length <= 1 || Buffer.byteLength(buildUrlset(SITE_ORIGIN, piece)) <= maxBytes) { out.push(piece); return }
    const mid = Math.ceil(piece.length / 2)
    fit(piece.slice(0, mid))
    fit(piece.slice(mid))
  }
  for (const piece of entries.length ? chunk(entries, SITEMAP_PART_SIZE) : [[]]) fit(piece)
  return out
}

async function memberLikeParts(kind) {
  return splitUrlsetParts(kind === 'members' ? await memberEntries() : await recordEntries())
}

function maxLastmod(entries) {
  let max = null
  for (const e of entries) if (e.lastmod && (!max || e.lastmod > max)) max = e.lastmod
  return max
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
    const [lastmod, billParts, memberParts, recordParts] = await Promise.all([
      latestVoteDate(), billPartCount(), memberLikeParts('members'), memberLikeParts('records'),
    ])
    // Members and records are dated by the newest member lastmod (omitted if none has one).
    const memberLastmod = maxLastmod(memberParts.flat())
    const named = (name, pieces) => (pieces.length === 1 ? [{ name, lastmod: memberLastmod }] : pieces.map((_, i) => ({ name: `${name}-${i + 1}`, lastmod: memberLastmod })))
    const parts = [{ name: 'pages', lastmod }, ...named('members', memberParts), ...named('records', recordParts), { name: 'votes', lastmod }]
    if (billParts === 1) parts.push({ name: 'bills', lastmod })
    else for (let i = 1; i <= billParts; i += 1) parts.push({ name: `bills-${i}`, lastmod })
    return buildSitemapIndex(SITE_ORIGIN, parts)
  }
  if (part === 'pages') return buildUrlset(SITE_ORIGIN, await pageEntries())
  const memberLike = /^(members|records)(?:-(\d+))?$/.exec(part)
  if (memberLike) {
    const pieces = await memberLikeParts(memberLike[1])
    const n = memberLike[2] ? Number(memberLike[2]) : 1
    if (n < 1 || n > pieces.length) return null
    return buildUrlset(SITE_ORIGIN, pieces[n - 1])
  }
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
  membersMemo = { promise: null, at: 0 }
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
