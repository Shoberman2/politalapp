// Who is in Congress now, for the MCP tools that turn a name, a state or a
// district into members (search_members, find_representatives, get_roll_call).
//
// `politicians` has one row per member seen in the current Congress and
// `member_congress_terms` one row per Congress served, but neither says when a
// member left: term_end is never filled in, and a member sworn in mid-Congress
// has votes before they have a term row. So "serving" is read off the record
// itself: a roll call lists the sitting members of its chamber (as Yea, Nay,
// Present or Not Voting), which makes the newest complete roll call the
// membership list. One sitting member is the exception: the Speaker is left
// off every roll call he does not vote on. So a member the newest roll call
// omits is checked against Congress.gov's "current member" flag and, failing
// that, the roll calls just before it. Delegates and the Resident
// Commissioner do not vote on the House floor, so they count as serving while
// they hold a term in the current Congress.

import { supabaseAdmin } from './supabase.js'
import { parseRollCallId } from './rollCallResult.js'
import { MAX_ROLL_CALL_ROWS } from './site.js'
import { isDelegateJurisdiction } from '../../shared/atLargeStates.js'
import { STATE_NAMES, toStateAbbr } from '../../src/utils/states.js'

const TTL_MS = 10 * 60 * 1000
// A roll call with fewer rows than this is still being ingested (or is not a
// full-chamber vote) and cannot say who is seated.
const MIN_SEATED = { house: 400, senate: 90 }
// A vote series can put dozens of roll calls on one date; read enough of the
// newest to order them by roll number here (the table has no numeric column).
const LATEST_SCAN = 60
// How many of the newest roll calls are compared, and how far a roll call may
// fall short of the fullest of them (a seat or two changes hands; a half-
// loaded roll call is short by dozens).
const SEATED_SAMPLE = 3
const SEATED_SLACK = 3
// How far back a member left off the newest roll call is still looked for,
// when Congress.gov cannot say whether they sit.
const RECENT_ROLL_CALLS = 40
const MAX_RECENT_ROWS = 1000
const ROSTER_PAGE = 1000
const DISTRICT_LOOKUP_TIMEOUT_MS = 4000

export function currentCongress(date = new Date()) {
  const year = date.getUTCFullYear()
  // Congressional terms change at noon Eastern on January 3 of odd years.
  const effectiveYear = year % 2 && date.getTime() < Date.UTC(year, 0, 3, 17) ? year - 1 : year
  return Math.floor((effectiveYear - 1789) / 2) + 1
}

function must(res, what) {
  if (res?.error) throw new Error(`${what}: ${res.error.message || 'query failed'}`)
  return res?.data ?? []
}

export function partyName(party) {
  const s = String(party || '').trim()
  if (/^(d|dem)/i.test(s)) return 'Democrat'
  if (/^(r|rep)/i.test(s)) return 'Republican'
  if (/^(i|ind)/i.test(s)) return 'Independent'
  return s || null
}

// A House seat's district as a string: "0" for at-large and delegate seats,
// null when it is not known. Senators have none.
function seatDistrict(chamber, state, district) {
  if (chamber !== 'house') return null
  if (isDelegateJurisdiction(state)) return '0'
  if (district == null || district === '') return null
  const n = parseInt(String(district), 10)
  return Number.isNaN(n) ? null : String(n)
}

