// Tool implementations for the MCP server, kept free of transport code so they
// can be unit-tested and reused by future API routes. Every result carries
// `canonical`, `source_url`, and `data_updated_at` so an agent can cite it.

import { supabaseAdmin } from './supabase.js'
import { getOrCreateExplanation, explanationPayload } from './explanations.js'
import { explanationSourceLine } from '../../shared/billExplainer.js'
import { getMemberPage, getRecordPage, getRollCallPage, getBillPage, getMemberBills as loadMemberBills, billPath, billLabel } from './pages.js'
import { buildRollCallId, parseRollCallId, rollCallPath, voteSourceUrl, deriveResult, saneTally, tallyFromStats } from './rollCallResult.js'
import { geocodeAddress, geocodeZip } from './geocode.js'
import { zipDistricts, zipDistrictsCongress, territoryForZip } from './zipDistricts.js'
import { getDataUpdatedAt } from './etlMeta.js'
import { isPlaceholderTitle } from './indexGate.js'
import { SITE_ORIGIN as SITE, congressGovMemberUrl } from './site.js'
import { loadFloorSchedule, resolveFloorWeeks } from './floorSchedule.js'
import { getRoster, searchRoster, parseMemberQuery, currentCongress, stateCode, partyName } from './roster.js'
import { recordPath, normalizePosition, partyLetter } from '../../shared/memberRecord.js'
import { memberPath, parseMemberSegment } from '../../shared/memberSlug.js'
import { recordMarkdown, billMarkdown } from './markdown.js'

export { currentCongress }

const lastRun = getDataUpdatedAt
const BIOGUIDE = /^[A-Z]\d{6}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const PAGE = 1000

const clamp = (value, min, max, fallback) => Math.min(max, Math.max(min, Number(value) || fallback))
const lower = (s) => (s == null ? null : String(s).toLowerCase())
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th'}`

// A real calendar day in YYYY-MM-DD form ("2026-02-30" is not one).
function realDate(value) {
  const s = String(value)
  if (!DATE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function badDates(pairs) {
  for (const [name, value] of pairs) {
    if (value != null && value !== '' && !realDate(value)) return { error: `${name} must be a real date in YYYY-MM-DD form, e.g. 2026-02-28.` }
  }
  return null
}

// The record holds members' votes only. A tied Senate roll call can be
// decided by the Vice President, whose vote is not stored, so a result
// derived from a tied tally would be a guess (H.R. 1 passed the Senate 51-50
// on a 50-50 tally of senators).
const TIE_NOTE = 'The senators\' votes are tied. The Vice President may have cast the deciding vote, which is not in this record; see source_url for the official result.'
const tiedSenate = (chamber, tally) => lower(chamber) === 'senate' && tally != null && tally.yea != null && tally.yea === tally.nay

// The House elects its Speaker by calling out a name. The record stores only
// Yea, Nay, Present and Not Voting, so every member's choice was loaded as
// "Not Voting"; those positions are withheld instead of repeated.
const NAMED_BALLOT = /election of (the )?speaker/i
const NAMED_BALLOT_NOTE = 'Members voted for a candidate by name. BallotWatch records only Yea, Nay, Present and Not Voting, so each member\'s choice is not in this record; see source_url for the official record.'
const namedBallot = (question) => NAMED_BALLOT.test(String(question || ''))

function bioguide(input) {
  const id = String(input || '').trim().toUpperCase()
  return BIOGUIDE.test(id) ? id : null
}

const badBioguide = (input) => ({ error: `Bioguide ID "${input}" looks wrong; expected a letter and six digits, e.g. P000197. Use search_members to find one by name.` })

function memberSummary(p) {
  return {
    bioguide_id: p.id,
    name: p.name,
    chamber: p.chamber,
    party: p.party,
    state: p.state,
    district: p.district ?? null,
    canonical: `${SITE}${memberPath(p.id, p.name)}`,
    source_url: congressGovMemberUrl(p.id),
  }
}

function billRef(id, title) {
  if (!id) return null
  return { id, label: billLabel(id), title: isPlaceholderTitle(title) ? null : title, canonical: `${SITE}${billPath(id)}` }
}

// A vote row's question, description and bill. `votes.bill_id` is often empty
// even when the roll call names a bill, so the roll call is the source.
async function rollCallContext(ids) {
  const out = new Map()
  const unique = [...new Set((ids || []).filter(Boolean))]
  if (!unique.length) return out
  const { data, error } = await supabaseAdmin.from('roll_calls').select('id, question, description, bill_id, bills:bill_id ( id, title )').in('id', unique)
  if (error) return out
  for (const rc of data || []) out.set(rc.id, rc)
  return out
}

function voteBill(vote, rc) {
  const id = vote.bills?.id || vote.bill?.id || vote.bill_id || rc?.bills?.id || rc?.bill_id || null
  return billRef(id, vote.bills?.title ?? vote.bill?.title ?? rc?.bills?.title ?? null)
}

// The Congress the record is in: the current one, or the one before it in the
// first days of a new Congress (see getRoster).
async function recordCongress() {
  try {
    return (await getRoster()).congress
  } catch {
    return currentCongress()
  }
}

// Is this member in Congress now? null when the roster cannot be read.
async function servingNow(id) {
  try {
    const roster = await getRoster()
    return roster.byId.get(id)?.serving ?? null
  } catch (err) {
    console.warn('[mcp] roster unavailable:', err?.message)
    return null
  }
}

// ---------------------------------------------------------------------------
// find_representatives
// ---------------------------------------------------------------------------

const districtName = (p) => `${p.state}-${p.district === '0' ? 'at large' : p.district}`

async function locate({ address, zip, congress }) {
  if (address) {
    const geo = zip ? await geocodeAddress(address).catch(() => null) : await geocodeAddress(address)
    if (geo?.state) {
      return {
        location: { state: geo.state, district: geo.district, precision: geo.precision, matched_address: geo.matchedAddress || null, note: geo.note || null },
        places: [{ state: geo.state, district: geo.district }],
      }
    }
    if (!zip) return null
  }
  const z = String(zip || '').trim().slice(0, 5)
  if (!/^\d{5}$/.test(z)) return null
  // The table holds one Congress's district lines. For another Congress's
  // roster it would pair a ZIP with the wrong seat, so it is skipped.
  const tableCongress = await zipDistrictsCongress().catch(() => null)
  const all = tableCongress === congress ? await zipDistricts(z).catch(() => null) : null
  if (all?.length) {
    // Districts holding under 1% of the ZIP's land are named, not expanded
    // into members: most are boundary slivers, a few are a real corner of
    // another district or state.
    const main = all.some((p) => p.land_share_pct >= 1) ? all.filter((p) => p.land_share_pct >= 1) : all.slice(0, 1)
    const minor = all.filter((p) => !main.includes(p))
    const states = [...new Set(main.map((p) => p.state))]
    const notes = []
    if (main.length > 1) notes.push(`ZIP ${z} spans ${main.length} congressional districts (${main.map(districtName).join(', ')}). A street address gives the exact one. land_share_pct is each district's share of the ZIP's land area, not of its residents.`)
    if (minor.length) notes.push(`Under 1% of ZIP ${z}'s land also lies in ${minor.map(districtName).join(', ')}; its members are not listed. Someone living there should give a street address.`)
    const location = {
      state: states.length === 1 ? states[0] : null,
      district: main.length === 1 ? main[0].district : null,
      precision: 'zip',
      matched_address: null,
      note: notes.join(' ') || null,
    }
    if (main.length > 1) location.districts = main
    if (minor.length) location.minor_overlaps = minor.map((p) => ({ state: p.state, district: p.district }))
    return { location, places: main }
  }
  // A territory is one at-large seat, so its ZIP range settles it.
  const territory = territoryForZip(z)
  if (territory) {
    return { location: { state: territory, district: '0', precision: 'zip', matched_address: null, note: null }, places: [{ state: territory, district: '0' }] }
  }
  // No Census area for this ZIP (PO boxes, single buildings): use its centroid.
  const geo = await geocodeZip(z).catch((err) => { console.warn('[mcp] ZIP centroid lookup failed:', err?.message); return null })
  if (!geo?.state) return null
  return {
    location: { state: geo.state, district: geo.district, precision: geo.precision, matched_address: geo.matchedAddress || null, note: geo.note || null },
    places: [{ state: geo.state, district: geo.district }],
  }
}

// Which chambers' membership could not be checked against a recent roll call.
function rosterCaveat(roster, chambers) {
  const unknown = chambers.filter((c) => !roster.servingAsOf?.[c])
  if (!unknown.length) return null
  return `The ${unknown.map((c) => (c === 'house' ? 'House' : 'Senate')).join(' and ')} membership could not be checked against a recent roll call, so "serving" here means holding a term in the ${ordinal(roster.congress)} Congress; a member who has since left may still be listed.`
}

export async function findRepresentatives({ address, zip } = {}) {
  const addr = String(address || '').trim()
  const z = String(zip || '').trim()
  if (!addr && !z) return { error: 'Give a street address or a 5-digit ZIP code.' }
  if (!addr && !/^\d{5}(-\d{4})?$/.test(z)) return { error: `"${z}" is not a 5-digit ZIP code. Give a 5-digit ZIP code or a street address.` }
  const congress = currentCongress()
  const [roster, updatedAt] = await Promise.all([getRoster(congress), lastRun()])
  const found = await locate({ address: addr, zip: z, congress: roster.congress })
  if (!found) {
    return { error: addr
      ? 'Could not resolve that location to a state and district. Check the address, or give a 5-digit ZIP code.'
      : `ZIP ${z.slice(0, 5)} could not be matched to a congressional district (it may be a PO-box, military or new ZIP). Give a street address.` }
  }

  const serving = roster.members.filter((m) => m.serving)
  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''))
  const states = [...new Set(found.places.map((p) => p.state))]
  const senators = serving.filter((m) => m.chamber === 'senate' && states.includes(m.state)).sort(byName)

  const representatives = []
  const vacant = []
  for (const place of found.places) {
    const want = place.district == null ? null : String(place.district)
    const seat = serving.filter((m) => m.chamber === 'house' && m.state === place.state
      && (want == null || m.district === want || (want === '0' && m.district == null)))
    if (!seat.length && want != null) vacant.push(districtName(place))
    for (const m of seat.sort(byName)) if (!representatives.includes(m)) representatives.push(m)
  }

  const location = { ...found.location }
  const addNote = (note) => { if (note) location.note = location.note ? `${location.note} ${note}` : note }
  if (vacant.length) addNote(`No sitting House member is recorded for ${vacant.join(', ')}; the seat may be vacant.`)
  addNote(rosterCaveat(roster, ['house', 'senate']))
  return {
    location,
    congress: roster.congress,
    serving_as_of: roster.servingAsOf,
    senators: senators.map(memberSummary),
    representatives: representatives.map(memberSummary),
    data_updated_at: updatedAt,
  }
}

