// Page data loaders shared by the prerender function, the Markdown views, and
// the MCP tools. Everything here reads with the service role on the server and
// returns plain objects with an `indexable` verdict from indexGate.js.

import { supabaseAdmin } from './supabase.js'
import { parseBillId, formatBillNumber } from './billCard.js'
import { parseRollCallId, deriveResult, resultKind, saneTally, tallyFromStats, voteSourceUrl } from './rollCallResult.js'
import { memberGate, rollCallGate, billGate, explanationMatchesBill, isPlaceholderTitle } from './indexGate.js'
import { getDataUpdatedAt } from './etlMeta.js'
import { MAX_ROLL_CALL_ROWS, EXPLANATION_MODEL, EXPLANATION_PROMPT_VERSION, congressGovMemberUrl, bioguideUrl } from './site.js'
import { shapeMemberRecord, houseDistrict, RECORD_VOTE_LIMIT } from '../../shared/memberRecord.js'
import { shapeMembers, groupMembers } from '../../shared/membersIndex.js'

// Bill titles are sometimes stubs ("HR 4795"); treat those as unknown.
function realTitle(title) {
  return isPlaceholderTitle(title) ? null : title
}

const MEMBER_VOTE_LIMIT = 50
export const SPONSORED_LIMIT = 20
export const COSPONSORED_LIMIT = 10
// Rows read before the real-title and billGate filters, so skipped stubs do not
// leave the list short.
const BILL_SCAN = 80
const BILLS_TIMEOUT_MS = 2500

// A failed read must not render a real member as "no recorded votes" (and
// noindex or cache them): throw, and prerender serves the uncached app shell.
function must(res, what) {
  if (res?.error) throw new Error(`${what}: ${res.error.message || 'query failed'}`)
  return res?.data ?? null
}
const lastRun = getDataUpdatedAt

export function billLabel(billId) {
  const parsed = parseBillId(billId)
  return parsed ? formatBillNumber(parsed) : billId
}

export function billPath(billId) {
  const parsed = parseBillId(billId)
  return parsed ? `/bill/${parsed.congress}/${parsed.billType}/${parsed.number}` : null
}

// Sponsored and cosponsored bills for the member page. The bill list is an
// extra: any failure or a slow answer returns null and the page renders
// without the section.
function shapeBillRow(b) {
  const parsed = parseBillId(b.id)
  if (!parsed) return null
  return {
    id: b.id,
    congress: Number(parsed.congress),
    label: formatBillNumber(parsed),
    path: billPath(b.id),
    title: b.title,
    introduced_at: b.introduced_at || null,
    source_url: /^https?:\/\//i.test(String(b.source_url || '')) ? b.source_url : null,
  }
}

// Member bill lists drop placeholder titles ("To amend title X...", stubs)
// so no thin title is shown as if it were real. Real-titled bills are listed
// even without a roll call or summary: their bill pages are noindex stubs
// (billGate) that the client fills in, which the spec allows.
function realTitledBillIds(rows) {
  return new Set(rows.filter((b) => !isPlaceholderTitle(b.title)).map((b) => b.id))
}

const byRecent = (a, b) => (b.congress - a.congress) || String(b.introduced_at || '').localeCompare(String(a.introduced_at || ''))

export async function getMemberBills(id) {
  const [sponsoredRes, cosponsoredRes] = await Promise.all([
    supabaseAdmin.from('bills')
      .select('id, title, introduced_at, source_url', { count: 'exact' })
      .eq('sponsor_bioguide_id', id)
      .order('introduced_at', { ascending: false, nullsFirst: false })
      .limit(BILL_SCAN),
    supabaseAdmin.from('bill_cosponsors')
      .select('cosponsored_at, bills:bill_id ( id, title, introduced_at, source_url )', { count: 'exact' })
      .eq('bioguide_id', id)
      .is('withdrawn_at', null)
      .order('cosponsored_at', { ascending: false, nullsFirst: false })
      .limit(BILL_SCAN),
  ])
  const sponsoredRows = must(sponsoredRes, 'bills') || []
  const cosponsoredRows = (must(cosponsoredRes, 'bill_cosponsors') || []).map((r) => r.bills).filter(Boolean)
  const ok = realTitledBillIds([...sponsoredRows, ...cosponsoredRows])
  const shape = (rows, limit) => rows.filter((b) => ok.has(b.id)).map(shapeBillRow).filter(Boolean).sort(byRecent).slice(0, limit)
  return {
    sponsored: { total: sponsoredRes.count ?? sponsoredRows.length, items: shape(sponsoredRows, SPONSORED_LIMIT) },
    cosponsored: { total: cosponsoredRes.count ?? cosponsoredRows.length, items: shape(cosponsoredRows, COSPONSORED_LIMIT) },
  }
}