// The members listed in the chamber's newest complete roll call, or null when
// the record cannot say (no votes yet this Congress, or a read failed).
// `recent` is the roll calls just before it, for members it leaves out.
async function seatedIn(chamber, congress) {
  const rcs = must(await supabaseAdmin.from('roll_calls')
    .select('id, voted_at')
    .like('id', `${chamber}-${congress}-%`)
    .not('voted_at', 'is', null)
    .order('voted_at', { ascending: false })
    .limit(LATEST_SCAN), 'roll_calls')
  const newestFirst = rcs
    .map((r) => ({ ...r, meta: parseRollCallId(r.id) }))
    .filter((r) => r.meta)
    .sort((a, b) => String(b.voted_at).localeCompare(String(a.voted_at)) || b.meta.session - a.meta.session || b.meta.roll - a.meta.roll)
  const sample = await Promise.all(newestFirst.slice(0, SEATED_SAMPLE).map(async (rc) => ({
    rc,
    rows: must(await supabaseAdmin.from('votes').select('politician_id').eq('roll_call_id', rc.id).limit(MAX_ROLL_CALL_ROWS), 'votes'),
  })))
  // The newest roll call that is as full as its neighbours: one still being
  // loaded lists fewer members and would mark the rest as gone.
  const fullest = Math.max(0, ...sample.map((s) => s.rows.length))
  const pick = sample.find((s) => s.rows.length >= MIN_SEATED[chamber] && s.rows.length >= fullest - SEATED_SLACK)
  if (!pick) return null
  const after = newestFirst.findIndex((r) => r.id === pick.rc.id) + 1
  return {
    ids: new Set(pick.rows.map((r) => r.politician_id)),
    asOf: pick.rc.voted_at,
    rollCallId: pick.rc.id,
    recent: newestFirst.slice(after, after + RECENT_ROLL_CALLS).map((r) => r.id),
  }
}

// One member's Congress.gov record: whether they sit in Congress now, and
// their district. Asked only for the few members the roll calls leave open (a
// member sworn in mid-Congress has no term row, so no district; the Speaker
// is left off every roll call he does not vote on). Remembered per instance,
// a failure for a shorter time, and capped per load so a Congress with no
// term rows cannot fan out to hundreds of requests on the shared key.
const memberMemo = new Map()
const MEMBER_MEMO_MS = 60 * 60 * 1000
const MEMBER_RETRY_MS = 10 * 60 * 1000
const MAX_MEMBER_LOOKUPS = 20
const MEMBER_LOOKUP_CONCURRENCY = 5
const UNKNOWN_MEMBER = { current: null, district: null }

async function lookupMember(bioguideId, budget) {
  const hit = memberMemo.get(bioguideId)
  if (hit && Date.now() < hit.until) return hit.value
  const key = process.env.CONGRESS_API_KEY || process.env.VITE_CONGRESS_API_KEY
  if (!key || budget.left <= 0) return UNKNOWN_MEMBER
  budget.left -= 1
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), DISTRICT_LOOKUP_TIMEOUT_MS)
  let value = UNKNOWN_MEMBER
  let ok = false
  try {
    const res = await fetch(`https://api.congress.gov/v3/member/${encodeURIComponent(bioguideId)}?format=json&api_key=${encodeURIComponent(key)}`, { signal: ctrl.signal })
    if (res.ok) {
      const member = (await res.json())?.member || {}
      const terms = member.terms || []
      const raw = terms[terms.length - 1]?.district ?? member.district ?? null
      value = { current: typeof member.currentMember === 'boolean' ? member.currentMember : null, district: raw == null ? null : String(raw) }
      ok = true
    }
  } catch {
    // Unknown; asked again after MEMBER_RETRY_MS.
  } finally {
    clearTimeout(timer)
  }
  memberMemo.set(bioguideId, { value, until: Date.now() + (ok ? MEMBER_MEMO_MS : MEMBER_RETRY_MS) })
  return value
}

async function forEachMemberBatch(members, visit) {
  for (let i = 0; i < members.length; i += MEMBER_LOOKUP_CONCURRENCY) {
    await Promise.all(members.slice(i, i + MEMBER_LOOKUP_CONCURRENCY).map(visit))
  }
}

// Every row of politicians (one page holds the whole table today).
async function allPoliticians() {
  const rows = []
  for (let from = 0; ; from += ROSTER_PAGE) {
    const page = must(await supabaseAdmin.from('politicians').select('id, name, chamber, state, district, party').order('id').range(from, from + ROSTER_PAGE - 1), 'politicians')
    rows.push(...page)
    if (page.length < ROSTER_PAGE) break
  }
  return rows
}

const termsOf = (congress) =>
  supabaseAdmin.from('member_congress_terms').select('bioguide_id, chamber, state, district, party').eq('congress', congress).limit(ROSTER_PAGE).then((r) => must(r, 'member_congress_terms'))

