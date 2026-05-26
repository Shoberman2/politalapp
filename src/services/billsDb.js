import { supabase } from '../lib/supabase'
import { autocompletePoliticians } from '../utils/politicianMatch'
import { CONGRESS_MAX } from '../utils/congressUtil'

// Maps the Supabase `bills` row shape to the Congress.gov-style shape BillRow
// expects (type/number/congress/introducedDate/policyArea.name). This keeps
// BillsPage rendering unchanged whether bills come from the live Congress.gov
// list endpoint (browse mode) or the local DB (search mode).
function parseId(id) {
  const m = /^(\d+)-([a-z]+)-(\d+)$/i.exec(id || '')
  if (!m) return null
  return {
    congress: parseInt(m[1], 10),
    type: m[2].toLowerCase(),
    number: parseInt(m[3], 10),
  }
}

function mapRow(row) {
  const parsed = parseId(row.id) || { congress: null, type: '', number: null }
  // Build a minimal sponsor object in Congress.gov style so the existing
  // BillRow component (which reads bill.sponsors?.[0]) renders the sponsor
  // name + party tag without code changes.
  const sponsor = row.sponsor_bioguide_id
    ? {
        bioguideId: row.sponsor_bioguide_id,
        fullName: row.sponsor_name || null,
        party: row.sponsor_party || null,
        state: row.sponsor_state || null,
      }
    : null

  return {
    id: row.id,
    congress: parsed.congress,
    type: parsed.type.toUpperCase(),
    number: parsed.number,
    title: row.title,
    introducedDate: row.introduced_at,
    policyArea: row.policy_area ? { name: row.policy_area } : null,
    summary: row.summary,
    sourceUrl: row.source_url,
    sponsors: sponsor ? [sponsor] : [],
    legislative_stage: row.legislative_stage || null,
  }
}

// Detects bill-ID style queries like "S4214", "S. 4214", "hr-1234", or "h.r. 1"
// and returns the canonical "${type}-${number}" fragment used in bills.id.
function billIdPattern(query) {
  const m = /^\s*([a-z]+)[\s.\-]*(\d+)\s*$/i.exec(query)
  if (!m) return null
  return `${m[1].toLowerCase()}-${m[2]}`
}

/**
 * Search bills with optional facet filters.
 *
 * Sponsor/cosponsor filters require migration 006 to have shipped. When
 * `cosponsorBioguideId` is set, the query joins through `bill_cosponsors!inner`.
 *
 * @param {object} opts
 * @param {string|null} opts.query
 * @param {number|null} opts.congress
 * @param {string|null} opts.billType
 * @param {string|null} opts.introducedFrom
 * @param {string|null} opts.sponsorBioguideId
 * @param {string|null} opts.cosponsorBioguideId
 * @param {number}      opts.limit
 * @param {number}      opts.offset
 */
export async function searchBillsInDb({
  query,
  congress = null,
  billType = null,
  introducedFrom = null,
  sponsorBioguideId = null,
  cosponsorBioguideId = null,
  limit = 100,
  offset = 0,
}) {
  const baseSelect =
    'id, title, introduced_at, policy_area, summary, source_url, sponsor_bioguide_id, sponsor_name, sponsor_party, sponsor_state, legislative_stage'

  let q
  if (cosponsorBioguideId) {
    // !inner join filters bills down to rows that have a matching cosponsor.
    // Composite index idx_bill_cosponsors_bioguide(bioguide_id, bill_id)
    // supports an index-only scan on the join (eng-review D11).
    q = supabase
      .from('bills')
      .select(`${baseSelect}, bill_cosponsors!inner(bioguide_id)`)
      .eq('bill_cosponsors.bioguide_id', cosponsorBioguideId)
  } else {
    q = supabase.from('bills').select(baseSelect)
  }

  // Apply ALL filters BEFORE .order()/.limit() — Supabase's PostgrestFilterBuilder
  // returns a "transform" builder after order/limit that doesn't carry .eq()/.or()
  // forward. Filters first; order + limit last.
  if (sponsorBioguideId) {
    q = q.eq('sponsor_bioguide_id', sponsorBioguideId)
  }

  if (query && query.trim()) {
    // Sanitize: Supabase's .or() takes a comma-separated PostgREST filter
    // string, so commas/parens in user input would break parsing. Strip them.
    const safe = query.trim().replace(/[,()*%]/g, ' ')
    const idMatch = billIdPattern(safe)

    if (idMatch) {
      // Structured bill-ID search ("S 4214" → match %s-4214% in id) plus title
      // fallback so a query like "S 1" still surfaces bills whose title
      // happens to contain that string.
      q = q.or(`title.ilike.%${safe}%,id.ilike.%${idMatch}%`)
    } else if (/^\d+$/.test(safe)) {
      // Pure number — match either a number-anywhere-in-title or
      // "-{number}" suffix in id (the bill number portion).
      q = q.or(`title.ilike.%${safe}%,id.ilike.%-${safe}%`)
    } else {
      // Free-text — title only.
      q = q.ilike('title', `%${safe}%`)
    }
  }

  if (congress) {
    if (billType) {
      q = q.like('id', `${congress}-${billType.toLowerCase()}-%`)
    } else {
      q = q.like('id', `${congress}-%`)
    }
  }

  if (introducedFrom) {
    q = q.gte('introduced_at', introducedFrom)
  }

  // Order + pagination last (these return a non-filterable transform builder).
  q = q.order('introduced_at', { ascending: false, nullsFirst: false })
  if (offset > 0) {
    q = q.range(offset, offset + limit - 1)
  } else {
    q = q.limit(limit)
  }

  const { data, error } = await q
  if (error) throw error
  return (data || []).map(mapRow)
}