// ---------------------------------------------------------------------------
// search_members
// ---------------------------------------------------------------------------

export async function searchMembers({ query, state, chamber, party, include_former = false, limit = 20 } = {}) {
  const q = String(query || '').trim()
  if (!q && !state && !chamber && !party) return { error: 'Give a name, or filter by state, chamber or party.' }
  if (state && !stateCode(state)) return { error: `"${state}" is not a state or territory. Use its name or two-letter code, e.g. "Ohio" or "OH".` }
  const cap = clamp(limit, 1, 60, 20)
  const [roster, updatedAt] = await Promise.all([getRoster(), lastRun()])
  const opts = { query: q, state, chamber, party, includeFormer: Boolean(include_former) }
  let hits = searchRoster(roster, opts)
  // "Rep. John Kennedy" when the only John Kennedy is a senator: show him and
  // say the title did not fit, instead of nothing or a list of other Kennedys.
  const titled = !chamber && q ? parseMemberQuery(q).chamber : null
  let titleMiss = false
  if (titled && !(hits[0]?.score >= 80)) {
    const any = searchRoster(roster, { ...opts, ignoreTitle: true })
    if (any[0]?.score >= 80 || !hits.length) {
      titleMiss = any.length > 0
      if (titleMiss) hits = any
    }
  }
  const out = {
    query: q || null,
    congress: roster.congress,
    total: hits.length,
    members: hits.slice(0, cap).map(({ member }) => ({ ...memberSummary(member), serving: member.serving })),
    serving_as_of: roster.servingAsOf,
  }
  const notes = []
  if (!hits.length) notes.push(`No member of the ${ordinal(roster.congress)} Congress matches. Only members who have served in this Congress are in the record.`)
  else if (hits.length > cap) notes.push(`Showing ${cap} of ${hits.length}. Narrow with state, chamber or party, or raise limit (max 60).`)
  if (titleMiss) notes.push(`No ${titled === 'house' ? 'House member' : 'senator'} matches that name; these matches are from the other chamber.`)
  const caveat = rosterCaveat(roster, [...new Set(hits.slice(0, cap).map(({ member }) => member.chamber))].filter((c) => c === 'house' || c === 'senate'))
  if (caveat) notes.push(caveat)
  if (notes.length) out.note = notes.join(' ')
  out.data_updated_at = updatedAt
  return out
}

// ---------------------------------------------------------------------------
// get_member, get_member_votes, get_member_record, get_member_bills
// ---------------------------------------------------------------------------

export async function getMember({ bioguide_id }) {
  const m = await getMemberPage(bioguide_id)
  if (!m) return { error: `No member with Bioguide ID ${bioguide_id}. Use search_members to find one by name.` }
  const [context, serving] = await Promise.all([rollCallContext(m.votes.slice(0, 10).map((v) => v.roll_call_id)), servingNow(m.id)])
  return {
    ...memberSummary(m),
    serving,
    photo_url: m.photo_url,
    terms: m.terms,
    stats: m.stats,
    recorded_votes: m.voteCount,
    latest_votes: m.votes.slice(0, 10).map((v) => {
      const rc = context.get(v.roll_call_id)
      return {
        roll_call_id: v.roll_call_id,
        voted_at: v.voted_at,
        question: v.question,
        description: rc?.description || null,
        bill: voteBill(v, rc),
        ...memberPosition(v.question, v.position),
        source_url: v.source_url,
        canonical: `${SITE}${rollCallPath(v.roll_call_id)}`,
      }
    }),
    data_updated_at: m.updatedAt,
  }
}

// A member's position on one roll call; withheld on a named ballot.
function memberPosition(question, position) {
  return namedBallot(question)
    ? { position: null, position_note: NAMED_BALLOT_NOTE }
    : { position: normalizePosition(position) }
}

// votes has no numeric roll column, so the database orders one day's roll
// calls as text ("…-9" ahead of "…-10"). This is the real order: newest day
// first, then the highest roll number.
function voteOrder(a, b) {
  const day = String(b.voted_at || '').localeCompare(String(a.voted_at || ''))
  if (day) return day
  const x = parseRollCallId(a.roll_call_id), y = parseRollCallId(b.roll_call_id)
  if (!x || !y) return String(b.roll_call_id) < String(a.roll_call_id) ? -1 : 1
  return (y.chamberKey < x.chamberKey ? -1 : y.chamberKey > x.chamberKey ? 1 : 0) || (y.congress - x.congress) || (y.session - x.session) || (y.roll - x.roll)
}

// A page cut from the database's text order can hold the wrong part of the
// day at either end. Given every row of those days, put the right rows on the
// page: the day keeps its place in the list, only its inner order changes.
function fixEdgeDays(page, dayRows) {
  const first = page[0].voted_at, last = page[page.length - 1].voted_at
  let out = page
  for (const day of new Set([first, last])) {
    if (!day) continue
    const all = dayRows.filter((r) => r.voted_at === day)
    const onPage = out.filter((r) => r.voted_at === day)
    if (all.length <= onPage.length) continue
    // Rows of this day the database placed ahead of the page.
    let before = 0
    if (first === last) before = all.filter((r) => String(r.roll_call_id) > String(page[0].roll_call_id)).length
    else if (day === first) before = all.length - onPage.length
    const want = [...all].sort(voteOrder).slice(before, before + onPage.length)
    out = [...out.filter((r) => r.voted_at !== day), ...want]
  }
  return out
}

// The spellings the clerks print for each position.
const POSITION_SPELLINGS = {
  Yea: ['Yea', 'Aye', 'Yes'],
  Nay: ['Nay', 'No'],
  Present: ['Present'],
  'Not Voting': ['Not Voting'],
}

