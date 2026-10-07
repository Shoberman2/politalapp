import { supabase } from '../lib/supabase'

// Reads the most recent recorded floor votes straight from the database for the
// front page. Deliberately conservative: it only surfaces fields we can stand
// behind. Bill *titles* in our table are often placeholder stubs ("HR 915") and
// some ETL'd tallies are corrupt (party columns double-counted), so we show the
// bill *number* (not title) and a Yea/Nay count ONLY when it passes a sanity
// check against the chamber size. Nothing here is fabricated; missing data is
// simply omitted.

export const CHAMBER_SIZE = { House: 435, Senate: 100 }

export const BILL_TYPE_LABELS = {
  hr: 'H.R.', s: 'S.', hres: 'H.Res.', sres: 'S.Res.',
  hjres: 'H.J.Res.', sjres: 'S.J.Res.', hconres: 'H.Con.Res.', sconres: 'S.Con.Res.',
}

// "house-119-2-225" -> { chamber:'House', congress:119, session:2, number:225 }
export function parseRollCallId(id) {
  const m = /^([a-z]+)-(\d+)-(\d+)-(\d+)$/.exec(id || '')
  if (!m) return null
  return {
    chamberKey: m[1],
    chamber: m[1] === 'senate' ? 'Senate' : 'House',
    congress: Number(m[2]),
    session: Number(m[3]),
    number: Number(m[4]),
  }
}

// Canonical app path for a roll call: /vote/119/house/2/225
export function rollCallHref(id) {
  const p = parseRollCallId(id)
  return p ? `/vote/${p.congress}/${p.chamberKey}/${p.session}/${p.number}` : null
}

// "119-hr-7401" -> { display:'H.R. 7401', href:'/bill/119/hr/7401' }
export function parseBill(billId) {
  if (!billId) return null
  const parts = billId.split('-')
  if (parts.length < 3) return null
  const [congress, type, ...rest] = parts
  const number = rest.join('-')
  return {
    display: `${BILL_TYPE_LABELS[type] || type.toUpperCase()} ${number}`,
    href: `/bill/${congress}/${type}/${number}`,
  }
}

// Result word, derived only from a tally we trust. Uses the real thresholds:
// cloture needs 60 in the Senate, suspension of the rules needs two-thirds,
// everything else is a simple majority. Returns null when we shouldn't assert.
// Mirrors api/_lib/rollCallResult.js deriveResult; keep the two in step.
export function deriveResult(question, yea, nay, chamber = null, description = null) {
  if (yea == null || nay == null) return null
  const q = String(question || '').toLowerCase()
  const text = `${q} ${String(description || '').toLowerCase()}`
  const total = yea + nay
  const twoThirds = total > 0 && yea / total >= 2 / 3
  // The description says what a cloture motion is about (a nomination or a
  // bill); for every other question only the question text decides.
  const nominationCloture = /nominat|confirm/.test(text)
  const nominationQuestion = /nominat|confirm/.test(q)
  if (q.includes('cloture')) {
    if (yea >= 60) return 'Cloture invoked'
    if (nominationCloture) return yea > nay ? 'Cloture invoked' : 'Cloture rejected'
    if (yea <= nay) return 'Cloture rejected'
    return null
  }
  if (q.includes('override') || q.includes('veto')) return twoThirds ? 'Veto overridden' : 'Veto sustained'
  if (q.includes('treaty') || q.includes('ratification')) return twoThirds ? 'Ratified' : 'Not ratified'
  if (q.includes('suspend')) return twoThirds ? 'Passed' : 'Failed'
  if (q.includes('waive') && chamber === 'Senate') return yea >= 60 ? 'Motion agreed to' : 'Motion rejected'
  if (/\bmotion\b/.test(q) || q.includes('proceed')) return yea > nay ? 'Motion agreed to' : 'Motion rejected'
  if (nominationQuestion) return yea > nay ? 'Confirmed' : 'Rejected'
  if (yea === nay) return 'Failed on a tie'
  return yea > nay ? 'Passed' : 'Failed'
}

