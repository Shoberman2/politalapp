// Tool implementations for the MCP server, kept free of transport code so they
// can be unit-tested and reused by future API routes. Every result carries
// `canonical`, `source_url`, and `data_updated_at` so an agent can cite it.

import { supabaseAdmin } from './supabase.js'
import { getMemberPage, getRollCallPage, getBillPage, billPath, billLabel } from './pages.js'
import { buildRollCallId, rollCallPath } from './rollCallResult.js'
import { geocodeAddress, geocodeZip } from './geocode.js'
import { getDataUpdatedAt } from './etlMeta.js'
import { SITE_ORIGIN as SITE, congressGovMemberUrl } from './site.js'

const lastRun = getDataUpdatedAt

export function currentCongress(date = new Date()) {
  return Math.floor((date.getUTCFullYear() - 1789) / 2) + 1
}

function memberSummary(p) {
  return {
    bioguide_id: p.id,
    name: p.name,
    chamber: p.chamber,
    party: p.party,
    state: p.state,
    district: p.district ?? null,
    canonical: `${SITE}/politician/${p.id}`,
    source_url: congressGovMemberUrl(p.id),
  }
}

export async function findRepresentatives({ address, zip } = {}) {
  let geo = null
  if (address && String(address).trim()) geo = await geocodeAddress(String(address).trim())
  else if (zip) geo = await geocodeZip(zip)
  if (!geo || !geo.state) return { error: 'Could not resolve that location to a state and district.' }

  const congress = currentCongress()
  const [{ data: terms }, updatedAt] = await Promise.all([
    supabaseAdmin
      .from('member_congress_terms')
      .select('bioguide_id, chamber, state, district, party')
      .eq('congress', congress)
      .eq('state', geo.state)
      .is('term_end', null),
    lastRun(),
  ])
  const rows = terms || []
  const senators = rows.filter((t) => t.chamber === 'senate')
  const wantDistrict = geo.district == null ? null : String(geo.district)
  const house = rows.filter((t) => t.chamber === 'house' && (wantDistrict == null || String(t.district ?? '0') === wantDistrict || (wantDistrict === '0' && !t.district)))
  const ids = [...new Set([...senators, ...house].map((t) => t.bioguide_id))]
  const { data: people } = ids.length ? await supabaseAdmin.from('politicians').select('id, name, chamber, party, state, district').in('id', ids) : { data: [] }
  const byId = new Map((people || []).map((p) => [p.id, p]))
  const rep = (t) => {
    const p = byId.get(t.bioguide_id)
    return memberSummary(p ? { ...p, district: t.district ?? p.district } : { id: t.bioguide_id, name: t.bioguide_id, chamber: t.chamber, party: t.party, state: t.state, district: t.district })
  }
  return {
    location: { state: geo.state, district: geo.district, precision: geo.precision, matched_address: geo.matchedAddress || null, note: geo.note || null },
    congress,
    senators: senators.map(rep),
    representatives: house.map(rep),
    data_updated_at: updatedAt,
  }
}

export async function getMember({ bioguide_id }) {
  const m = await getMemberPage(bioguide_id)
  if (!m) return { error: `No member with Bioguide ID ${bioguide_id}` }
  return {
    ...memberSummary(m),
    photo_url: m.photo_url,
    terms: m.terms,
    stats: m.stats,
    recorded_votes: m.voteCount,
    latest_votes: m.votes.slice(0, 10).map((v) => ({
      roll_call_id: v.roll_call_id,
      voted_at: v.voted_at,
      question: v.question,
      bill: v.bill ? { id: v.bill.id, label: billLabel(v.bill.id), title: v.bill.title, canonical: `${SITE}${billPath(v.bill.id)}` } : null,
      position: v.position,
      source_url: v.source_url,
      canonical: `${SITE}${rollCallPath(v.roll_call_id)}`,
    })),
    data_updated_at: m.updatedAt,
  }
}

export async function getMemberVotes({ bioguide_id, since, limit = 50 }) {
  const id = String(bioguide_id || '').toUpperCase()
  const cap = Math.min(100, Math.max(1, Number(limit) || 50))
  let q = supabaseAdmin
    .from('votes')
    .select('roll_call_id, position, voted_at, source_url, bill_id, bills:bill_id ( id, title )', { count: 'exact' })
    .eq('politician_id', id)
    .order('voted_at', { ascending: false, nullsFirst: false })
    .limit(cap)
  if (since != null && since !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(since))) return { error: 'since must be a date in YYYY-MM-DD form' }
    q = q.gte('voted_at', since)
  }
  const [{ data, count, error }, updatedAt] = await Promise.all([q, lastRun()])
  if (error) return { error: 'Vote lookup failed' }
  const rollIds = [...new Set((data || []).map((v) => v.roll_call_id).filter(Boolean))]
  const questions = new Map()
  if (rollIds.length) {
    const { data: rcs } = await supabaseAdmin.from('roll_calls').select('id, question').in('id', rollIds)
    for (const rc of rcs || []) questions.set(rc.id, rc.question)
  }
  return {
    bioguide_id: id,
    total: count ?? (data || []).length,
    canonical: `${SITE}/politician/${id}`,
    votes: (data || []).map((v) => ({
      roll_call_id: v.roll_call_id,
      voted_at: v.voted_at,
      question: questions.get(v.roll_call_id) || null,
      bill: v.bills ? { id: v.bills.id, label: billLabel(v.bills.id), title: v.bills.title, canonical: `${SITE}${billPath(v.bills.id)}` } : null,
      position: v.position,
      source_url: v.source_url,
      canonical: `${SITE}${rollCallPath(v.roll_call_id)}`,
    })),
    data_updated_at: updatedAt,
  }
}