async function loadRoster(congress, { fallBack = true } = {}) {
  const quiet = (chamber, of) => seatedIn(chamber, of).catch((err) => { console.warn(`[roster] ${chamber} membership unknown:`, err.message); return null })
  const [politicians, terms, houseNow, senateNow] = await Promise.all([allPoliticians(), termsOf(congress), quiet('house', congress), quiet('senate', congress)])
  // The first days of a new Congress: no terms loaded and no roll call yet.
  // The outgoing Congress is the newest record there is, and says so.
  if (fallBack && congress > 1 && !terms.length && !houseNow && !senateNow) return loadRoster(congress - 1, { fallBack: false })
  let house = houseNow
  let senate = senateNow
  // A new Congress one chamber into its first votes: the House has a roll
  // call, the Senate has none, and no term rows exist yet. The other chamber
  // (and the delegates, who are on no roll call) are carried from the
  // outgoing Congress and marked as carried, never read as "nobody serves".
  // Districts are never carried: a new Congress can sit under a new map.
  const carried = { house: false, senate: false, delegates: false }
  let held = terms
  if (fallBack && congress > 1 && !terms.length) {
    const previous = await termsOf(congress - 1).catch(() => [])
    if (previous.length) { held = previous; carried.delegates = true }
    if (!house) { house = await quiet('house', congress - 1); carried.house = Boolean(house || previous.length) }
    if (!senate) { senate = await quiet('senate', congress - 1); carried.senate = Boolean(senate || previous.length) }
  }
  const seated = { house, senate }
  const holdsTerm = new Set(held.map((t) => t.bioguide_id))
  const termById = new Map(terms.map((t) => [t.bioguide_id, t]))
  const rows = new Map(politicians.map((p) => [p.id, p]))
  // A term without a politicians row still yields a citable stub.
  for (const t of held) {
    if (held !== terms && !carried[t.chamber] && !isDelegateJurisdiction(t.state)) continue
    if (!rows.has(t.bioguide_id)) rows.set(t.bioguide_id, { id: t.bioguide_id, name: t.bioguide_id, chamber: t.chamber, state: t.state, district: held === terms ? t.district : null, party: t.party })
  }

  const open = []
  const members = [...rows.values()].map((p) => {
    const term = termById.get(p.id) || null
    const chamber = p.chamber || term?.chamber || null
    const state = p.state || term?.state || null
    const delegate = chamber === 'house' && isDelegateJurisdiction(state)
    const list = seated[chamber]
    // Voting seats follow the newest roll call; when it cannot say, and for
    // delegates, holding a term in this Congress is the fallback.
    const member = {
      id: p.id,
      name: p.name,
      chamber,
      state,
      district: seatDistrict(chamber, state, term?.district ?? (held === terms ? p.district : null)),
      party: partyName(p.party || term?.party),
      serving: !delegate && list ? list.ids.has(p.id) : holdsTerm.has(p.id),
    }
    // Left off the newest roll call: gone, or simply not listed on it.
    if (!delegate && list && !member.serving && (chamber === 'house' || chamber === 'senate')) open.push(member)
    return member
  })

  // Congress.gov settles the open cases; where it cannot, a member listed on
  // a recent roll call still counts (the Speaker's longest gap in the 119th
  // Congress was 16 roll calls).
  const budget = { left: MAX_MEMBER_LOOKUPS }
  const unsettled = []
  const occupiedHouse = new Set(members.filter((m) => m.serving && m.chamber === 'house' && m.district != null).map((m) => m.state + '-' + m.district))
  const senatorsByState = new Map()
  for (const m of members) {
    if (m.serving && m.chamber === 'senate') senatorsByState.set(m.state, (senatorsByState.get(m.state) || 0) + 1)
  }
  // A replacement already recorded in the seat rules out its former holder,
  // even if the former holder was listed on a recent roll call.
  const unfilled = open.filter((m) => m.chamber === 'senate'
    ? (senatorsByState.get(m.state) || 0) < 2
    : !occupiedHouse.has(m.state + '-' + m.district))
  await forEachMemberBatch(unfilled, async (m) => {
    const known = await lookupMember(m.id, budget)
    if (known.current == null) unsettled.push(m)
    else m.serving = known.current
  })
  for (const chamber of ['house', 'senate']) {
    const ids = unsettled.filter((m) => m.chamber === chamber).map((m) => m.id)
    const recent = seated[chamber]?.recent || []
    if (!ids.length || !recent.length) continue
    // Few enough ids per read that every row fits in one response.
    const step = Math.max(1, Math.floor(MAX_RECENT_ROWS / recent.length))
    for (let i = 0; i < ids.length; i += step) {
      const res = await supabaseAdmin.from('votes').select('politician_id').in('politician_id', ids.slice(i, i + step)).in('roll_call_id', recent).limit(MAX_RECENT_ROWS)
      if (res.error) { console.warn('[roster] recent roll calls unread:', res.error.message); break }
      const listed = new Set((res.data || []).map((r) => r.politician_id))
      for (const m of unsettled) if (m.chamber === chamber && listed.has(m.id)) m.serving = true
    }
  }

  const missing = members.filter((m) => m.serving && m.chamber === 'house' && m.district == null)
  await forEachMemberBatch(missing, async (m) => { m.district = seatDistrict('house', m.state, (await lookupMember(m.id, budget)).district) })

  return {
    congress,
    members,
    byId: new Map(members.map((m) => [m.id, m])),
    // The dates the membership was read from, per chamber: null when unknown,
    // and when the chamber was carried from the outgoing Congress.
    servingAsOf: { house: carried.house ? null : house?.asOf || null, senate: carried.senate ? null : senate?.asOf || null },
    // Which parts were carried from the Congress before this one.
    carried,
  }
}

