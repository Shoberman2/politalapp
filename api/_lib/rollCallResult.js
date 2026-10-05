// Shared roll-call helpers for the server side: id parsing, tally sanity, and
// the result word. The result is NOT stored in the database; it is derived from
// the question and the tally with the real thresholds (cloture needs 60 in the
// Senate, suspension of the rules needs two-thirds, everything else a simple
// majority). Ported from src/services/floorVotes.js so the prerendered pages,
// the Markdown views, the sitemap, and the MCP tools all agree with the app.

export const CHAMBER_SIZE = { House: 435, Senate: 100 }

// "house-119-2-225" -> { chamberKey:'house', chamber:'House', congress:119, session:2, roll:225 }
export function parseRollCallId(id) {
  const m = /^(house|senate)-(\d+)-(\d+)-(\d+)$/.exec(String(id || '').toLowerCase())
  if (!m) return null
  return {
    chamberKey: m[1],
    chamber: m[1] === 'senate' ? 'Senate' : 'House',
    congress: Number(m[2]),
    session: Number(m[3]),
    roll: Number(m[4]),
  }
}

export function buildRollCallId({ congress, chamber, session, roll }) {
  const key = String(chamber || '').toLowerCase()
  if (!['house', 'senate'].includes(key)) return null
  const c = Number(congress), s = Number(session), r = Number(roll)
  if (![c, s, r].every((n) => Number.isInteger(n) && n > 0)) return null
  return `${key}-${c}-${s}-${r}`
}

// Calendar year of a session of Congress. Since the 20th Amendment each
// Congress meets for two sessions, the first in the odd year it convenes
// (1789 + 2 * (congress - 1)) and the second in the following even year:
// 119th Congress session 1 = 2025, session 2 = 2026. Returns null for anything
// else (a rare pre-1990 third session predates the online Clerk record).
export function sessionYear(congress, session) {
  const c = Number(congress), s = Number(session)
  if (!Number.isInteger(c) || c < 1 || (s !== 1 && s !== 2)) return null
  return 1789 + 2 * (c - 1) + (s - 1)
}

// The official record of a roll call: the House Clerk page
// (clerk.house.gov/Votes/{session year}{roll}) or the Senate LIS page
// (vote{congress}{session}/vote_{congress}_{session}_{roll:05}.htm). Takes a
// roll-call id ("house-119-1-123") or its parts. The one place these URLs are
// built: the ETL, the open-data exporter, the API, and the repair script all
// call it. Never derive the year from the clock: a 2025 vote loaded in 2026
// is still the 2025 record.
export function officialRollCallUrl(idOrParts) {
  const p = typeof idOrParts === 'string'
    ? parseRollCallId(idOrParts)
    : parseRollCallId(buildRollCallId(idOrParts || {}))
  if (!p) return null
  if (p.chamberKey === 'house') {
    const year = sessionYear(p.congress, p.session)
    return year ? `https://clerk.house.gov/Votes/${year}${p.roll}` : null
  }
  if (p.session !== 1 && p.session !== 2) return null
  return `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${p.congress}${p.session}/vote_${p.congress}_${p.session}_${String(p.roll).padStart(5, '0')}.htm`
}

// The source URL to show for a stored vote row: the official record derived
// from its roll-call id, falling back to the stored value only when the id
// cannot be parsed. Older rows carry a House Clerk URL with the wrong year.
export function voteSourceUrl(rollCallId, storedUrl) {
  return officialRollCallUrl(rollCallId) || storedUrl || null
}

export function rollCallPath(id) {
  const p = parseRollCallId(id)
  if (!p) return null
  return `/vote/${p.congress}/${p.chamberKey}/${p.session}/${p.roll}`
}

// Reject impossible totals (double-counted ETL rows) and empty rows.
export function saneTally(yea, nay, chamber) {
  if (yea == null || nay == null) return false
  const total = yea + nay
  return total > 0 && total <= (CHAMBER_SIZE[chamber] || 435)
}

export function tallyFromStats(stats) {
  if (!stats) return { yea: null, nay: null }
  const yea = (stats.dem_yea || 0) + (stats.rep_yea || 0) + (stats.ind_yea || 0)
  const nay = (stats.dem_nay || 0) + (stats.rep_nay || 0) + (stats.ind_nay || 0)
  return { yea, nay }
}

// Result word, derived only from a tally we trust. Returns null when the
// threshold is unknown rather than guessing. Thresholds: nomination cloture is
// a simple majority (since 2013 and 2017), legislative cloture needs 60,
// suspension of the rules, veto overrides and treaties need two-thirds,
// Senate budget-rule waivers need 60, everything else a simple majority. The
// Senate stores "On the Cloture Motion" as the question with the nominee only
// in the description, so the description is consulted too.
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
    return null // majority but under 60 on a motion whose threshold we cannot tell
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

export function resultKind(result) {
  if (!result) return null
  const r = result.toLowerCase()
  if (r.startsWith('passed') || r.includes('invoked') || r.includes('confirmed') || r.includes('agreed') || r.includes('overridden') || r === 'ratified') return 'passed'
  return 'failed'
}