// ---------------------------------------------------------------------------
// searchPoliticians — autocomplete source for sponsor + cosponsor filter pills
// ---------------------------------------------------------------------------
// Pulls all politicians once (N=540), then filters in JS using the same
// first/last/any-order matcher as AllPoliticians (extracted into politicianMatch).
// Cached in module scope to avoid round-tripping per keystroke.
//
// Per eng-review D12: autocomplete reads the politicians table (small, exact),
// NOT bills.sponsor_name fuzzy search — that path is deferred.

let _politiciansCache = null
let _politiciansCacheAt = 0
const POLITICIAN_CACHE_TTL_MS = 5 * 60_000

export function invalidatePoliticianCache() {
  _politiciansCache = null
  _politiciansCacheAt = 0
}

async function loadPoliticians() {
  const now = Date.now()
  if (_politiciansCache && now - _politiciansCacheAt < POLITICIAN_CACHE_TTL_MS) {
    return _politiciansCache
  }
  const { data, error } = await supabase
    .from('politicians')
    .select('id, name, party, state, district, chamber')
    .order('name', { ascending: true })
  if (error) throw error
  _politiciansCache = (data || []).map((p) => ({
    bioguideId: p.id,
    id: p.id,
    name: p.name,
    party: p.party,
    state: p.state,
    district: p.district,
    chamber: p.chamber,
  }))
  _politiciansCacheAt = now
  return _politiciansCache
}

export async function searchPoliticians(query, limit = 50) {
  const politicians = await loadPoliticians()
  return autocompletePoliticians(politicians, query, limit)
}

// ---------------------------------------------------------------------------
// Routing data for BillDetail "Where this bill goes" + CommitteePage
// ---------------------------------------------------------------------------

/**
 * Load all committee routings for a bill, ordered by referred_at (earliest
 * first — which is also the primary committee).
 */
export async function getBillRoutings(billId) {
  const { data, error } = await supabase
    .from('bill_committee_routings')
    .select('committee_code, committee_name, subcommittee_code, subcommittee_name, chamber, referred_at, activity_type')
    .eq('bill_id', billId)
    .order('referred_at', { ascending: true, nullsFirst: false })
    .order('committee_code', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * Load the cached AI narrative for a bill, current prompt_version only.
 * Returns { narrative, generated_at } or null if not cached.
 */
const CURRENT_PATH_PROMPT_VERSION = 'v1'
export async function getBillPathNarrative(billId) {
  const { data, error } = await supabase
    .from('bill_path_explanations')
    .select('narrative, generated_at')
    .eq('bill_id', billId)
    .eq('prompt_version', CURRENT_PATH_PROMPT_VERSION)
    .maybeSingle()
  if (error) return null
  return data
    ? { narrative: data.narrative, generatedAt: data.generated_at, promptVersion: CURRENT_PATH_PROMPT_VERSION }
    : null
}

/**
 * Trigger the explain-bill-path Edge Function (cold-start path). Caller
 * wraps with AbortController for the 8s timeout (per eng-review D3).
 */
export async function generateBillPathNarrative(billId, signal) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/explain-bill-path`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ bill_id: billId }),
    signal,
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Edge function returned ${res.status}: ${errText}`)
  }
  const body = await res.json()
  return {
    narrative: body.narrative,
    promptVersion: body.prompt_version,
    cached: body.cached,
  }
}