function boundedBills(id) {
  let timer
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), BILLS_TIMEOUT_MS) })
  const read = getMemberBills(id).catch((err) => { console.error('[pages] member bills unavailable:', err.message); return null })
  return Promise.race([read, timeout]).finally(() => clearTimeout(timer))
}

export async function getMemberPage(bioguideId) {
  const id = String(bioguideId || '').toUpperCase()
  if (!/^[A-Z]\d{6}$/.test(id)) return null

  const [memberRes, termsRes, statsRes, votesRes, updatedAt, bills] = await Promise.all([
    supabaseAdmin.from('politicians').select('id, name, chamber, state, district, party, photo_url, updated_at').eq('id', id).maybeSingle(),
    supabaseAdmin.from('member_congress_terms').select('congress, chamber, state, district, party, term_start, term_end').eq('bioguide_id', id).order('congress', { ascending: false }),
    supabaseAdmin.from('member_stats').select('congress, total_votes, yea_count, nay_count, present_count, not_voting_count, party_loyalty_pct').eq('politician_id', id).order('congress', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('votes')
      .select('roll_call_id, position, voted_at, source_url, bill_id, bills:bill_id ( id, title )', { count: 'exact' })
      .eq('politician_id', id)
      .order('voted_at', { ascending: false, nullsFirst: false })
      .limit(MEMBER_VOTE_LIMIT),
    lastRun(),
    boundedBills(id),
  ])
  // A failed read must not render a real member as "no recorded votes" (and
  // noindex them): throw, and prerender serves the uncached app shell instead.
  if (memberRes.error) throw new Error(memberRes.error.message)
  const member = memberRes.data
  if (!member) return null
  if (votesRes.error) throw new Error(votesRes.error.message)
  const terms = must(termsRes, 'member_congress_terms')
  const stats = must(statsRes, 'member_stats')

  const votes = votesRes.data || []
  const rollCallIds = [...new Set(votes.map((v) => v.roll_call_id).filter(Boolean))]
  const questions = new Map()
  if (rollCallIds.length) {
    const rcs = must(await supabaseAdmin.from('roll_calls').select('id, question').in('id', rollCallIds), 'roll_calls')
    for (const rc of rcs || []) questions.set(rc.id, rc.question)
  }

  const voteCount = votesRes.count ?? votes.length
  const gate = memberGate({ voteCount })

  // politicians.district is often null for House members; the current term
  // carries the seat. Prefer the newest open term, then the newest term.
  const termList = terms || []
  const currentTerm = termList.find((t) => !t.term_end) || termList[0] || null
  const district = member.chamber === 'house'
    ? houseDistrict(member.state, member.district ?? currentTerm?.district ?? null)
    : null

  return {
    kind: 'member',
    id: member.id,
    name: member.name,
    chamber: member.chamber,
    state: member.state,
    district: district == null ? null : String(district),
    party: member.party,
    photo_url: member.photo_url,
    terms: terms || [],
    stats: stats || null,
    voteCount,
    votes: votes.map((v) => ({
      roll_call_id: v.roll_call_id,
      position: v.position,
      voted_at: v.voted_at,
      source_url: voteSourceUrl(v.roll_call_id, v.source_url),
      bill: v.bills ? { id: v.bills.id, title: realTitle(v.bills.title) } : (v.bill_id ? { id: v.bill_id, title: null } : null),
      question: questions.get(v.roll_call_id) || null,
    })),
    bills,
    source_url: bioguideUrl(member.id),
    congress_gov_url: congressGovMemberUrl(member.id),
    indexable: gate.indexable,
    noindexReason: gate.reason,
    updatedAt,
  }
}

// "Record in 60 seconds" card: the same template and facts for every member
// (shared/memberRecord.js). Indexed under the same rule as the member page.
export async function getRecordPage(bioguideId) {
  const id = String(bioguideId || '').toUpperCase()
  if (!/^[A-Z]\d{6}$/.test(id)) return null

  const [memberRes, termsRes, statsRes, votesRes, updatedAt] = await Promise.all([
    supabaseAdmin.from('politicians').select('id, name, chamber, state, district, party, photo_url').eq('id', id).maybeSingle(),
    supabaseAdmin.from('member_congress_terms').select('congress, chamber, state, district, party, term_start, term_end').eq('bioguide_id', id).order('congress', { ascending: false }),
    supabaseAdmin.from('member_stats').select('congress, total_votes, yea_count, nay_count, present_count, not_voting_count').eq('politician_id', id).order('congress', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('votes')
      .select('roll_call_id, position, voted_at, source_url, bill_id, bills:bill_id ( id, title )', { count: 'exact' })
      .eq('politician_id', id)
      .order('voted_at', { ascending: false, nullsFirst: false })
      .limit(RECORD_VOTE_LIMIT),
    lastRun(),
  ])
  // A failed read must not render a real member as "no recorded votes" (and
  // noindex them): throw, and prerender serves the uncached app shell instead.
  if (memberRes.error) throw new Error(memberRes.error.message)
  const member = memberRes.data
  if (!member) return null
  if (votesRes.error) throw new Error(votesRes.error.message)
  const terms = must(termsRes, 'member_congress_terms')
  const stats = must(statsRes, 'member_stats')

  const votes = votesRes.data || []
  const ids = [...new Set(votes.map((v) => v.roll_call_id).filter(Boolean))]
  let rollCalls = []
  let rollCallStats = []
  if (ids.length) {
    const [rcRes, rcsRes] = await Promise.all([
      supabaseAdmin.from('roll_calls').select('id, question, description, bill_id').in('id', ids),
      supabaseAdmin.from('roll_call_stats').select('roll_call_id, dem_yea, dem_nay, rep_yea, rep_nay, ind_yea, ind_nay').in('roll_call_id', ids),
    ])
    rollCalls = must(rcRes, 'roll_calls') || []
    rollCallStats = must(rcsRes, 'roll_call_stats') || []
  }

  const record = shapeMemberRecord({ member, terms: terms || [], stats: stats || null, votes, voteCount: votesRes.count ?? votes.length, rollCalls, rollCallStats, updatedAt })
  const gate = memberGate({ voteCount: record.voteCount })
  return { ...record, indexable: gate.indexable, noindexReason: gate.reason }
}

export async function getRollCallPage(rollCallId) {
  const parsed = parseRollCallId(rollCallId)
  if (!parsed) return null
  const id = rollCallId.toLowerCase()

  const [{ data: rc }, { data: stats }, { data: memberVotes }, updatedAt] = await Promise.all([
    supabaseAdmin.from('roll_calls').select('id, bill_id, question, description, voted_at, updated_at').eq('id', id).maybeSingle(),
    supabaseAdmin.from('roll_call_stats').select('dem_yea, dem_nay, rep_yea, rep_nay, ind_yea, ind_nay').eq('roll_call_id', id).maybeSingle(),
    supabaseAdmin.from('votes')
      .select('position, source_url, voted_at, politicians:politician_id ( id, name, party, state, district, chamber )')
      .eq('roll_call_id', id)
      .limit(MAX_ROLL_CALL_ROWS),
    lastRun(),
  ])
  if (!rc) return null

  let bill = null
  if (rc.bill_id) {
    const { data } = await supabaseAdmin.from('bills').select('id, title, source_url, policy_area').eq('id', rc.bill_id).maybeSingle()
    bill = data ? { ...data, title: realTitle(data.title) } : { id: rc.bill_id, title: null, source_url: null, policy_area: null }
  }

  const rows = (memberVotes || []).filter((v) => v.politicians)
  const counted = { yea: 0, nay: 0, present: 0, notVoting: 0 }
  for (const v of rows) {
    if (v.position === 'Yea') counted.yea += 1
    else if (v.position === 'Nay') counted.nay += 1
    else if (v.position === 'Present') counted.present += 1
    else counted.notVoting += 1
  }
  const statsTally = tallyFromStats(stats)
  const hasStats = statsTally.yea != null && statsTally.yea + statsTally.nay > 0
  const tally = hasStats
    ? { yea: statsTally.yea, nay: statsTally.nay, present: counted.present, notVoting: counted.notVoting }
    : (rows.length ? counted : null)
  const sane = tally ? saneTally(tally.yea, tally.nay, parsed.chamber) : false
  const countedYeaNay = rows.length ? counted.yea + counted.nay : null
  const gate = rollCallGate({ yea: tally?.yea ?? null, nay: tally?.nay ?? null, countedYeaNay: hasStats ? countedYeaNay : null, sane })
  const result = tally && sane ? deriveResult(rc.question, tally.yea, tally.nay, parsed.chamber, rc.description) : null

  const votes = rows
    .map((v) => ({ position: v.position, member: v.politicians }))
    .sort((a, b) => String(a.member.name || '').localeCompare(String(b.member.name || '')))

  return {
    kind: 'vote',
    id: rc.id,
    ...parsed,
    question: rc.question || null,
    description: rc.description || null,
    voted_at: rc.voted_at || rows[0]?.voted_at || null,
    bill,
    tally: sane ? tally : null,
    rawTally: sane ? null : tally,
    party: stats ? {
      dem: { yea: stats.dem_yea || 0, nay: stats.dem_nay || 0 },
      rep: { yea: stats.rep_yea || 0, nay: stats.rep_nay || 0 },
      ind: { yea: stats.ind_yea || 0, nay: stats.ind_nay || 0 },
    } : null,
    result,
    resultKind: resultKind(result),
    votes,
    source_url: voteSourceUrl(id, rows[0]?.source_url),
    indexable: gate.indexable,
    noindexReason: gate.reason,
    updatedAt,
  }
}

export async function getBillPage(billId) {
  const parsed = parseBillId(billId)
  if (!parsed) return null
  const id = billId.toLowerCase()

  const [{ data: bill }, { data: rcs }, { data: explanation }, updatedAt] = await Promise.all([
    supabaseAdmin.from('bills').select('id, title, introduced_at, summary, crs_summary, policy_area, source_url, sponsor_bioguide_id, sponsor_name, sponsor_party, sponsor_state, legislative_stage, updated_at').eq('id', id).maybeSingle(),
    supabaseAdmin.from('roll_calls').select('id, question, description, voted_at').eq('bill_id', id).order('voted_at', { ascending: false, nullsFirst: false }),
    supabaseAdmin.from('bill_explanations').select('paragraphs, bill_title, key_points, source_kind, source_label, source_date, source_url').eq('bill_key', id).eq('model', EXPLANATION_MODEL).eq('prompt_version', EXPLANATION_PROMPT_VERSION).maybeSingle(),
    lastRun(),
  ])
  if (!bill) return null

  const rollCalls = []
  const ids = (rcs || []).map((r) => r.id)
  const statsById = new Map()
  if (ids.length) {
    const { data: stats } = await supabaseAdmin.from('roll_call_stats').select('roll_call_id, dem_yea, dem_nay, rep_yea, rep_nay, ind_yea, ind_nay').in('roll_call_id', ids)
    for (const s of stats || []) statsById.set(s.roll_call_id, s)
  }
  for (const r of rcs || []) {
    const meta = parseRollCallId(r.id)
    const t = tallyFromStats(statsById.get(r.id))
    const ok = t.yea != null && saneTally(t.yea, t.nay, meta?.chamber)
    const result = ok ? deriveResult(r.question, t.yea, t.nay, meta?.chamber, r.description) : null
    rollCalls.push({ id: r.id, chamber: meta?.chamber || null, question: r.question, voted_at: r.voted_at, tally: ok ? { yea: t.yea, nay: t.nay } : null, result, resultKind: resultKind(result) })
  }

  const oneLinerCandidate = explanation?.paragraphs?.[0] || null
  const explanationOk = oneLinerCandidate
    ? explanationMatchesBill({ explanationTitle: explanation.bill_title, oneLiner: oneLinerCandidate }, bill)
    : false
  const oneLiner = explanationOk ? oneLinerCandidate : null
  const summary = bill.crs_summary || bill.summary || null
  const gate = billGate({ title: bill.title, hasVote: rollCalls.length > 0, hasSummary: Boolean(summary) })

  return {
    kind: 'bill',
    id: bill.id,
    ...parsed,
    label: formatBillNumber(parsed),
    title: bill.title,
    introduced_at: bill.introduced_at,
    policy_area: bill.policy_area,
    legislative_stage: bill.legislative_stage,
    sponsor: bill.sponsor_bioguide_id ? { id: bill.sponsor_bioguide_id, name: bill.sponsor_name, party: bill.sponsor_party, state: bill.sponsor_state } : null,
    crs_summary: bill.crs_summary,
    summary,
    oneLiner,
    // Written by AI from the bill's own text (shared/billExplainer.js).
    explanation: explanationOk
      ? { summary: oneLiner, paragraphs: (explanation.paragraphs || []).slice(1), keyPoints: explanation.key_points || [], source: { kind: explanation.source_kind, label: explanation.source_label, date: explanation.source_date, url: explanation.source_url } }
      : null,
    explanationDiscarded: Boolean(oneLinerCandidate && !explanationOk),
    source_url: bill.source_url,
    rollCalls,
    indexable: gate.indexable,
    noindexReason: gate.reason,
    updatedAt,
  }
}

// Latest recorded roll calls for the server-rendered homepage. `latest` is the
// newest roll call whose tally passes the chamber-size sanity check (so the
// headline never shows a corrupt count); `recent` is the newest five, each
// with a tally and result only when the tally is sane. Throws on a failed
// read: the homepage then drops the section rather than render an empty or
// partial record as if it were complete.
const HOME_SCAN = 12
const HOME_RECENT = 5

export async function getHomeVotes() {
  const rcs = must(
    await supabaseAdmin.from('roll_calls')
      .select('id, bill_id, question, description, voted_at')
      .not('voted_at', 'is', null)
      .order('voted_at', { ascending: false })
      .limit(HOME_SCAN),
    'roll_calls',
  ) || []
  const rows = rcs.filter((r) => parseRollCallId(r.id))
  if (!rows.length) return { latest: null, recent: [] }

  const ids = rows.map((r) => r.id)
  const billIds = [...new Set(rows.map((r) => r.bill_id).filter(Boolean))]
  const [statsRes, billsRes] = await Promise.all([
    supabaseAdmin.from('roll_call_stats').select('roll_call_id, dem_yea, dem_nay, rep_yea, rep_nay, ind_yea, ind_nay').in('roll_call_id', ids),
    billIds.length ? supabaseAdmin.from('bills').select('id, title, sponsor_bioguide_id, sponsor_name').in('id', billIds) : Promise.resolve({ data: [] }),
  ])
  const statsById = new Map((must(statsRes, 'roll_call_stats') || []).map((s) => [s.roll_call_id, s]))
  const billsById = new Map((must(billsRes, 'bills') || []).map((b) => [b.id, b]))

  const shaped = rows.map((r) => {
    const meta = parseRollCallId(r.id)
    const t = tallyFromStats(statsById.get(r.id))
    const sane = saneTally(t.yea, t.nay, meta.chamber)
    const result = sane ? deriveResult(r.question, t.yea, t.nay, meta.chamber, r.description) : null
    const b = r.bill_id ? billsById.get(r.bill_id) : null
    return {
      id: r.id,
      chamber: meta.chamber,
      congress: meta.congress,
      session: meta.session,
      roll: meta.roll,
      question: r.question || null,
      description: r.description || null,
      voted_at: r.voted_at,
      bill: r.bill_id ? { id: r.bill_id, label: billLabel(r.bill_id), path: billPath(r.bill_id), title: realTitle(b?.title), sponsor: b?.sponsor_bioguide_id && b?.sponsor_name ? { id: b.sponsor_bioguide_id, name: b.sponsor_name } : null } : null,
      tally: sane ? { yea: t.yea, nay: t.nay } : null,
      result,
      resultKind: resultKind(result),
    }
  })
  return { latest: shaped.find((r) => r.tally) || null, recent: shaped.slice(0, HOME_RECENT) }
}

// Public members index (/members): the same set the members sitemap lists,
// every politician with at least one recorded vote. Sorted by name within
// each group. Throws on a failed read so prerender serves the plain shell
// instead of caching a partial list.
const PAGE = 1000

async function fetchAllRows(table, columns, modify, orderBy) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    let q = supabaseAdmin.from(table).select(columns).order(orderBy).range(from, from + PAGE - 1)
    if (modify) q = modify(q)
    const rows = must(await q, table) || []
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

export async function getMembersIndex() {
  const [politicians, stats, openTerms, updatedAt] = await Promise.all([
    fetchAllRows('politicians', 'id, name, chamber, state, district, party', null, 'id'),
    fetchAllRows('member_stats', 'politician_id, total_votes', (q) => q.gt('total_votes', 0), 'politician_id'),
    fetchAllRows('member_congress_terms', 'bioguide_id, congress, district', (q) => q.is('term_end', null), 'bioguide_id'),
    lastRun(),
  ])
  const members = shapeMembers({ politicians, votedIds: new Set(stats.map((r) => r.politician_id)), openTerms })
  return { kind: 'members', members, groups: groupMembers(members), total: members.length, indexable: true, updatedAt }
}
