// "Record in 60 seconds": one shareable card per member at
// /politician/:bioguideId/record.
//
// Nonpartisan by construction. Every member gets the same template and the
// same facts, computed the same way: no adjectives, no scores, no ratings, and
// no editorial choice of "key votes". The vote list is simply the member's ten
// most recent recorded votes. Every number comes straight from the record:
//
//   - Votes cast / not voting: member_stats for the member's latest Congress
//     (the ETL tallies Yea, Nay, Present and Not Voting rows per member; the
//     not-voting share is the same not_voting / total the attendance stat in
//     api/v1/stats.js uses).
//   - Each vote's result: derived from the roll call's tally and question with
//     the thresholds in api/_lib/rollCallResult.js, and only when the tally
//     passes the sanity check. Otherwise no result is shown.
//
// Deliberately left off: the party-majority match rate (a score, and its
// methodology is not published on /methodology), sponsored-bill counts (the
// sponsor columns are populated for only part of the bills table, so a count
// would be wrong for some members and not others), and any campaign-finance
// data (contributor names must never reach a share surface).
//
// This module is pure and is used by the server loader (api/_lib/pages.js),
// the prerendered HTML and Markdown, and the React page, so all of them show
// exactly the same facts.

import { parseRollCallId, rollCallPath, saneTally, tallyFromStats, deriveResult, resultKind, voteSourceUrl } from '../api/_lib/rollCallResult.js'
import { isPlaceholderTitle } from '../api/_lib/indexGate.js'
import { isAtLargeState, isDelegateJurisdiction } from './atLargeStates.js'

export const RECORD_VOTE_LIMIT = 10

const BILL_TYPE_LABELS = {
  hr: 'H.R.', s: 'S.', hjres: 'H.J.Res.', sjres: 'S.J.Res.',
  hconres: 'H.Con.Res.', sconres: 'S.Con.Res.', hres: 'H.Res.', sres: 'S.Res.',
}

export function recordPath(bioguideId) {
  return `/politician/${String(bioguideId || '').toUpperCase()}/record`
}

export function recordBill(billId) {
  const m = /^(\d+)-([a-z]+)-(\d+)$/i.exec(String(billId || ''))
  if (!m) return null
  const type = m[2].toLowerCase()
  return {
    id: String(billId).toLowerCase(),
    label: `${BILL_TYPE_LABELS[type] || type.toUpperCase()} ${m[3]}`,
    path: `/bill/${m[1]}/${type}/${m[3]}`,
  }
}

// The four positions the clerks record. A few rows carry the synonyms the
// clerks also print ("Aye", "Yes", "No"); they mean the same thing.
export function normalizePosition(position) {
  const p = String(position || '').trim().toLowerCase()
  if (p === 'yea' || p === 'yes' || p === 'aye') return 'Yea'
  if (p === 'nay' || p === 'no') return 'Nay'
  if (p === 'present') return 'Present'
  if (p === 'not voting') return 'Not Voting'
  return position || null
}

// Votes cast / not voting for one Congress, from a member_stats row.
// Returns null when the row is missing or empty, never zeros.
export function shapeRecordStats(stats) {
  if (!stats) return null
  const total = Number(stats.total_votes) || 0
  if (total <= 0) return null
  const notVoting = Number(stats.not_voting_count) || 0
  const yea = Number(stats.yea_count) || 0
  const nay = Number(stats.nay_count) || 0
  const present = Number(stats.present_count) || 0
  return {
    congress: Number(stats.congress) || null,
    total,
    cast: yea + nay + present,
    yea,
    nay,
    present,
    notVoting,
    // One decimal so a small share is never rounded to 0% or 100%.
    notVotingPct: Math.round((notVoting / total) * 1000) / 10,
  }
}

export function shapeRecordVote(v, rollCall, rcStats) {
  const meta = parseRollCallId(v.roll_call_id)
  const question = rollCall?.question || null
  const t = tallyFromStats(rcStats)
  const trusted = rcStats && meta ? saneTally(t.yea, t.nay, meta.chamber) : false
  const result = trusted ? deriveResult(question, t.yea, t.nay, meta.chamber, rollCall?.description || null) : null
  const billId = v.bill_id || v.bills?.id || rollCall?.bill_id || null
  const bill = billId ? recordBill(billId) : null
  const rawTitle = v.bills?.title ?? null
  // The official record derived from the roll-call id; a stored URL is only
  // the fallback, and only http(s) links ever become hrefs.
  const sourceUrl = voteSourceUrl(v.roll_call_id, v.source_url)
  return {
    roll_call_id: v.roll_call_id,
    path: rollCallPath(v.roll_call_id),
    chamber: meta?.chamber || null,
    roll: meta?.roll ?? null,
    voted_at: v.voted_at || null,
    question,
    bill: bill ? { ...bill, title: rawTitle && !isPlaceholderTitle(rawTitle) ? rawTitle : null } : null,
    position: normalizePosition(v.position),
    result,
    resultKind: resultKind(result),
    tally: trusted ? { yea: t.yea, nay: t.nay } : null,
    source_url: /^https?:\/\//i.test(String(sourceUrl || '')) ? sourceUrl : null,
  }
}

// The term for the member's latest Congress: the open term first, then the
// newest. member_congress_terms has one row per Congress served.
function currentTermOf(terms) {
  const list = [...(terms || [])].sort((a, b) =>
    (Number(b.congress) || 0) - (Number(a.congress) || 0) || String(b.term_start || '').localeCompare(String(a.term_start || '')))
  return list.find((t) => !t.term_end) || list[0] || null
}

export function congressGovMemberUrl(id) { return `https://www.congress.gov/member/${id}` }
export function bioguideUrl(id) { return `https://bioguide.congress.gov/search/bio/${id}` }

