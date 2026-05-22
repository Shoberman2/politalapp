/**
 * senateDesks.js — historical-chamber service for Senate desk data.
 *
 * Reads from migration 008 tables:
 *   - senate_desks (100 desk structural rows: side, arc, position, famous_name)
 *   - senate_desk_assignments (time-ranged occupant per Congress)
 *   - senate_desk_lineage (per-famous-desk occupant chain back to 1836+)
 *
 * Pairs with memberTerms.js to label desks with senator names + party tints.
 */

import { supabase } from '../lib/supabase'

/**
 * Returns all 100 Senate desks with their structural metadata.
 * Static reference data; cache aggressively in component state.
 *
 * @returns {Promise<Array<Object>>}
 */
export async function getAllSenateDesks() {
  const { data, error } = await supabase
    .from('senate_desks')
    .select('*')
    .order('desk_id', { ascending: true })
  if (error) {
    console.warn('[senateDesks] getAllSenateDesks failed', error.message)
    return []
  }
  return data ?? []
}

/**
 * Returns all desk assignments for the given Congress, deduped by desk_id
 * (latest assigned_at wins — handles mid-Congress resignation + appointment).
 *
 * @returns {Promise<Array<Object>>}
 */
export async function getDeskAssignmentsForCongress(congress) {
  if (!Number.isInteger(congress)) return []
  const { data, error } = await supabase
    .from('senate_desk_assignments')
    .select('*')
    .eq('congress', congress)
    .order('assigned_at', { ascending: false })
  if (error) {
    console.warn(
      '[senateDesks] getDeskAssignmentsForCongress failed',
      error.message
    )
    return []
  }
  // Dedupe by desk_id; the most-recent assignment wins for chart rendering.
  const byDesk = new Map()
  for (const a of data ?? []) {
    if (!byDesk.has(a.desk_id)) byDesk.set(a.desk_id, a)
  }
  return Array.from(byDesk.values())
}

/**
 * Returns the lineage (chronological list of occupants) for one desk.
 * Used by DeskLineagePanel ("Through this desk: 12 senators since 1836").
 *
 * @returns {Promise<Array<Object>>}
 */
export async function getLineageForDesk(deskId) {
  if (!Number.isInteger(deskId)) return []
  const { data, error } = await supabase
    .from('senate_desk_lineage')
    .select('*')
    .eq('desk_id', deskId)
    .order('year_start', { ascending: true })
  if (error) {
    console.warn('[senateDesks] getLineageForDesk failed', error.message)
    return []
  }
  return data ?? []
}

/**
 * Combined query: returns all desks + their assignment for the given Congress
 * + the joined politician (for current-snapshot fields). Single round trip
 * via Supabase's nested-select.
 *
 * Returns an array shape suitable for direct SenateChamberMap rendering:
 *   [{ desk_id, side, arc, position, famous_name, assignment: { bioguide_id, ... },
 *      politician: { name, party, state, ... } }, ...]
 */
export async function getChamberForCongress(congress) {
  if (!Number.isInteger(congress)) return []

  // Fetch desks (100 rows, static).
  const desks = await getAllSenateDesks()
  // Fetch assignments for this Congress.
  const assignments = await getDeskAssignmentsForCongress(congress)
  const assignmentByDesk = new Map(assignments.map((a) => [a.desk_id, a]))

  // Collect bioguide IDs we need to look up.
  const bioguides = assignments
    .map((a) => a.bioguide_id)
    .filter((b) => !!b)

  let politiciansByBioguide = new Map()
  if (bioguides.length > 0) {
    const { data: politicians, error } = await supabase
      .from('politicians')
      .select('id, name, party, state, district, photo_url')
      .in('id', bioguides)
    if (error) {
      console.warn('[senateDesks] politician join failed', error.message)
    } else {
      politiciansByBioguide = new Map(
        (politicians ?? []).map((p) => [p.id, p])
      )
    }
  }

  // Compose into one row per desk.
  return desks.map((desk) => {
    const assignment = assignmentByDesk.get(desk.desk_id) ?? null
    const politician = assignment?.bioguide_id
      ? politiciansByBioguide.get(assignment.bioguide_id) ?? null
      : null
    return {
      ...desk,
      assignment,
      politician,
    }
  })
}

/**
 * Returns the desk this senator currently holds (most-recent assignment with
 * no vacated_at).
 *
 * Used by E5 follow-up (career arcs on PoliticianDetail) — finds where this
 * senator sits today.
 */
export async function getCurrentDeskForSenator(bioguideId) {
  if (!bioguideId) return null
  const { data, error } = await supabase
    .from('senate_desk_assignments')
    .select('*')
    .eq('bioguide_id', bioguideId)
    .is('vacated_at', null)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.warn('[senateDesks] getCurrentDeskForSenator failed', error.message)
    return null
  }
  return data
}
