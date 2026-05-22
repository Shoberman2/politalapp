/**
 * Senate.gov roll-call XML feed fetcher.
 *
 * Per-Congress URL pattern (varies by Congress; stored in
 * congress_metadata.senate_xml_url_pattern):
 *
 *   https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_{congress}_{session}.xml
 *
 * Each session has its own listing XML; vote details are at:
 *
 *   https://www.senate.gov/legislative/LIS/roll_call_votes/vote{congress}{session}/vote_{congress}_{session}_{rollNumber}.xml
 *
 * STATUS (P5): scaffold only — wire up after P0-P3 ship. The chamber UI
 * works fine without historical vote data (just shows party tints without
 * the moments overlay for those Congresses).
 *
 * When implementing:
 *   1. Fetch the per-session vote_menu XML; iterate roll numbers.
 *   2. For each roll number, fetch the detail XML with member votes.
 *   3. Match member XML LIS IDs to bioguide via the existing senate vote
 *      ETL pattern (etl/extractHouseVotes.ts does this for House; the same
 *      Senate side already exists in the codebase).
 *   4. Insert into votes + roll_calls tables with this Congress's session.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils.js';
import type { SourceFetchResult } from '../historicalTypes.js';

export async function ingestSenateGovRollCalls(
  _supabase: SupabaseClient,
  congress: number,
  _urlPattern: string | null
): Promise<SourceFetchResult> {
  logger.warn(
    `[senate-gov-roll-calls] STUB — P5 deliverable, not yet implemented for congress ${congress}`
  );
  return {
    source: 'senate_gov_roll_calls',
    congress,
    status: 'unavailable',
    records_loaded: 0,
    records_skipped: 0,
    errors: ['scaffold stub — P5 deliverable not yet implemented'],
    suggested_tier_downgrade: 'partial',
  };
}