// Where the roll calls themselves are published.
export function chamberVotesUrl(chamber) {
  return chamber === 'senate'
    ? 'https://www.senate.gov/legislative/votes_new.htm'
    : 'https://clerk.house.gov/Votes'
}

/**
 * Shape the raw rows into the record card. Inputs are plain rows:
 *   member         politicians row (id, name, chamber, state, district, party, photo_url)
 *   terms          member_congress_terms rows
 *   stats          member_stats row for the latest Congress, or null
 *   votes          the member's most recent votes rows, newest first
 *   voteCount      exact count of the member's recorded votes
 *   rollCalls      roll_calls rows for those votes (id, question, description, bill_id)
 *   rollCallStats  roll_call_stats rows for those votes
 *   updatedAt      the ETL's last successful run
 */
export function shapeMemberRecord({ member, terms = [], stats = null, votes = [], voteCount = null, rollCalls = [], rollCallStats = [], updatedAt = null }) {
  if (!member) return null
  const id = String(member.id).toUpperCase()
  const term = currentTermOf(terms)
  const rcById = new Map((rollCalls || []).map((r) => [r.id, r]))
  const statsById = new Map((rollCallStats || []).map((r) => [r.roll_call_id, r]))

  const recentVotes = (votes || [])
    .filter((v) => v && v.roll_call_id)
    .slice(0, RECORD_VOTE_LIMIT)
    .map((v) => shapeRecordVote(v, rcById.get(v.roll_call_id), statsById.get(v.roll_call_id)))

  const count = voteCount ?? recentVotes.length
  const district = member.chamber === 'house' ? houseDistrict(member.state, member.district ?? term?.district ?? null) : null
  const recordStats = shapeRecordStats(stats)

  return {
    kind: 'record',
    id,
    name: member.name,
    chamber: member.chamber,
    state: member.state,
    district: district == null || district === '' ? null : String(district),
    party: member.party,
    photo_url: member.photo_url || null,
    congress: recordStats?.congress || Number(term?.congress) || null,
    servingSince: term?.term_start || null,
    stats: recordStats,
    voteCount: count,
    recentVotes,
    // Fewer recorded votes than the card holds: say so instead of padding.
    thin: count < RECORD_VOTE_LIMIT,
    sources: {
      congressGov: congressGovMemberUrl(id),
      bioguide: bioguideUrl(id),
      chamberVotes: chamberVotesUrl(member.chamber),
    },
    updatedAt: updatedAt || null,
  }
}

// ---------- wording shared by the HTML, Markdown and React renderers ----------

export function partyLetter(party) {
  const s = String(party || '')
  if (/^dem/i.test(s) || s === 'D') return 'D'
  if (/^rep/i.test(s) || s === 'R') return 'R'
  if (/^ind/i.test(s) || s === 'I') return 'I'
  return s.slice(0, 1).toUpperCase()
}

// A House seat's district number, or null for at-large seats and delegates:
// the terms table stores those as "0", which must never render as "district 0".
export function houseDistrict(state, district) {
  if (district == null || district === '') return null
  const d = String(district)
  if (d === '0' || d === '00' || isAtLargeState(state) || isDelegateJurisdiction(state)) return null
  return d
}

// The House title for a seat in `state`: delegates for DC and the territories
// (Puerto Rico's is the Resident Commissioner), a Representative everywhere
// else, at-large or not. Never inferred from a missing district number.
export function houseSeatTitle(state) {
  if (String(state || '').toUpperCase() === 'PR') return 'Resident Commissioner'
  return isDelegateJurisdiction(state) ? 'Delegate' : 'Representative'
}

export function recordSeatTitle(r) {
  if (r.chamber === 'senate') return 'Senator'
  return houseSeatTitle(r.state)
}

// "D-CA-11", "R-TX"
export function recordSeatCode(r) {
  const seat = r.chamber === 'house' ? (r.district ? `-${r.district}` : isAtLargeState(r.state) ? '-AL' : '') : ''
  return `${partyLetter(r.party)}-${r.state || ''}${seat}`
}

export function recordHeadline(r) {
  return `${r.name}'s record in 60 seconds`
}

export function ordinalCongress(n) {
  const num = parseInt(n, 10)
  if (Number.isNaN(num)) return String(n ?? '')
  const v = num % 100
  const s = ['th', 'st', 'nd', 'rd']
  return `${num}${s[(v - 20) % 10] || s[v] || s[0]}`
}

export function recordDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

// One factual sentence for meta descriptions and share text.
export function recordSummary(r, stateName = (s) => s) {
  const seat = r.chamber === 'senate'
    ? `U.S. Senator from ${stateName(r.state)}`
    : `U.S. ${recordSeatTitle(r)} for ${stateName(r.state)}${r.district ? ` district ${r.district}` : isAtLargeState(r.state) ? ' (at large)' : ''}`
  const s = r.stats
  const facts = s
    ? `${ordinalCongress(s.congress)} Congress: voted on ${s.cast} of ${s.total} roll calls, not voting on ${s.notVoting}.`
    : (r.voteCount ? `${r.voteCount} recorded votes.` : 'No recorded votes yet.')
  const latest = r.recentVotes.length ? ` The ${r.recentVotes.length} most recent votes, each linked to the official roll call.` : ''
  return `${r.name}, ${seat}. ${facts}${latest}`
}

// The per-member image (api/og.jsx, edge) is not served in production: Vercel
// does not build that .jsx function in this non-Next project (/api/og 404s,
// which is also why api/share.js uses the static card). Until it is fixed,
// record pages point at the same static 1200x630 card so links still unfurl.
// TODOS.md: "Serve the dynamic share image".
export function recordOgImagePath(_id) {
  return '/congress.jpg'
}
