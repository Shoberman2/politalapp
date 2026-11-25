// Helpers for tests that need a roster (api/_lib/roster.js).

// A roster object as getRoster() resolves it, for tests that mock getRoster.
export function makeRoster(members, congress = 119) {
  const list = members.map((m) => ({ district: null, serving: true, ...m }))
  return { congress, members: list, byId: new Map(list.map((m) => [m.id, m])), servingAsOf: { house: '2026-11-19', senate: '2026-11-20' } }
}

// Enough placeholder ids for a roll call to count as a full chamber.
export function filler(prefix, n) {
  return Array.from({ length: n }, (_, i) => `${prefix}${String(900000 + i)}`)
}

// Seeds a makeSupabaseMock() so the real getRoster() can run: `seated` names
// who is listed in each chamber's roll calls; `newestRows` overrides how many
// rows the newest roll call returns (to model one still being ingested).
export function seedRosterTables(db, { politicians, terms, seated, newestRows = null, noRollCalls = false }) {
  db.responses.politicians = { data: politicians }
  db.responses.member_congress_terms = { data: terms }
  db.responses.roll_calls = (call) => {
    if (noRollCalls) return { data: [] }
    const like = call.ops.find((o) => o[0] === 'like')
    const base = like[2].replace('%', '')
    return { data: [
      { id: `${base}2-4`, voted_at: '2026-11-18' },
      { id: `${base}2-5`, voted_at: '2026-11-19' },
      { id: `${base}2-12`, voted_at: '2026-11-19' },
    ] }
  }
  db.responses.votes = (call) => {
    const eq = call.ops.find((o) => o[0] === 'eq' && o[1] === 'roll_call_id')
    if (!eq) return { data: [] }
    const chamber = eq[2].split('-')[0]
    const rows = (seated[chamber] || []).map((id) => ({ politician_id: id }))
    // Roll 12 is the newest (same day as roll 5, higher number).
    if (newestRows != null && eq[2].endsWith('-2-12')) return { data: rows.slice(0, newestRows) }
    return { data: rows }
  }
}