export async function getMemberVotes({ bioguide_id, since, until, bill, position, limit = 25, offset = 0 }) {
  const id = bioguide(bioguide_id)
  if (!id) return badBioguide(bioguide_id)
  const cap = clamp(limit, 1, 100, 25)
  const from = Math.max(0, Math.floor(Number(offset) || 0))
  const dateError = badDates([['since', since], ['until', until]])
  if (dateError) return dateError
  const wantPosition = position ? normalizePosition(position) : null
  if (wantPosition && !POSITION_SPELLINGS[wantPosition]) return { error: 'position must be Yea, Nay, Present or Not Voting' }

  let billId = null
  let billRollCalls = null
  if (bill != null && bill !== '') {
    billId = normalizeBillId(bill)
    if (!billId) return { error: 'Bill id looks wrong. Use 119-hr-1 or "H.R. 1".' }
    const { data, error } = await supabaseAdmin.from('roll_calls').select('id').eq('bill_id', billId)
    if (error) return { error: 'Vote lookup failed' }
    billRollCalls = (data || []).map((r) => r.id)
  }

  const VOTE_COLUMNS = 'roll_call_id, position, voted_at, source_url, bill_id, bills:bill_id ( id, title )'
  const matching = (options) => {
    let q = supabaseAdmin.from('votes').select(VOTE_COLUMNS, options).eq('politician_id', id)
    if (since) q = q.gte('voted_at', since)
    if (until) q = q.lte('voted_at', until)
    if (wantPosition) q = q.in('position', POSITION_SPELLINGS[wantPosition])
    if (billRollCalls) q = q.in('roll_call_id', billRollCalls)
    return q
  }
  let votesQuery = Promise.resolve({ data: [], count: 0, error: null })
  if (!billRollCalls || billRollCalls.length) {
    votesQuery = matching({ count: 'exact' }).order('voted_at', { ascending: false, nullsFirst: false }).order('roll_call_id', { ascending: false }).range(from, from + cap - 1)
  }
  const [votes, { data: member }, updatedAt] = await Promise.all([
    votesQuery,
    supabaseAdmin.from('politicians').select('id, name, chamber').eq('id', id).maybeSingle(),
    lastRun(),
  ])
  if (votes.error) return { error: 'Vote lookup failed' }
  if (!member) return { error: `No member with Bioguide ID ${id}. Use search_members to find one by name.` }

  let rows = votes.data || []
  const total = votes.count ?? rows.length
  if (rows.length && (from > 0 || from + rows.length < total)) {
    const edgeDays = [...new Set([rows[0].voted_at, rows[rows.length - 1].voted_at].filter(Boolean))]
    const days = edgeDays.length ? await matching().in('voted_at', edgeDays).limit(PAGE) : null
    if (days && !days.error) rows = fixEdgeDays(rows, days.data || [])
  }
  rows = [...rows].sort(voteOrder)
  const context = await rollCallContext(rows.map((v) => v.roll_call_id))
  const out = {
    bioguide_id: id,
    name: member.name,
    total,
    offset: from,
    canonical: `${SITE}${memberPath(id, member.name)}`,
    votes: rows.map((v) => {
      const rc = context.get(v.roll_call_id)
      return {
        roll_call_id: v.roll_call_id,
        voted_at: v.voted_at,
        question: rc?.question || null,
        description: rc?.description || null,
        bill: voteBill(v, rc),
        ...memberPosition(rc?.question, v.position),
        source_url: voteSourceUrl(v.roll_call_id, v.source_url),
        canonical: `${SITE}${rollCallPath(v.roll_call_id)}`,
      }
    }),
  }
  const narrowed = Boolean(wantPosition || since || until)
  if (!rows.length && total > 0) {
    out.note = `offset ${from} is past the end: ${total} vote(s) match.`
  } else if (!rows.length && billId && !billRollCalls.length) {
    out.note = `No recorded floor vote on ${billLabel(billId)} is in the record. Many bills pass by voice vote or never reach the floor.`
  } else if (!rows.length && billId && narrowed) {
    // An empty filtered slice says nothing about whether the member voted.
    out.note = `No vote by ${member.name} on ${billLabel(billId)} matches the position or date filter. Drop the filter to see every recorded vote on the bill.`
  } else if (!rows.length && billId) {
    out.note = `${member.name} is not listed in the ${billRollCalls.length} recorded floor vote(s) on ${billLabel(billId)} (the other chamber voted, or the member was not seated).`
  } else if (!rows.length && narrowed) {
    out.note = `No recorded vote by ${member.name} matches the position or date filter.`
  } else if (from + rows.length < total) {
    out.note = `Showing ${rows.length} of ${total}. Pass offset ${from + rows.length} for the next page.`
  }
  out.data_updated_at = updatedAt
  return out
}

// A term's start date is trusted only when the member was already voting
// then. member_congress_terms gives everyone the Congress's first day, which
// is wrong for a member sworn in later (a special-election winner).
const SERVING_SINCE_SLACK_DAYS = 45

async function verifiedServingSince(id, termStart) {
  if (!termStart) return null
  const { data, error } = await supabaseAdmin.from('votes').select('voted_at').eq('politician_id', id).gte('voted_at', termStart).order('voted_at', { ascending: true }).limit(1)
  const first = data?.[0]?.voted_at
  if (error || !first) return null
  const days = (new Date(`${String(first).slice(0, 10)}T00:00:00Z`) - new Date(`${String(termStart).slice(0, 10)}T00:00:00Z`)) / 86400000
  return days >= 0 && days <= SERVING_SINCE_SLACK_DAYS ? termStart : null
}

// The record card's recent votes with what this record cannot support taken
// out: a result on a tied Senate tally, and a position on a named ballot.
function soundRecordVote(v) {
  const out = { ...v }
  if (tiedSenate(v.chamber, v.tally)) { out.result = null; out.resultKind = null }
  if (namedBallot(v.question)) out.position = null
  return out
}

// The "record in 60 seconds" card's facts (shared/memberRecord.js), from the
// same loader as /politician/:id/record. Never any campaign-finance data.
export async function getMemberRecord({ bioguide_id }) {
  const id = String(bioguide_id || '').trim().toUpperCase()
  if (!BIOGUIDE.test(id)) return { error: `Bioguide ID "${bioguide_id}" looks wrong; expected a letter and six digits, e.g. P000197.` }
  const r = await getRecordPage(id)
  if (!r) return { error: `No member with Bioguide ID ${id}` }
  const [context, serving, servingSince] = await Promise.all([
    rollCallContext(r.recentVotes.map((v) => v.roll_call_id)),
    servingNow(r.id),
    verifiedServingSince(r.id, r.servingSince),
  ])
  const s = r.stats
  return {
    bioguide_id: r.id,
    name: r.name,
    party: r.party,
    chamber: r.chamber,
    state: r.state,
    district: r.district,
    serving,
    serving_since: servingSince,
    this_congress: s
      ? { congress: s.congress, roll_calls: s.total, votes_cast: s.cast, not_voting: s.notVoting, not_voting_pct: s.notVotingPct }
      : null,
    recorded_votes: r.voteCount,
    recent_votes: r.recentVotes.map(soundRecordVote).map((v) => {
      const rc = context.get(v.roll_call_id)
      const title = v.bill?.title ?? rc?.bills?.title ?? null
      return {
        voted_at: v.voted_at,
        question: v.question,
        description: rc?.description || null,
        bill: v.bill ? { id: v.bill.id, label: v.bill.label, title: isPlaceholderTitle(title) ? null : title, canonical: `${SITE}${v.bill.path}` } : null,
        position: v.position,
        ...(namedBallot(v.question) ? { position_note: NAMED_BALLOT_NOTE } : {}),
        // Derived from the tally only when it passes the sanity check; else null.
        result: v.result,
        canonical: v.path ? `${SITE}${v.path}` : null,
        source_url: v.source_url,
      }
    }),
    note: 'The same facts for every member: the ten most recent recorded votes, not a curated list. Cite canonical and each vote source_url.',
    canonical: `${SITE}${recordPath(r.id, r.name)}`,
    member_page: `${SITE}${memberPath(r.id, r.name)}`,
    source_url: r.sources.congressGov,
    sources: { congress_gov: r.sources.congressGov, bioguide: r.sources.bioguide, chamber_votes: r.sources.chamberVotes },
    data_updated_at: r.updatedAt,
  }
}