// Reject impossible totals (double-counted ETL rows) and empty rows.
export function sane(yea, nay, chamber) {
  const total = yea + nay
  return total > 0 && total <= (CHAMBER_SIZE[chamber] || 435)
}

function tallyFor(stats, chamber) {
  if (!stats) return { yea: null, nay: null, valid: false }
  const yea = (stats.dem_yea || 0) + (stats.rep_yea || 0) + (stats.ind_yea || 0)
  const nay = (stats.dem_nay || 0) + (stats.rep_nay || 0) + (stats.ind_nay || 0)
  return sane(yea, nay, chamber) ? { yea, nay, valid: true } : { yea: null, nay: null, valid: false }
}

// `roll_call_stats` is written by a batch ETL that lags the newest roll calls —
// right now it holds nothing for anything recent — which left the front page
// with no tallies at all (and the "See every vote" step stuck on skeletons).
// The per-member `votes` table IS populated for those same roll calls, so count
// Yea/Nay straight from it as a fallback. `head: true` asks Postgres for a count
// and zero rows, so this costs two tiny requests per roll call rather than 435
// rows of payload. Still the real record, still sanity-checked the same way.
// Enough to fill the front page's five feed rows and three-row vote mock even
// when several candidates come back empty. Each one is two header-only
// requests, issued in parallel.
const TALLY_FALLBACK_LIMIT = 8

async function countPosition(rollCallId, position) {
  const { count, error } = await supabase
    .from('votes')
    .select('id', { count: 'exact', head: true })
    .eq('roll_call_id', rollCallId)
    .eq('position', position)
  return error ? null : (count ?? null)
}

async function tallyFromVotes(rollCallId, chamber) {
  const [yea, nay] = await Promise.all([
    countPosition(rollCallId, 'Yea'),
    countPosition(rollCallId, 'Nay'),
  ])
  // Nothing ingested for this roll call (Senate isn't covered member-level yet)
  // — return null rather than assert a 0–0 tally.
  if (yea == null || nay == null || !sane(yea, nay, chamber)) return null
  return { yea, nay }
}

/**
 * Returns { votes: [...], recordedThrough: 'YYYY-MM-DD' | null } or null.
 * `votes` carries only presentable, trustworthy fields.
 */
// `voted_at` ships with its own migration. Until that lands in a given
// environment the column is simply absent, and PostgREST answers with an
// undefined-column error rather than ignoring the ordering.
const isMissingVotedAt = (error) =>
  !!error && (error.code === '42703' || error.code === 'PGRST204' ||
    /voted_at/.test(error.message || ''))