let memo = null

// Cached per function instance for ten minutes; a failed load is not cached.
// `roster.congress` is the Congress the members were read from: the one asked
// for, or the one before it when the new one has no record yet.
export function getRoster(congress = currentCongress()) {
  const now = Date.now()
  if (memo && memo.congress === congress && now - memo.at < TTL_MS) return memo.promise
  const promise = loadRoster(congress)
  memo = { congress, at: now, promise }
  promise.catch(() => { if (memo?.promise === promise) memo = null })
  return promise
}

export function _resetRosterCache() {
  memo = null
  memberMemo.clear()
}

// ---------------------------------------------------------------------------
// Name search
// ---------------------------------------------------------------------------

const TITLES = new Set([
  'sen', 'senator', 'rep', 'representative', 'congressman', 'congresswoman', 'congressmember', 'congressperson',
  'delegate', 'del', 'speaker', 'leader', 'whip', 'chair', 'chairman', 'chairwoman', 'mr', 'mrs', 'ms', 'dr', 'hon', 'the',
])
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv'])
// A title that says which chamber the person means.
const TITLE_CHAMBER = {
  sen: 'senate', senator: 'senate',
  rep: 'house', representative: 'house', congressman: 'house', congresswoman: 'house', congressmember: 'house', congressperson: 'house',
  delegate: 'house', del: 'house', speaker: 'house',
}