export async function getMemberBills({ bioguide_id }) {
  const id = bioguide(bioguide_id)
  if (!id) return badBioguide(bioguide_id)
  const [{ data: member, error }, bills, updatedAt] = await Promise.all([
    supabaseAdmin.from('politicians').select('id, name').eq('id', id).maybeSingle(),
    loadMemberBills(id),
    lastRun(),
  ])
  if (error) return { error: 'Bill lookup failed' }
  if (!member) return { error: `No member with Bioguide ID ${id}. Use search_members to find one by name.` }
  const shape = (b) => ({ id: b.id, label: b.label, title: b.title, introduced_at: b.introduced_at, canonical: `${SITE}${b.path}`, source_url: b.source_url })
  return {
    bioguide_id: id,
    name: member.name,
    sponsored: { total: bills.sponsored.total, bills: bills.sponsored.items.map(shape) },
    cosponsored: { total: bills.cosponsored.total, bills: bills.cosponsored.items.map(shape) },
    note: 'Newest first; bills whose title is only a number are left out. BallotWatch has not recorded a sponsor for every bill, so these lists can be incomplete: source_url is the member\'s full list on Congress.gov.',
    canonical: `${SITE}${memberPath(id, member.name)}`,
    source_url: congressGovMemberUrl(id),
    data_updated_at: updatedAt,
  }
}

// ---------------------------------------------------------------------------
// compare_members
// ---------------------------------------------------------------------------

// One member's positions in one chamber and Congress, by roll call.
async function memberPositions(id, chamber, congress) {
  const out = new Map()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin.from('votes')
      .select('roll_call_id, position, voted_at')
      .eq('politician_id', id)
      .like('roll_call_id', `${chamber}-${congress}-%`)
      .order('roll_call_id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`votes: ${error.message || 'query failed'}`)
    for (const v of data || []) out.set(v.roll_call_id, v)
    if ((data || []).length < PAGE) break
  }
  return out
}

const rollCallOrder = (a, b) => {
  const x = parseRollCallId(a), y = parseRollCallId(b)
  return (y.session - x.session) || (y.roll - x.roll)
}

export async function compareMembers({ bioguide_id_a, bioguide_id_b }) {
  const a = bioguide(bioguide_id_a)
  const b = bioguide(bioguide_id_b)
  if (!a) return badBioguide(bioguide_id_a)
  if (!b) return badBioguide(bioguide_id_b)
  if (a === b) return { error: 'Give two different members.' }
  // The members are checked before their votes are read.
  const [congress, { data: people, error }, updatedAt] = await Promise.all([
    recordCongress(),
    supabaseAdmin.from('politicians').select('id, name, chamber, party, state, district').in('id', [a, b]),
    lastRun(),
  ])
  if (error) return { error: 'Member lookup failed' }
  const memberA = (people || []).find((p) => p.id === a)
  const memberB = (people || []).find((p) => p.id === b)
  if (!memberA || !memberB) return { error: `No member with Bioguide ID ${memberA ? b : a}. Use search_members to find one by name.` }
  if (memberA.chamber !== memberB.chamber) {
    return { error: `${memberA.name} sits in the ${memberA.chamber} and ${memberB.name} in the ${memberB.chamber}; members of different chambers never vote on the same roll call.` }
  }
  const [votesA, votesB] = await Promise.all([memberPositions(a, memberA.chamber, congress), memberPositions(b, memberA.chamber, congress)])

  let shared = 0
  let agreed = 0
  const split = []
  for (const [rollCallId, va] of votesA) {
    const vb = votesB.get(rollCallId)
    if (!vb) continue
    shared += 1
    // A named ballot (the Speaker's election) has no Yea or Nay to compare.
    const pa = normalizePosition(va.position), pb = normalizePosition(vb.position)
    const cast = (p) => p === 'Yea' || p === 'Nay'
    if (!cast(pa) || !cast(pb)) continue
    if (pa === pb) agreed += 1
    else split.push({ rollCallId, voted_at: va.voted_at, a: pa, b: pb })
  }
  const bothVoted = agreed + split.length
  const recent = split.sort((x, y) => rollCallOrder(x.rollCallId, y.rollCallId)).slice(0, 10)
  const context = await rollCallContext(recent.map((r) => r.rollCallId))
  const who = (m) => ({ bioguide_id: m.id, name: m.name, party: m.party, state: m.state, canonical: `${SITE}${memberPath(m.id, m.name)}` })
  return {
    congress,
    chamber: memberA.chamber,
    member_a: who(memberA),
    member_b: who(memberB),
    roll_calls_both_listed: shared,
    both_voted_yea_or_nay: bothVoted,
    voted_the_same: agreed,
    voted_differently: split.length,
    same_vote_pct: bothVoted ? Math.round((agreed / bothVoted) * 1000) / 10 : null,
    recent_differences: recent.map((r) => {
      const rc = context.get(r.rollCallId)
      return {
        roll_call_id: r.rollCallId,
        voted_at: r.voted_at,
        question: rc?.question || null,
        description: rc?.description || null,
        bill: voteBill({}, rc),
        position_a: r.a,
        position_b: r.b,
        canonical: `${SITE}${rollCallPath(r.rollCallId)}`,
        source_url: voteSourceUrl(r.rollCallId, null),
      }
    }),
    note: `Counted over every roll call of the ${congress}th Congress that lists both members. same_vote_pct is voted_the_same divided by both_voted_yea_or_nay; roll calls where either member was Present or Not Voting are left out. A count, not a judgment: most roll calls are procedural or lopsided.`,
    data_updated_at: updatedAt,
  }
}

// ---------------------------------------------------------------------------
// get_roll_call, get_recent_votes
// ---------------------------------------------------------------------------

// Above this many members the list comes back as short strings grouped by
// position instead of one object per member (a full House roll call is 435).
const FULL_ROWS_MAX = 60
const POSITION_ORDER = ['Yea', 'Nay', 'Present', 'Not Voting']