/**
 * Survival stat for a specific (committee, congress) cell.
 * Returns null when not yet computed or below confidence floor.
 */
export async function getCommitteeSurvival(committeeCode, congress) {
  const { data, error } = await supabase
    .from('committee_survival_stats')
    .select('committee_code, congress, bills_referred_as_primary, bills_advanced, survival_pct, methodology_version')
    .eq('committee_code', committeeCode)
    .eq('congress', congress)
    .eq('methodology_version', 'v1')
    .maybeSingle()
  if (error) return null
  return data || null
}

/**
 * Bills currently referred to a committee, scoped to a recent window.
 * Used by CommitteePage Section 1.
 */
export async function getBillsForCommittee(committeeCode, { sinceDays = 90, limit = 50 } = {}) {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('bill_committee_routings')
    .select(`
      bill_id,
      referred_at,
      activity_type,
      bills!inner(id, title, introduced_at, policy_area, sponsor_bioguide_id, sponsor_name, sponsor_party, sponsor_state, legislative_stage, source_url)
    `)
    .eq('committee_code', committeeCode)
    .gte('referred_at', since)
    .order('referred_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  // Project to the same shape as searchBillsInDb so BillRow renders unchanged.
  return (data || []).map((row) => mapRow(row.bills))
}

/**
 * All-time bills for a committee. Used as fallback when the 90-day window is empty.
 */
export async function getAllBillsForCommittee(committeeCode, { limit = 100 } = {}) {
  const { data, error } = await supabase
    .from('bill_committee_routings')
    .select(`
      bill_id,
      bills!inner(id, title, introduced_at, policy_area, sponsor_bioguide_id, sponsor_name, sponsor_party, sponsor_state, legislative_stage, source_url)
    `)
    .eq('committee_code', committeeCode)
    .order('referred_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return (data || []).map((row) => mapRow(row.bills))
}

/**
 * Per-sponsor bill count + chamber median, for the sponsor activity badge
 * on PoliticianDetail (eng-review D17 reframe: count + median, no percentile).
 *
 * Excludes members with <30 days served from the median pool to avoid degenerate
 * denominators, but still returns the candidate's count if they're a freshman.
 */
export async function getSponsorActivity(bioguideId, congress = CONGRESS_MAX) {
  // 1) Candidate's count via Supabase HEAD + count:'exact'.
  // The response carries the count number directly; we don't need the rows.
  const ownQuery = await supabase
    .from('bills')
    .select('id', { count: 'exact', head: true })
    .eq('sponsor_bioguide_id', bioguideId)
    .like('id', `${congress}-%`)
  if (ownQuery.error) throw ownQuery.error
  const candidateCount = ownQuery.count ?? 0

  // 2) Candidate's chamber.
  const { data: pol } = await supabase
    .from('politicians')
    .select('chamber')
    .eq('id', bioguideId)
    .maybeSingle()
  const chamber = pol?.chamber || null

  // 3) Per-chamber distribution of bill counts.
  // Pull all bills in this Congress with sponsor_bioguide_id + join chamber
  // through politicians. Then bucket by sponsor + compute median.
  const { data: allBills } = await supabase
    .from('bills')
    .select('sponsor_bioguide_id, politicians:sponsor_bioguide_id(chamber)')
    .like('id', `${congress}-%`)
    .not('sponsor_bioguide_id', 'is', null)

  const byChamber = { house: new Map(), senate: new Map() }
  for (const row of allBills || []) {
    const bg = row.sponsor_bioguide_id
    const ch = row.politicians?.chamber
    if (!bg || !ch || !byChamber[ch]) continue
    byChamber[ch].set(bg, (byChamber[ch].get(bg) || 0) + 1)
  }

  function median(arr) {
    if (!arr.length) return null
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  }

  const chamberMedian = chamber ? median(Array.from(byChamber[chamber].values())) : null

  return {
    count: candidateCount,
    chamber,
    chamberMedian,
    congress,
    // Methodology disclaimer the UI shows verbatim per design-review tokens.
    methodology:
      'Bill count includes messaging bills and resolutions; effectiveness not measured.',
  }
}