// Given names people use interchangeably. The record stores whichever form
// the member uses ("Bernie Sanders" but "Charles Schumer"), so a search has to
// accept both.
const NICKNAME_GROUPS = [
  ['charles', 'chuck', 'charlie'], ['bernard', 'bernie'], ['william', 'bill', 'billy', 'will'], ['robert', 'bob', 'bobby', 'rob'],
  ['richard', 'rick', 'dick', 'rich'], ['james', 'jim', 'jimmy', 'jamie'], ['joseph', 'joe', 'joey'], ['thomas', 'tom', 'tommy'],
  ['michael', 'mike'], ['edward', 'ed', 'eddie', 'ted'], ['theodore', 'ted', 'teddy'], ['elizabeth', 'liz', 'beth', 'betsy'],
  ['katherine', 'catherine', 'kathy', 'cathy', 'kate', 'katie'], ['margaret', 'maggie', 'peggy'], ['patricia', 'pat', 'patty'],
  ['patrick', 'pat'], ['christopher', 'chris'], ['christine', 'chris', 'chrissy'], ['daniel', 'dan', 'danny'], ['donald', 'don'],
  ['david', 'dave'], ['stephen', 'steven', 'steve'], ['timothy', 'tim'], ['anthony', 'tony'], ['gregory', 'greg'], ['jeffrey', 'jeff'],
  ['kenneth', 'ken'], ['lawrence', 'larry'], ['matthew', 'matt'], ['nicholas', 'nick'], ['peter', 'pete'], ['raymond', 'ray'],
  ['ronald', 'ron'], ['samuel', 'sam'], ['andrew', 'andy', 'drew'], ['benjamin', 'ben'], ['gerald', 'gerry', 'jerry'],
  ['jerrold', 'jerry'], ['john', 'jack', 'johnny'], ['jonathan', 'jon'], ['alexander', 'alex'], ['alexandria', 'alex'],
  ['abigail', 'abby'], ['deborah', 'debbie', 'deb'], ['susan', 'sue', 'susie'], ['suzanne', 'sue'], ['cynthia', 'cindy'],
  ['mitchell', 'mitch'], ['douglas', 'doug'], ['frederick', 'fred'], ['henry', 'hank'], ['harold', 'hal'], ['vincent', 'vince'],
  ['zachary', 'zach'], ['nathaniel', 'nathan', 'nate'], ['jacob', 'jake'], ['joshua', 'josh'], ['philip', 'phil'], ['russell', 'russ'],
  ['louis', 'lou'], ['leonard', 'len', 'lenny'], ['eugene', 'gene'], ['albert', 'al'], ['alan', 'al'], ['victoria', 'vicky'],
  ['rebecca', 'becca', 'becky'], ['jennifer', 'jen', 'jenny'], ['kimberly', 'kim'], ['pamela', 'pam'], ['sandra', 'sandy'],
  ['teresa', 'terri', 'terry'], ['barbara', 'barb'], ['marcus', 'marc'], ['randall', 'randy'], ['rodney', 'rod'],
  ['bradley', 'brad'], ['clifford', 'cliff'], ['dennis', 'denny'], ['wesley', 'wes'], ['maxwell', 'max'], ['valerie', 'val'],
  ['earl', 'buddy'], ['jesus', 'chuy'],
]
const NICKNAMES = new Map()
for (const group of NICKNAME_GROUPS) {
  for (const name of group) NICKNAMES.set(name, new Set([...(NICKNAMES.get(name) || []), ...group]))
}