export async function getRollCall({ congress, chamber, session, roll }) {
  const id = buildRollCallId({ congress, chamber, session, roll })
  if (!id) return { error: 'Need congress, chamber (house|senate), session, and roll number.' }
  const rc = await getRollCallPage(id)
  if (!rc) return { error: `No roll call ${id}` }
  return {
    roll_call_id: rc.id,
    chamber: rc.chamber,
    congress: rc.congress,
    session: rc.session,
    roll: rc.roll,
    voted_at: rc.voted_at,
    question: rc.question,
    description: rc.description,
    bill: rc.bill ? { id: rc.bill.id, label: billLabel(rc.bill.id), title: rc.bill.title, source_url: rc.bill.source_url, canonical: `${SITE}${billPath(rc.bill.id)}` } : null,
    tally: rc.tally,
    by_party: rc.party,
    result_derived: rc.result,
    votes: rc.votes.map((v) => ({ bioguide_id: v.member.id, name: v.member.name, party: v.member.party, state: v.member.state, district: v.member.district, position: v.position })),
    canonical: `${SITE}${rollCallPath(rc.id)}`,
    source_url: rc.source_url,
    data_quality: rc.indexable ? 'ok' : rc.noindexReason,
    data_updated_at: rc.updatedAt,
  }
}

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

export async function searchBills({ query, limit = 20 }) {
  const q = String(query || '').trim()
  if (!q) return { error: 'Query is required.' }
  const cap = Math.min(50, Math.max(1, Number(limit) || 20))
  const direct = normalizeBillId(q)
  const updatedAt = await lastRun()
  if (direct) {
    const { data } = await supabaseAdmin.from('bills').select('id, title, introduced_at, policy_area, source_url, legislative_stage').eq('id', direct).maybeSingle()
    if (data) return { query: q, results: [billHit(data)], data_updated_at: updatedAt }
  }
  const { data, error } = await supabaseAdmin
    .from('bills')
    .select('id, title, introduced_at, policy_area, source_url, legislative_stage')
    .ilike('title', `%${q.replace(/[%_*\\]/g, ' ').trim()}%`)
    .order('introduced_at', { ascending: false, nullsFirst: false })
    .limit(cap)
  if (error) return { error: 'Search failed' }
  return { query: q, results: (data || []).map(billHit), data_updated_at: updatedAt }
}

function billHit(b) {
  return { id: b.id, label: billLabel(b.id), title: b.title, introduced_at: b.introduced_at, policy_area: b.policy_area, stage: b.legislative_stage, canonical: `${SITE}${billPath(b.id)}`, source_url: b.source_url }
}

export async function getBill({ id }) {
  const billId = normalizeBillId(id)
  if (!billId) return { error: 'Bill id looks wrong. Use 119-hr-1 or "H.R. 1".' }
  const b = await getBillPage(billId)
  if (!b) return { error: `No bill ${billId}` }
  return {
    id: b.id,
    label: b.label,
    title: b.title,
    congress: b.congress,
    sponsor: b.sponsor ? { ...b.sponsor, canonical: `${SITE}/politician/${b.sponsor.id}` } : null,
    introduced_at: b.introduced_at,
    policy_area: b.policy_area,
    stage: b.legislative_stage,
    official_summary: b.crs_summary || null,
    recorded_votes: b.rollCalls.map((r) => ({ roll_call_id: r.id, chamber: r.chamber, voted_at: r.voted_at, question: r.question, tally: r.tally, result_derived: r.result, canonical: `${SITE}${rollCallPath(r.id)}` })),
    canonical: `${SITE}${billPath(b.id)}`,
    source_url: b.source_url,
    data_updated_at: b.updatedAt,
  }
}

// Cached, source-grounded explanation only. Never generates on demand.
export async function explainBill({ id }) {
  const billId = normalizeBillId(id)
  if (!billId) return { error: 'Bill id looks wrong. Use 119-hr-1 or "H.R. 1".' }
  const b = await getBillPage(billId)
  if (!b) return { error: `No bill ${billId}` }
  return {
    id: b.id,
    label: b.label,
    title: b.title,
    plain_english: b.oneLiner || null,
    official_summary: b.crs_summary || null,
    note: b.oneLiner ? 'plain_english is an AI summary grounded in the official CRS summary; cite official_summary and source_url.' : 'No cached explanation. Use official_summary when present, otherwise the source_url.',
    canonical: `${SITE}${billPath(b.id)}`,
    source_url: b.source_url,
    data_updated_at: b.updatedAt,
  }
}