export async function getRollCall({ congress, chamber, session, roll, state, party, position, bioguide_ids, format } = {}) {
  const id = buildRollCallId({ congress, chamber, session, roll })
  if (!id) return { error: 'Need congress, chamber (house|senate), session, and roll number.' }
  const wantState = state ? stateCode(state) : null
  if (state && !wantState) return { error: `"${state}" is not a state or territory. Use its name or two-letter code.` }
  const wantParty = party ? partyName(party) : null
  const wantPosition = position ? normalizePosition(position) : null
  if (wantPosition && !POSITION_ORDER.includes(wantPosition)) return { error: 'position must be Yea, Nay, Present or Not Voting' }
  const wantIds = Array.isArray(bioguide_ids) && bioguide_ids.length ? new Set(bioguide_ids.map((x) => String(x).trim().toUpperCase())) : null

  const rc = await getRollCallPage(id)
  if (!rc) return { error: `No roll call ${id}. Use get_recent_votes to list roll calls.` }

  // politicians.district is empty for most House members; the roster has it.
  let roster = null
  if (rc.chamberKey === 'house' && rc.congress === currentCongress()) roster = await getRoster(rc.congress).catch(() => null)
  // A named ballot was loaded as all "Not Voting"; so is a roll call whose
  // every member reads that way. Neither says how anyone voted.
  const unrecorded = namedBallot(rc.question) || (rc.votes.length >= 20 && rc.votes.every((v) => normalizePosition(v.position) === 'Not Voting'))
  const all = rc.votes.map((v) => ({
    bioguide_id: v.member.id,
    name: v.member.name,
    party: v.member.party,
    state: v.member.state,
    district: roster?.byId.get(v.member.id)?.district ?? v.member.district ?? null,
    position: unrecorded ? null : normalizePosition(v.position),
  }))
  const filtered = wantState || wantParty || wantPosition || wantIds
  const rows = all.filter((v) =>
    (!wantState || v.state === wantState)
    && (!wantParty || partyName(v.party) === wantParty)
    && (!wantPosition || v.position === wantPosition)
    && (!wantIds || wantIds.has(v.bioguide_id)))

  // The party split is counted from the members listed, by each member's own
  // party, so an independent is never folded into a caucus. It is given only
  // when those rows add up to the tally.
  let byParty = null
  if (rc.tally && !unrecorded) {
    const split = { dem: { yea: 0, nay: 0 }, rep: { yea: 0, nay: 0 }, ind: { yea: 0, nay: 0 } }
    const KEY = { Democrat: 'dem', Republican: 'rep', Independent: 'ind' }
    for (const v of all) {
      const key = KEY[partyName(v.party)]
      const side = v.position === 'Yea' ? 'yea' : v.position === 'Nay' ? 'nay' : null
      if (key && side) split[key][side] += 1
    }
    // Each side must match on its own: 1-2 is not 2-1.
    const sum = (side) => split.dem[side] + split.rep[side] + split.ind[side]
    if (sum('yea') === rc.tally.yea && sum('nay') === rc.tally.nay) byParty = split
  }
  const tied = tiedSenate(rc.chamberKey, rc.tally)

  const out = {
    roll_call_id: rc.id,
    chamber: rc.chamberKey,
    congress: rc.congress,
    session: rc.session,
    roll: rc.roll,
    voted_at: rc.voted_at,
    question: rc.question,
    description: rc.description,
    bill: rc.bill ? { id: rc.bill.id, label: billLabel(rc.bill.id), title: rc.bill.title, source_url: rc.bill.source_url, canonical: `${SITE}${billPath(rc.bill.id)}` } : null,
    tally: unrecorded ? null : rc.tally,
    by_party: byParty,
    result_derived: unrecorded || tied ? null : rc.result,
    members_listed: all.length,
  }
  if (tied) out.result_note = TIE_NOTE
  if (unrecorded) {
    out.positions_recorded = false
    out.note = namedBallot(rc.question) ? NAMED_BALLOT_NOTE : 'No member\'s position on this roll call is in the record; see source_url for the official record.'
  }
  if (filtered) out.members_matched = rows.length
  if (unrecorded) {
    // Who was listed is still known; how they voted is not.
    if (filtered && rows.length <= FULL_ROWS_MAX) out.votes = rows
  } else if (format === 'full' || (format !== 'compact' && rows.length <= FULL_ROWS_MAX)) {
    out.votes = rows
  } else {
    const groups = {}
    for (const p of POSITION_ORDER) {
      const names = rows.filter((v) => v.position === p).map((v) => {
        const seat = v.district && v.district !== '0' ? `-${v.district}` : ''
        return `${v.name} (${partyLetter(v.party)}-${v.state}${seat}) ${v.bioguide_id}`
      })
      if (names.length) groups[p] = names
    }
    // A position outside the four the clerks record is kept, not dropped.
    const other = rows.filter((v) => !POSITION_ORDER.includes(v.position))
    if (other.length) groups.Other = other.map((v) => `${v.name} (${partyLetter(v.party)}-${v.state}) ${v.bioguide_id}: ${v.position}`)
    out.votes_by_position = groups
    out.votes_note = `More than ${FULL_ROWS_MAX} members match, so each entry is the string "Name (Party-State-District) BioguideID". Narrow with state, party, position or bioguide_ids to ${FULL_ROWS_MAX} or fewer for one object per member, or pass format "full".`
  }
  return {
    ...out,
    canonical: `${SITE}${rollCallPath(rc.id)}`,
    source_url: rc.source_url,
    data_quality: rc.indexable ? 'ok' : rc.noindexReason,
    data_updated_at: rc.updatedAt,
  }
}

const ROLL_CALL_COLUMNS = 'id, bill_id, question, description, voted_at, bills:bill_id ( id, title )'
const KEYWORD_TTL_MS = 5 * 60 * 1000
const keywordMemo = new Map()

// Every roll call of one Congress with its bill title, for keyword search
// (about 1,000 rows a year). Cached per instance for five minutes.
async function congressRollCalls(congress) {
  const hit = keywordMemo.get(congress)
  if (hit && Date.now() - hit.at < KEYWORD_TTL_MS) return hit.rows
  const load = async () => {
    const rows = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabaseAdmin.from('roll_calls')
        .select(ROLL_CALL_COLUMNS)
        .or(`id.like.house-${congress}-%,id.like.senate-${congress}-%`)
        .order('id')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`roll_calls: ${error.message || 'query failed'}`)
      rows.push(...(data || []))
      if ((data || []).length < PAGE) break
    }
    return rows
  }
  // Callers arriving during a refresh wait for it instead of starting another.
  const entry = { at: Date.now(), rows: load() }
  keywordMemo.set(congress, entry)
  entry.rows.catch(() => { if (keywordMemo.get(congress) === entry) keywordMemo.delete(congress) })
  return entry.rows
}

export function _resetRollCallSearchCache() {
  keywordMemo.clear()
}

const newestFirst = (a, b) =>
  String(b.voted_at || '').localeCompare(String(a.voted_at || '')) || lower(a.meta.chamber).localeCompare(lower(b.meta.chamber)) || (b.meta.session - a.meta.session) || (b.meta.roll - a.meta.roll)

