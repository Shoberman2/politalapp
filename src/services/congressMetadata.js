/**
 * congressMetadata.js — historical-chamber service for the
 * congress_metadata table.
 *
 * Drives:
 *   - Fidelity-tier banner in chamber pages (full / partial / composition_only)
 *   - Scrubber bounds (CONGRESS_MIN / CONGRESS_MAX)
 *   - Senate.gov URL pattern per Congress (P5 vote-backfill source resolution)
 */

import { supabase } from '../lib/supabase'

/**
 * Returns metadata for one Congress.
 *
 * @param {number} congress
 * @returns {Promise<Object|null>}
 */
export async function getCongressMetadata(congress) {
  if (!Number.isInteger(congress)) return null
  const { data, error } = await supabase
    .from('congress_metadata')
    .select('*')
    .eq('congress', congress)
    .maybeSingle()
  if (error) {
    console.warn('[congressMetadata] failed', error.message)
    return null
  }
  return data
}

/**
 * Returns metadata for all Congresses in the historical range.
 * Used by the scrubber to render year-tick labels + fidelity coloring.
 *
 * @returns {Promise<Array<Object>>}
 */
export async function getAllCongressMetadata() {
  const { data, error } = await supabase
    .from('congress_metadata')
    .select('*')
    .order('congress', { ascending: true })
  if (error) {
    console.warn('[congressMetadata] getAll failed', error.message)
    return []
  }
  return data ?? []
}