async function fetchRecentFloorVotes(fetchCount) {
  try {
    // Order by when the vote happened, NOT by created_at, which is when we
    // ingested the row. Those agree only while ingestion runs forward in time:
    // a history backfill writes months-old roll calls with fresh timestamps,
    // which is exactly how old procedural motions climbed to the top of this
    // feed. Roll calls we hold no votes for have no date and sort last, so
    // they drop out of the feed instead of crowding it.
    let { data: calls, error } = await supabase
      .from('roll_calls')
      .select('id, bill_id, question, description, created_at, voted_at')
      .order('voted_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(fetchCount)

    if (isMissingVotedAt(error)) {
      ;({ data: calls, error } = await supabase
        .from('roll_calls')
        .select('id, bill_id, question, description, created_at')
        .order('created_at', { ascending: false })
        .limit(fetchCount))
    }

    if (error || !calls?.length) return null

    const ids = calls.map((c) => c.id)
    const billIds = [...new Set(calls.map((c) => c.bill_id).filter(Boolean))]

    const [statsSettled, freshSettled] = await Promise.allSettled([
      supabase
        .from('roll_call_stats')
        .select('roll_call_id, dem_yea, dem_nay, rep_yea, rep_nay, ind_yea, ind_nay')
        .in('roll_call_id', ids),
      supabase.from('votes').select('voted_at').order('voted_at', { ascending: false }).limit(1),
    ])

    const statsMap = new Map()
    if (statsSettled.status === 'fulfilled' && Array.isArray(statsSettled.value.data)) {
      for (const s of statsSettled.value.data) statsMap.set(s.roll_call_id, s)
    }

    let recordedThrough = null
    if (freshSettled.status === 'fulfilled') {
      recordedThrough = freshSettled.value.data?.[0]?.voted_at ?? null
    }

    const votes = calls.map((c) => {
      const meta = parseRollCallId(c.id)
      const chamber = meta?.chamber || null
      const { yea, nay } = tallyFor(statsMap.get(c.id), chamber)
      return {
        id: c.id,
        chamber,
        number: meta?.number ?? null,
        question: c.question || null,
        // Nomination/procedural descriptions carry the real human substance.
        description: c.description || null,
        bill: parseBill(c.bill_id),
        votedAt: c.voted_at || null,
        yea,
        nay,
        result: deriveResult(c.question, yea, nay, chamber, c.description),
      }
    })

    // Fill in tallies the stats table is missing, for just the handful of votes
    // the page will actually show. Bill votes go first: they're what the front
    // page leads with, and they're the ones the `votes` table actually covers
    // (nominations and other bill-less roll calls are mostly Senate, which
    // isn't ingested member-level yet, so budget spent on them comes back empty).
    const missing = votes.filter((v) => v.yea == null)
    const needsTally = [
      ...missing.filter((v) => v.bill),
      ...missing.filter((v) => !v.bill && v.description),
    ]
    await Promise.all(needsTally.slice(0, TALLY_FALLBACK_LIMIT).map(async (v) => {
      const t = await tallyFromVotes(v.id, v.chamber)
      if (!t) return
      v.yea = t.yea
      v.nay = t.nay
      v.result = deriveResult(v.question, t.yea, t.nay, v.chamber, v.description)
    }))

    return { votes, recordedThrough }
  } catch (err) {
    console.warn('[FloorVotes] query failed:', err)
    return null
  }
}

// The landing and /offices both ask for the latest votes; share one request
// per fetchCount for 60 seconds. A failed or empty result is not kept, so the
// next caller retries.
const FLOOR_VOTES_TTL_MS = 60 * 1000
const floorVotesCache = new Map()

export function getRecentFloorVotes(fetchCount = 16) {
  const hit = floorVotesCache.get(fetchCount)
  if (hit && Date.now() - hit.at < FLOOR_VOTES_TTL_MS) return hit.promise
  const promise = fetchRecentFloorVotes(fetchCount)
  const entry = { promise, at: Date.now() }
  floorVotesCache.set(fetchCount, entry)
  const drop = () => { if (floorVotesCache.get(fetchCount) === entry) floorVotesCache.delete(fetchCount) }
  promise.then((data) => { if (!data?.votes?.length) drop() }, drop)
  return promise
}

/** Test hook: forget every cached result. */
export function _resetFloorVotesCache() {
  floorVotesCache.clear()
}

// A vote is worth a row when it has a description, a question or a bill.
export function hasSomethingToShow(v) {
  return !!v && !!(v.description || v.question || v.bill)
}

// The headline vote shared by the landing and /offices. Only votes that link
// to a roll-call page (a parseable id) and have something to show (a
// description, a question or a bill) qualify; of those, the latest with a bill
// and a real tally wins, else the latest one. Never invented; null when none.
export function pickHeadlineVote(votes) {
  const usable = (Array.isArray(votes) ? votes : [])
    .filter((v) => hasSomethingToShow(v) && rollCallHref(v.id))
  return usable.find((v) => v.bill && v.yea != null && v.nay != null) || usable[0] || null
}

// The "Re" and "Vote" lines of an office inbox row for one vote:
// re = the bill number, else "<Chamber> Roll Call <n>"; vote = "<yea>–<nay>"
// plus " · <result>" when there is one. Either may be null when the record
// does not say.
export function inboxFields(vote) {
  if (!vote) return { re: null, vote: null }
  const rollLabel = vote.number != null ? `Roll Call ${vote.number}` : null
  const re = vote.bill?.display || [vote.chamber, rollLabel].filter(Boolean).join(' ') || null
  const tally = vote.yea != null && vote.nay != null ? `${vote.yea}–${vote.nay}` : null
  return { re, vote: [tally, vote.result].filter(Boolean).join(' · ') || null }
}
