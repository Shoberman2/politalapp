import { supabase } from '../lib/supabase'

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
  }
}

// Detects bill-ID style queries like "S4214", "S. 4214", "hr-1234", or "h.r. 1"
// and returns the canonical "${type}-${number}" fragment used in bills.id.
function billIdPattern(query) {
  const m = /^\s*([a-z]+)[\s.\-]*(\d+)\s*$/i.exec(query)
  if (!m) return null
  return `${m[1].toLowerCase()}-${m[2]}`
}

export async function searchBillsInDb({
  query,
  congress = null,
  billType = null,
  limit = 100,
}) {
  let q = supabase
    .from('bills')
    .select('id, title, introduced_at, policy_area, summary, source_url')
    .order('introduced_at', { ascending: false, nullsFirst: false })
    .limit(limit)

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

  const { data, error } = await q
  if (error) throw error
  return (data || []).map(mapRow)
}