export async function getRecentVotes({ chamber, since, until, query, bill, limit = 20 } = {}) {
  const cap = clamp(limit, 1, 50, 20)
  const wantChamber = chamber ? String(chamber).toLowerCase() : null
  if (wantChamber && !['house', 'senate'].includes(wantChamber)) return { error: 'chamber must be house or senate' }
  const dateError = badDates([['since', since], ['until', until]])
  if (dateError) return dateError
  let billId = null
  if (bill != null && bill !== '') {
    billId = normalizeBillId(bill)
    if (!billId) return { error: 'Bill id looks wrong. Use 119-hr-1 or "H.R. 1".' }
  }
  // A bill number in the query ("H.R. 1") is that bill, not the letters "h.r".
  let rest = String(query || '')
  if (!billId) {
    const number = BILL_NUMBER.exec(rest)
    const asBill = number ? normalizeBillId(number[1]) : null
    if (asBill) {
      billId = asBill
      rest = rest.replace(number[0], ' ')
    }
  }
  const words = rest.toLowerCase().replace(/['\u2019]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 2).slice(0, 8)
  // A bare number ("42") would match every roll call that mentions any
  // number containing it, so a query needs at least one real word.
  const wordy = words.some((w) => /[a-z]/.test(w))
  if (String(query || '').trim() && !wordy && !billId) return { error: 'query needs a word of two or more letters, or a bill number such as "H.R. 1".' }

  let rows
  let total
  if (wordy) {
    const haystack = (r) => `${r.question || ''} ${r.description || ''} ${r.bills?.title || ''}`.toLowerCase().replace(/['\u2019]/g, '')
    rows = (await congressRollCalls(await recordCongress())).filter((r) => {
      if (!r.voted_at) return false
      if (wantChamber && !r.id.startsWith(`${wantChamber}-`)) return false
      if (since && r.voted_at < since) return false
      if (until && r.voted_at > until) return false
      if (billId && r.bill_id !== billId) return false
      const text = haystack(r)
      return words.every((w) => text.includes(w))
    })
    total = rows.length
  } else {
    let q = supabaseAdmin.from('roll_calls').select(ROLL_CALL_COLUMNS, { count: 'exact' }).not('voted_at', 'is', null)
    if (wantChamber) q = q.like('id', `${wantChamber}-%`)
    if (since) q = q.gte('voted_at', since)
    if (until) q = q.lte('voted_at', until)
    if (billId) q = q.eq('bill_id', billId)
    // Over-read so the newest day is ordered by roll number, not by id text.
    const res = await q.order('voted_at', { ascending: false }).order('id', { ascending: false }).limit(cap * 2 + 20)
    if (res.error) return { error: 'Vote lookup failed' }
    rows = res.data || []
    total = res.count ?? rows.length
  }

  const page = rows.map((r) => ({ ...r, meta: parseRollCallId(r.id) })).filter((r) => r.meta).sort(newestFirst).slice(0, cap)
  const statsById = new Map()
  if (page.length) {
    // Only the totals are used: roll_call_stats groups some independents with
    // a party, so the party split comes from get_roll_call, which counts it
    // from the members themselves.
    const { data } = await supabaseAdmin.from('roll_call_stats').select('roll_call_id, dem_yea, dem_nay, rep_yea, rep_nay, ind_yea, ind_nay').in('roll_call_id', page.map((r) => r.id))
    for (const s of data || []) statsById.set(s.roll_call_id, s)
  }
  const updatedAt = await lastRun()
  const out = {
    total,
    votes: page.map((r) => {
      const stats = statsById.get(r.id)
      const t = tallyFromStats(stats)
      const unrecorded = namedBallot(r.question)
      const sane = !unrecorded && t.yea != null && saneTally(t.yea, t.nay, r.meta.chamber)
      const tally = sane ? { yea: t.yea, nay: t.nay } : null
      const tied = tiedSenate(r.meta.chamberKey, tally)
      const { chamberKey, congress, session, roll } = r.meta
      const vote = {
        roll_call_id: r.id,
        chamber: chamberKey,
        congress,
        session,
        roll,
        voted_at: r.voted_at,
        question: r.question || null,
        description: r.description || null,
        bill: billRef(r.bill_id, r.bills?.title ?? null),
        tally,
        result_derived: sane && !tied ? deriveResult(r.question, t.yea, t.nay, r.meta.chamber, r.description) : null,
        canonical: `${SITE}${rollCallPath(r.id)}`,
        source_url: voteSourceUrl(r.id, null),
      }
      if (tied) vote.result_note = TIE_NOTE
      if (unrecorded) vote.note = NAMED_BALLOT_NOTE
      return vote
    }),
  }
  if (!page.length) out.note = 'No roll call matches. The record covers recorded (roll-call) votes only; voice votes and unanimous consent are not in it.'
  else if (total > page.length) out.note = `Showing the newest ${page.length} of ${total}. Narrow with since, until, chamber, bill or query, or raise limit (max 50).`
  out.data_updated_at = updatedAt
  return out
}

// ---------------------------------------------------------------------------
// search_bills, get_bill, explain_bill
// ---------------------------------------------------------------------------

// Accepts "119-hr-1", "hr1", "H.R. 1", "s. 5051" (current Congress assumed).
export function normalizeBillId(input, congress = currentCongress()) {
  const s = String(input || '').trim().toLowerCase()
  let m = /^(\d{2,3})-([a-z]+)-(\d+)$/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(h\.?\s*r\.?|s\.?|h\.?\s*j\.?\s*res\.?|s\.?\s*j\.?\s*res\.?|h\.?\s*con\.?\s*res\.?|s\.?\s*con\.?\s*res\.?|h\.?\s*res\.?|s\.?\s*res\.?)\s*(\d+)$/.exec(s)
  if (!m) return null
  const type = m[1].replace(/[.\s]/g, '')
  return `${congress}-${type}-${m[2]}`
}

export const BILL_STAGES = ['introduced', 'referred', 'subcommittee', 'committee', 'floor', 'passed_one', 'passed_both', 'enacted', 'dead']
const BILL_COLUMNS = 'id, title, introduced_at, policy_area, source_url, legislative_stage'

export async function searchBills({ query, congress, stage, sponsor, has_vote, limit = 20 } = {}) {
  const q = String(query || '').trim()
  const sponsorId = sponsor ? bioguide(sponsor) : null
  if (sponsor && !sponsorId) return badBioguide(sponsor)
  if (stage && !BILL_STAGES.includes(stage)) return { error: `stage must be one of ${BILL_STAGES.join(', ')}` }
  const cap = clamp(limit, 1, 50, 20)
  const wantCongress = congress ? Math.floor(Number(congress)) : null
  if (!q && !sponsorId && !stage && !has_vote && !wantCongress) return { error: 'Give title words, a bill number, or a filter (congress, stage, sponsor or has_vote).' }
  const updatedAt = await lastRun()
  const columns = has_vote ? `${BILL_COLUMNS}, roll_calls!inner ( id )` : BILL_COLUMNS
  // The filters apply to a bill-number lookup exactly as to a title search.
  const narrow = (search) => {
    let out = search
    if (wantCongress) out = out.like('id', `${wantCongress}-%`)
    if (stage) out = out.eq('legislative_stage', stage)
    if (sponsorId) out = out.eq('sponsor_bioguide_id', sponsorId)
    return out
  }

  const direct = q ? normalizeBillId(q, wantCongress || currentCongress()) : null
  if (direct) {
    const { data, error } = await narrow(supabaseAdmin.from('bills').select(columns).eq('id', direct)).limit(1)
    if (error) return { error: 'Search failed' }
    if (data?.length) return { query: q, results: [billHit(data[0])], data_updated_at: updatedAt }
    const filtered = wantCongress || stage || sponsorId || has_vote
    return { query: q, results: [], note: filtered ? `No bill ${direct} matches those filters.` : `No bill ${direct} is in the record.`, data_updated_at: updatedAt }
  }

  // Every word must appear in the title, in any order.
  const cleaned = q.replace(/[%_*\\,()"]/g, ' ').split(/\s+/).filter((w) => /[a-z0-9]/i.test(w))
  if (q && !cleaned.length) return { error: 'query has no letters or digits to search for.' }
  const long = cleaned.filter((w) => w.length >= 2)
  const words = (long.length ? long : cleaned).slice(0, 8)
  let search = supabaseAdmin.from('bills').select(columns)
  for (const w of words) search = search.ilike('title', `%${w}%`)
  const { data, error } = await narrow(search).order('introduced_at', { ascending: false, nullsFirst: false }).limit(cap)
  if (error) return { error: 'Search failed' }
  const results = (data || []).map(billHit)
  const out = { query: q || null, results }
  if (results.length === cap) out.note = `Showing the ${cap} most recently introduced matches; more may exist. Add words, or filter by congress, stage, sponsor or has_vote.`
  else if (!results.length) out.note = q
    ? 'No bill title matches every word. Search covers titles only; try fewer or different words, or a bill number such as "H.R. 1".'
    : 'No bill matches those filters.'
  out.data_updated_at = updatedAt
  return out
}

function billHit(b) {
  return { id: b.id, label: billLabel(b.id), title: b.title, introduced_at: b.introduced_at, policy_area: b.policy_area, stage: b.legislative_stage, canonical: `${SITE}${billPath(b.id)}`, source_url: b.source_url }
}

export async function getBill({ id }) {
  const billId = normalizeBillId(id)
  if (!billId) return { error: 'Bill id looks wrong. Use 119-hr-1 or "H.R. 1".' }
  const b = await getBillPage(billId)
  if (!b) return { error: `No bill ${billId}. Use search_bills to find one by title.` }
  return {
    id: b.id,
    label: b.label,
    title: b.title,
    congress: b.congress,
    sponsor: b.sponsor ? { ...b.sponsor, canonical: `${SITE}${memberPath(b.sponsor.id, b.sponsor.name)}` } : null,
    introduced_at: b.introduced_at,
    policy_area: b.policy_area,
    stage: b.legislative_stage,
    official_summary: b.crs_summary || null,
    recorded_votes: b.rollCalls.map((r) => {
      const tied = tiedSenate(r.chamber, r.tally)
      const vote = { roll_call_id: r.id, chamber: lower(r.chamber), voted_at: r.voted_at, question: r.question, tally: r.tally, result_derived: tied ? null : r.result, canonical: `${SITE}${rollCallPath(r.id)}` }
      if (tied) vote.result_note = TIE_NOTE
      return vote
    }),
    canonical: `${SITE}${billPath(b.id)}`,
    source_url: b.source_url,
    data_updated_at: b.updatedAt,
  }
}

// Plain-English explanation written by AI from the bill's official text
// (api/_lib/explanations.js). Read-only here: MCP calls share the general
// API limit, not the per-IP generation limit, so writing one is left to the
// bill page (GET /api/explain).
export async function explainBill({ id }) {
  const billId = normalizeBillId(id)
  if (!billId) return { error: 'Bill id looks wrong. Use 119-hr-1 or "H.R. 1".' }
  const b = await getBillPage(billId)
  if (!b) return { error: `No bill ${billId}. Use search_bills to find one by title.` }
  const out = b.explanation ? null : await getOrCreateExplanation(b.id, { allowGenerate: false }).catch(() => null)
  const e = b.explanation || (out?.status === 'ok' ? explanationPayload(out.row) : null)
  return {
    id: b.id,
    label: b.label,
    title: b.title,
    plain_english: e ? { summary: e.summary, paragraphs: e.paragraphs, key_points: e.key_points || e.keyPoints || [] } : null,
    explained_from: e ? { ...e.source, note: explanationSourceLine(e.source) } : null,
    official_summary: b.crs_summary || null,
    note: e
      ? 'plain_english was written by AI from the official text named in explained_from. Cite source_url (Congress.gov) for anything legally precise.'
      : out?.status === 'no_source'
        ? 'Congress.gov has published no text or summary for this bill yet, so there is no explanation. Nothing is inferred from the title.'
        : 'No plain-English explanation has been written for this bill yet. Use official_summary when present, otherwise the source_url.',
    canonical: `${SITE}${billPath(b.id)}`,
    source_url: b.source_url,
    data_updated_at: b.updatedAt,
  }
}

// ---------------------------------------------------------------------------
// get_floor_schedule
// ---------------------------------------------------------------------------

// House floor schedule, read live from docs.house.gov through the same loader
// as GET /api/v1/floor/schedule (api/_lib/floorSchedule.js), so there is no
// ETL timestamp; each week carries the source's own source_updated_at.
export async function getFloorSchedule({ week } = {}) {
  const weeks = resolveFloorWeeks(week)
  if (!weeks) return { error: 'week must be a real date in YYYY-MM-DD form, from 2010 to 60 days ahead (any day; the schedule week starts Monday).' }
  const { allFailed, data } = await loadFloorSchedule(weeks)
  if (allFailed) return { error: 'The House floor schedule could not be fetched from docs.house.gov; try again shortly.' }
  return {
    chamber: 'house',
    senate_note: data.senate_note,
    note: 'Items the Majority Leader says may be considered during the week, grouped by procedure; no day or time per item. Cite the week source_url and each bill canonical URL.',
    weeks: data.weeks.map((w) => ({
      week: w.week,
      status: w.status,
      congress: w.congress,
      source_url: w.source_url,
      source_updated_at: w.source_updated_at,
      items: w.items.map((i) => ({
        label: i.label,
        title: i.title,
        category: i.category,
        bill_id: i.bill_id,
        canonical: i.bill_path ? `${SITE}${i.bill_path}` : null,
        source_url: w.source_url,
      })),
    })),
    canonical: `${SITE}/this-week`,
  }
}

// ---------------------------------------------------------------------------
// search, fetch
// ---------------------------------------------------------------------------
// The two generic tools ChatGPT deep research and company knowledge require
// (https://developers.openai.com/api/docs/mcp): search(query) returns
// { results: [{ id, title, url }] } and fetch(id) returns
// { id, title, text, url, metadata }. Ids are "member:P000197",
// "bill:119-hr-1" and "vote:house-119-1-145".

const SEARCH_STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'of', 'on', 'in', 'for', 'to', 'by', 'at', 'with', 'about', 'from', 'is', 'are', 'was', 'were', 'did', 'does', 'do',
  'how', 'what', 'who', 'which', 'when', 'vote', 'votes', 'voted', 'voting', 'bill', 'bills', 'congress', 'record', 'records',
  'senate', 'house', 'senator', 'senators', 'representative', 'representatives', 'rep', 'sen', 'member', 'members', 'roll', 'call',
])
const BILL_NUMBER = /\b(\d{2,3}-[a-z]+-\d+|(?:h\.?\s*r\.?|s\.?|h\.?\s*j\.?\s*res\.?|s\.?\s*j\.?\s*res\.?|h\.?\s*con\.?\s*res\.?|s\.?\s*con\.?\s*res\.?|h\.?\s*res\.?|s\.?\s*res\.?)\s*\d+)\b/i
const SEARCH_LIMIT = 12

function memberTitle(m) {
  const seat = m.chamber === 'senate' ? 'U.S. Senator' : 'U.S. House'
  const district = m.chamber === 'house' && m.district && m.district !== '0' ? `-${m.district}` : ''
  return `${m.name}, ${seat} (${partyLetter(m.party)}-${m.state}${district})${m.serving === false ? ', no longer serving' : ''}: voting record`
}

// "H.R. 1: Title", or the number alone when the title is missing or a stub.
function billTitle(label, title) {
  return isPlaceholderTitle(title) ? label : `${label}: ${title}`
}

// "House roll call 327", "senate vote no. 12", "vote:house-119-2-327".
const ROLL_CALL_ID = /\b(house|senate)-(\d{2,3})-(\d)-(\d{1,4})\b/i
const ROLL_CALL_NUMBER = /\b(?:(house|senate)\s+)?(?:roll\s*call|roll|vote)(?:\s+(?:no\.?|number))?\s*#?\s*(\d{1,4})\b/i

// The roll calls a query names outright: an id, or a roll number in either
// chamber and session of the Congress on record (a few candidates at most).
async function namedRollCalls(q) {
  const typed = ROLL_CALL_ID.exec(q)
  let ids = []
  if (typed) ids = [`${typed[1].toLowerCase()}-${Number(typed[2])}-${Number(typed[3])}-${Number(typed[4])}`]
  else {
    const m = ROLL_CALL_NUMBER.exec(q)
    if (!m) return []
    const congress = await recordCongress()
    const chambers = m[1] ? [m[1].toLowerCase()] : /\bsenate\b/i.test(q) ? ['senate'] : /\bhouse\b/i.test(q) ? ['house'] : ['house', 'senate']
    for (const chamber of chambers) for (const session of [2, 1]) ids.push(`${chamber}-${congress}-${session}-${Number(m[2])}`)
  }
  const { data, error } = await supabaseAdmin.from('roll_calls').select(ROLL_CALL_COLUMNS).in('id', ids)
  if (error) return []
  return (data || []).map((r) => ({ ...r, meta: parseRollCallId(r.id) })).filter((r) => r.meta && r.voted_at).sort(newestFirst)
    .map((r) => ({ roll_call_id: r.id, chamber: r.meta.chamberKey, roll: r.meta.roll, voted_at: r.voted_at, question: r.question, description: r.description, bill: billRef(r.bill_id, r.bills?.title ?? null), canonical: `${SITE}${rollCallPath(r.id)}` }))
}

function voteTitle(v) {
  const about = v.bill ? ` on ${v.bill.label}${v.bill.title ? ` ${v.bill.title}` : ''}` : v.description ? `: ${v.description}` : ''
  const outcome = v.result_derived && v.tally ? ` (${v.result_derived} ${v.tally.yea}-${v.tally.nay})` : ''
  return `${v.chamber === 'senate' ? 'Senate' : 'House'} roll call ${v.roll}, ${v.voted_at}: ${v.question || 'recorded vote'}${about}${outcome}`.slice(0, 300)
}

export async function search({ query } = {}) {
  const q = String(query || '').trim()
  const results = []
  const add = (id, title, url) => { if (url && !results.some((r) => r.id === id)) results.push({ id, title, url }) }
  if (!q) return { results }

  // A ZIP code: the members who represent it.
  if (/^\d{5}(-\d{4})?$/.test(q)) {
    const reps = await findRepresentatives({ zip: q }).catch(() => null)
    for (const m of [...(reps?.senators || []), ...(reps?.representatives || [])]) add(`member:${m.bioguide_id}`, memberTitle(m), m.canonical)
    return { results }
  }

  const number = BILL_NUMBER.exec(q)
  const billId = number ? normalizeBillId(number[1]) : null
  // A roll-call id or number is looked up as such, not as words in a title.
  const words = q.replace(ROLL_CALL_ID, ' ').replace(ROLL_CALL_NUMBER, ' ').replace(BILL_NUMBER, ' ').toLowerCase().replace(/['’]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !SEARCH_STOPWORDS.has(w)).slice(0, 6)
  const soft = (promise) => promise.catch((err) => { console.warn('[mcp] search part failed:', err?.message); return null })
  // Members with their match score: a full-name match leads the results; a
  // family name that merely appears in the query ("Laken Riley Act") trails.
  const memberHits = async () => {
    const roster = await getRoster()
    return searchRoster(roster, { query: words.join(' ') }).slice(0, 5)
  }
  const [rollCalls, members, bill, bills, votes, billVotes] = await Promise.all([
    soft(namedRollCalls(q)),
    words.length ? soft(memberHits()) : null,
    billId ? soft(searchBills({ query: billId })) : null,
    words.length ? soft(searchBills({ query: words.join(' '), limit: 6 })) : null,
    words.length ? soft(getRecentVotes({ query: words.join(' '), limit: 5 })) : null,
    billId ? soft(getRecentVotes({ bill: billId, limit: 5 })) : null,
  ])
  const addMember = ({ member }) => add(`member:${member.id}`, memberTitle(member), `${SITE}${memberPath(member.id, member.name)}`)
  const strong = (members || []).filter((h) => h.score >= 80)
  const weak = (members || []).filter((h) => h.score < 80)
  for (const v of rollCalls || []) add(`vote:${v.roll_call_id}`, voteTitle(v), v.canonical)
  for (const b of bill?.results || []) add(`bill:${b.id}`, billTitle(b.label, b.title), b.canonical)
  strong.forEach(addMember)
  for (const v of billVotes?.votes || []) add(`vote:${v.roll_call_id}`, voteTitle(v), v.canonical)
  for (const b of bills?.results || []) add(`bill:${b.id}`, billTitle(b.label, b.title), b.canonical)
  for (const v of votes?.votes || []) add(`vote:${v.roll_call_id}`, voteTitle(v), v.canonical)
  const top = results.slice(0, SEARCH_LIMIT - Math.min(weak.length, 2))
  results.length = 0
  results.push(...top)
  weak.forEach(addMember)
  return { results: results.slice(0, SEARCH_LIMIT) }
}

// "member:P000197", a bare id, or a BallotWatch record URL -> { type, id }.
// A URL must be on ballotwatch.io and be a whole record path.
const SITE_HOSTS = new Set(['ballotwatch.io', 'www.ballotwatch.io'])

export function parseDocumentId(input) {
  let s = String(input || '').trim()
  if (/^https?:\/\//i.test(s)) {
    let url
    try { url = new URL(s) } catch { return null }
    if (!SITE_HOSTS.has(url.hostname.toLowerCase())) return null
    const path = url.pathname.replace(/\.md$/i, '').replace(/\/+$/, '')
    let m = /^\/politician\/([^/]+)(?:\/record)?$/.exec(path)
    if (m) s = `member:${parseMemberSegment(m[1])?.id || ''}`
    else if ((m = /^\/bill\/(\d+)\/([a-z]+)\/(\d+)$/i.exec(path))) s = `bill:${m[1]}-${m[2]}-${m[3]}`
    else if ((m = /^\/vote\/(\d+)\/(house|senate)\/(\d+)\/(\d+)$/i.exec(path))) s = `vote:${m[2]}-${m[1]}-${m[3]}-${m[4]}`
    else return null
  }
  const typed = /^(member|bill|vote):(.+)$/i.exec(s)
  const type = typed ? typed[1].toLowerCase() : null
  const rest = (typed ? typed[2] : s).trim()
  if ((!type || type === 'member') && bioguide(rest)) return { type: 'member', id: bioguide(rest) }
  if ((!type || type === 'vote') && parseRollCallId(rest)) return { type: 'vote', id: rest.toLowerCase() }
  if (!type || type === 'bill') {
    const billId = normalizeBillId(rest)
    if (billId) return { type: 'bill', id: billId }
  }
  return null
}

export async function fetchDocument({ id } = {}) {
  const doc = parseDocumentId(id)
  if (!doc) return { error: 'Unknown id. Use an id returned by search: member:P000197, bill:119-hr-1 or vote:house-119-1-145.' }
  const meta = (extra) => Object.fromEntries(Object.entries(extra).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))

  if (doc.type === 'member') {
    const r = await getRecordPage(doc.id)
    if (!r) {
      // A member the roster knows only from a term row (no profile yet) is
      // still a result search can return, so fetch answers with what is known.
      const known = await getRoster().then((roster) => roster.byId.get(doc.id)).catch(() => null)
      if (!known) return { error: `No member with Bioguide ID ${doc.id}` }
      const seat = known.chamber === 'senate' ? `U.S. Senator for ${known.state}` : `U.S. House, ${known.state}${known.district && known.district !== '0' ? `-${known.district}` : ''}`
      return {
        id: `member:${known.id}`,
        title: memberTitle(known),
        text: `# ${known.name}\n\n- Seat: ${seat}\n- Party: ${known.party || 'not recorded'}\n- Bioguide ID: ${known.id}\n- Official profile: ${congressGovMemberUrl(known.id)}\n\nBallotWatch has no votes on record for this member yet.\n`,
        url: `${SITE}${memberPath(known.id, known.name)}`,
        metadata: meta({ type: 'member', bioguide_id: known.id, source_url: congressGovMemberUrl(known.id) }),
      }
    }
    const [serving, servingSince] = await Promise.all([servingNow(r.id), verifiedServingSince(r.id, r.servingSince)])
    const status = serving === false ? '\nThis member is no longer serving in Congress.\n' : ''
    const ballots = r.recentVotes.some((v) => namedBallot(v.question)) ? `\n${NAMED_BALLOT_NOTE}\n` : ''
    return {
      id: `member:${r.id}`,
      title: memberTitle({ ...r, serving }),
      text: recordMarkdown({ ...r, servingSince, recentVotes: r.recentVotes.map(soundRecordVote) }) + ballots + status,
      url: `${SITE}${memberPath(r.id, r.name)}`,
      metadata: meta({ type: 'member', bioguide_id: r.id, source_url: r.sources.congressGov, data_updated_at: r.updatedAt }),
    }
  }
  if (doc.type === 'bill') {
    const b = await getBillPage(doc.id)
    if (!b) return { error: `No bill ${doc.id}` }
    return {
      id: `bill:${b.id}`,
      title: billTitle(b.label, b.title),
      text: billMarkdown(b),
      url: `${SITE}${billPath(b.id)}`,
      metadata: meta({ type: 'bill', bill_id: b.id, stage: b.legislative_stage, source_url: b.source_url, data_updated_at: b.updatedAt }),
    }
  }
  const { congress, chamberKey, session, roll } = parseRollCallId(doc.id)
  const out = await getRollCall({ congress, chamber: chamberKey, session, roll, format: 'compact' })
  if (out.error) return { error: out.error }
  const lines = [
    `# ${out.chamber === 'senate' ? 'Senate' : 'House'} roll call ${out.roll}, ${out.congress}th Congress, session ${out.session}`,
    '',
    `- Question: ${out.question || ''}`,
  ]
  if (out.description) lines.push(`- Description: ${out.description}`)
  if (out.bill) lines.push(`- Bill: [${out.bill.label}](${out.bill.canonical})${out.bill.title ? ` ${out.bill.title}` : ''}`)
  if (out.voted_at) lines.push(`- Date: ${out.voted_at}`)
  if (out.tally) lines.push(`- Tally: ${out.tally.yea} yea, ${out.tally.nay} nay${out.tally.present ? `, ${out.tally.present} present` : ''}${out.tally.notVoting ? `, ${out.tally.notVoting} not voting` : ''}`)
  if (out.by_party) lines.push(`- By party (yea-nay): Democrats ${out.by_party.dem.yea}-${out.by_party.dem.nay}, Republicans ${out.by_party.rep.yea}-${out.by_party.rep.nay}, Independents ${out.by_party.ind.yea}-${out.by_party.ind.nay}`)
  if (out.result_derived) lines.push(`- Result (derived from tally and question): ${out.result_derived}`)
  if (out.result_note) lines.push(`- Result: not derived. ${out.result_note}`)
  lines.push(`- Canonical: ${out.canonical}`)
  if (out.source_url) lines.push(`- Official record: ${out.source_url}`)
  if (out.data_updated_at) lines.push(`- Data updated: ${out.data_updated_at}`)
  lines.push('', '## How members voted', '')
  if (out.positions_recorded === false) lines.push(`${out.note} ${out.members_listed} members are listed on this roll call.`, '')
  for (const [position, names] of Object.entries(out.votes_by_position || {})) {
    lines.push(`**${position} (${names.length}):** ${names.map((n) => n.replace(/ [A-Z]\d{6}$/, '')).join('; ')}`, '')
  }
  return {
    id: `vote:${out.roll_call_id}`,
    title: voteTitle(out),
    text: lines.join('\n'),
    url: out.canonical,
    metadata: meta({ type: 'roll_call', roll_call_id: out.roll_call_id, result: out.result_derived, source_url: out.source_url, data_updated_at: out.data_updated_at }),
  }
}
