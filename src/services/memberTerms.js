/**
 * memberTerms.js — historical-chamber service for member_congress_terms.
 *
 * Reads the time-ranged join table created in migration 008. Used by:
 *   - SenateChamberMap (which senators are in this Congress)
 *   - DeskLineagePanel (cross-reference desk occupants to current senator data)
 *   - HouseCompositionMap (party balance per Congress)
 *   - PoliticianDetail's future career-arc section (E5 follow-up)
 *
 * All queries respect the composite PK (bioguide_id, congress, term_start)
 * — mid-Congress party switchers and resignations yield multiple rows per
 * (bioguide, congress) and the queries below preserve that.
 *
 * Returns plain JS objects (no class wrappers). Errors logged + thrown.
 */

import { supabase } from '../lib/supabase'

/**
 * Returns the most-recent term row for this member.
 * Tie-break: highest congress, then latest term_start.
 *
 * @returns {Promise<Object|null>} Term row or null if member has no terms.
 */
export async function getCurrentTermForMember(bioguideId) {
  if (!bioguideId) return null
  const { data, error } = await supabase
    .from('member_congress_terms')
    .select('*')
    .eq('bioguide_id', bioguideId)
    .order('congress', { ascending: false })
    .order('term_start', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.warn('[memberTerms] getCurrentTermForMember failed', error.message)
    return null
  }
  return data
}

/**
 * Returns ALL term rows for this member, oldest first.
 * Used by PoliticianDetail career-arc rendering (E5 follow-up).
 *
 * @returns {Promise<Array<Object>>} Term rows in chronological order.
 */
export async function getAllTermsForMember(bioguideId) {
  if (!bioguideId) return []
  const { data, error } = await supabase
    .from('member_congress_terms')
    .select('*')
    .eq('bioguide_id', bioguideId)
    .order('congress', { ascending: true })
    .order('term_start', { ascending: true })
  if (error) {
    console.warn('[memberTerms] getAllTermsForMember failed', error.message)
    return []
  }
  return data ?? []
}

/**
 * Returns all members serving in the given Congress, deduped by bioguide_id.
 * For party switchers (multiple terms in same Congress), returns the most
 * recent term row.
 *
 * Used by SenateChamberMap to label desks and apply party tints.
 *
 * @param {number} congress
 * @param {'senate'|'house'|null} chamber If null, returns both.
 * @returns {Promise<Array<Object>>}
 */
export async function getMembersByCongress(congress, chamber = null) {
  if (!Number.isInteger(congress)) return []
  let query = supabase
    .from('member_congress_terms')
    .select('*')
    .eq('congress', congress)
    .order('term_start', { ascending: false })
  if (chamber) {
    query = query.eq('chamber', chamber)
  }
  const { data, error } = await query
  if (error) {
    console.warn('[memberTerms] getMembersByCongress failed', error.message)
    return []
  }
  // Dedupe by bioguide_id, preferring the LATEST term_start (party switcher
  // most-recent stint wins for "who's in this Congress right now").
  const byBioguide = new Map()
  for (const term of data ?? []) {
    if (!byBioguide.has(term.bioguide_id)) {
      byBioguide.set(term.bioguide_id, term)
    }
  }
  return Array.from(byBioguide.values())
}

/**
 * Returns the term active for this member on the given date.
 * Handles mid-Congress changes by picking the row with the latest
 * term_start that is <= date AND (term_end IS NULL OR term_end >= date).
 *
 * @returns {Promise<Object|null>}
 */
export async function getTermForMemberAtDate(bioguideId, date) {
  if (!bioguideId || !(date instanceof Date)) return null
  const iso = date.toISOString().slice(0, 10) // YYYY-MM-DD
  const { data, error } = await supabase
    .from('member_congress_terms')
    .select('*')
    .eq('bioguide_id', bioguideId)
    .lte('term_start', iso)
    .or(`term_end.is.null,term_end.gte.${iso}`)
    .order('term_start', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.warn('[memberTerms] getTermForMemberAtDate failed', error.message)
    return null
  }
  return data
}

/**
 * Counts members in the given Congress, grouped by party. Used by
 * HouseCompositionMap to show "220 R · 213 D · 2 vacant" caption.
 *
 * @returns {Promise<{D: number, R: number, I: number, other: number, total: number}>}
 */
export async function getPartyComposition(congress, chamber) {
  const members = await getMembersByCongress(congress, chamber)
  const counts = { D: 0, R: 0, I: 0, other: 0, total: members.length }
  for (const m of members) {
    const party = (m.caucus || m.party || '').toUpperCase()
    if (party === 'D') counts.D++
    else if (party === 'R') counts.R++
    else if (party === 'I') counts.I++
    else counts.other++
  }
  return counts
}