export function nameTokens(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['‘’`.]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
}

function sameGivenName(a, b) {
  return a === b || Boolean(NICKNAMES.get(a)?.has(b))
}

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = cur[0]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (cur[j] < best) best = cur[j]
    }
    if (best > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

// 0 when the name does not match. A match needs every word of the query
// found in the name, or the family name found (so "Eleanor Holmes Norton"
// finds "Eleanor Norton" and "Chuck Shumer" finds "Charles Schumer", but
// "Nancy Smith" does not return every Nancy).
export function scoreName(queryTokens, name) {
  const words = nameTokens(name).filter((w) => !SUFFIXES.has(w))
  if (!queryTokens.length || !words.length) return 0
  const family = words.length > 1 ? words.slice(1) : words
  // "aoc" finds Alexandria Ocasio-Cortez.
  if (queryTokens.length === 1 && words.length >= 3 && queryTokens[0] === words.map((w) => w[0]).join('')) return 95

  let exact = 0
  let prefix = 0
  let familyHit = false
  let fuzzy = false
  for (const q of queryTokens) {
    if (words.some((w, i) => (i === 0 ? sameGivenName(w, q) : w === q))) {
      exact += 1
      if (family.includes(q)) familyHit = true
    } else if (q.length >= 2 && words.some((w) => w.startsWith(q))) {
      prefix += 1
      if (family.some((w) => w.startsWith(q))) familyHit = true
    } else if (q.length >= 4 && family.some((w) => editDistance(w, q, q.length >= 7 ? 2 : 1) <= (q.length >= 7 ? 2 : 1))) {
      fuzzy = true
    }
  }
  const all = exact + prefix === queryTokens.length
  if (!all && !familyHit && !fuzzy) return 0
  const base = Math.round((100 * (exact + 0.8 * prefix)) / queryTokens.length)
  if (all) return base
  if (familyHit) return Math.max(40, Math.min(79, base))
  return Math.max(20, Math.min(39, base + 20))
}

// "California" or "ca" -> "CA"; null when it is not a state or territory.
export function stateCode(value) {
  const abbr = toStateAbbr(String(value || '').trim())
  return STATE_NAMES[abbr] ? abbr : null
}

// Read what a person typed: the name words, the chamber a title implies
// ("Rep.", "Senator") and a seat hint such as "(R-TX)" or "d-la-2".
export function parseMemberQuery(query) {
  const raw = String(query || '')
  const hint = /\(?(?<![A-Za-z])([DRI])-([A-Za-z]{2})(?![A-Za-z])(?:-(\d{1,2}|AL))?\)?/i.exec(raw)
  const words = nameTokens(hint ? raw.replace(hint[0], ' ') : raw)
  const title = words.find((t) => TITLE_CHAMBER[t])
  let tokens = words.filter((t) => !TITLES.has(t) && !SUFFIXES.has(t))
  // "A. O. C." is the initials "aoc".
  if (tokens.length > 1 && tokens.every((t) => t.length === 1)) tokens = [tokens.join('')]
  const state = hint ? stateCode(hint[2]) : null
  return {
    tokens,
    party: hint && state ? partyName(hint[1]) : null,
    state,
    district: hint && state && hint[3] ? (/^al$/i.test(hint[3]) ? '0' : String(Number(hint[3]))) : null,
    chamber: title ? TITLE_CHAMBER[title] : null,
  }
}

const seatOrder = (m) => `${m.chamber === 'senate' ? 0 : 1}-${m.state || ''}-${String(m.district ?? '').padStart(2, '0')}-${m.name || ''}`

// Members matching a name and/or filters, best match first. Without a name
// the list is the filtered roster in seat order.
export function searchRoster(roster, { query, state, chamber, party, includeFormer = false, ignoreTitle = false } = {}) {
  const parsed = parseMemberQuery(query)
  const wantState = state ? stateCode(state) : parsed.state
  const wantParty = party ? partyName(party) : parsed.party
  // An explicit chamber wins over the one a title implies; a district in the
  // seat hint means the House.
  const wantChamber = chamber ? String(chamber).toLowerCase() : (parsed.district ? 'house' : ignoreTitle ? null : parsed.chamber)
  const pool = roster.members.filter((m) =>
    (!wantState || m.state === wantState)
    && (!wantChamber || m.chamber === wantChamber)
    && (!wantParty || m.party === wantParty)
    && (!parsed.district || m.district === parsed.district))

  if (!parsed.tokens.length) {
    return pool.filter((m) => includeFormer || m.serving).sort((a, b) => seatOrder(a).localeCompare(seatOrder(b))).map((m) => ({ member: m, score: null }))
  }
  // A Bioguide ID typed as the query is a direct hit, within the filters.
  const asId = String(query || '').trim().toUpperCase()
  if (/^[A-Z]\d{6}$/.test(asId) && roster.byId.has(asId)) return pool.filter((m) => m.id === asId).map((member) => ({ member, score: 100 }))

  // A name search also covers members who have left (serving: false), so
  // "how did Vance vote as a senator" still resolves.
  const scored = pool
    .map((m) => ({ member: m, score: scoreName(parsed.tokens, m.name) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.member.serving) - Number(a.member.serving) || String(a.member.name).localeCompare(String(b.member.name)))
  // Only the best tier: a full-name match hides family-name-only and
  // close-spelling matches, which are shown when nothing better exists.
  const best = scored[0]?.score || 0
  const floor = best >= 80 ? 80 : best >= 40 ? 40 : 1
  return scored.filter((r) => r.score >= floor)
}
