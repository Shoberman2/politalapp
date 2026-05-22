/**
 * Senate Historical Office desk-assignment source.
 *
 * The Senate Historical Office publishes per-Congress seating charts but they
 * are PDFs / images, not machine-readable feeds. For v1 we use hand-curated
 * desk assignment data in etl/historical/desks/<congress>.ts for the
 * Congresses we have data for (initially 119th only).
 *
 * For Congresses without hand-curated data, this source returns 'unavailable'
 * and the orchestrator downgrades the Congress's fidelity_tier to
 * 'composition_only'.
 *
 * Future work (deferred to TODOs):
 *   - Hand-curate desk assignments for 101st-118th from SHO PDFs (~1700 rows)
 *   - Backfill the famous-desk lineage (senate_desk_lineage) for the ~15
 *     tracked famous desks (Webster, Candy, Davis, etc.)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils.js';
import type {
  SenateDeskAssignment,
  SenateDeskLineageRow,
  SourceFetchResult,
} from '../historicalTypes.js';
import { getDeskDataForCongress } from '../historical/desks/index.js';

export async function ingestSenateHistoricalOfficeDesks(
  supabase: SupabaseClient,
  congress: number,
  congressStartDate: string
): Promise<SourceFetchResult> {
  const data = getDeskDataForCongress(congress);
  if (!data) {
    logger.info(
      `[sho-desks] no hand-curated desk data for congress ${congress} — fidelity stays composition_only`
    );
    return {
      source: 'senate_historical_office_desks',
      congress,
      status: 'unavailable',
      records_loaded: 0,
      records_skipped: 0,
      errors: [],
      suggested_tier_downgrade: 'composition_only',
    };
  }

  const assignments: SenateDeskAssignment[] = data.assignments.map((a) => ({
    congress,
    desk_id: a.deskId,
    assigned_at: a.assignedAt ?? congressStartDate,
    bioguide_id: a.bioguideId,
    vacated_at: a.vacatedAt ?? null,
    reason: a.reason ?? 'newly_seated',
    source: 'hand_curated_sho',
    confidence: a.confidence ?? 'high',
  }));

  const lineageRows: SenateDeskLineageRow[] = (data.lineageRows ?? []).map((l) => ({
    desk_id: l.deskId,
    year_start: l.yearStart,
    year_end: l.yearEnd ?? null,
    bioguide_id: l.bioguideId ?? null,
    occupant_name: l.occupantName ?? null,
    party: l.party ?? null,
    state: l.state ?? null,
    notes: l.notes ?? null,
    source: l.source ?? 'hand_curated_sho',
  }));

  try {
    if (assignments.length > 0) {
      const { error: aErr } = await supabase
        .from('senate_desk_assignments')
        .upsert(assignments, { onConflict: 'congress,desk_id,assigned_at' });
      if (aErr) throw aErr;
    }

    if (lineageRows.length > 0) {
      const { error: lErr } = await supabase
        .from('senate_desk_lineage')
        .upsert(lineageRows, { onConflict: 'desk_id,year_start' });
      if (lErr) throw lErr;
    }

    return {
      source: 'senate_historical_office_desks',
      congress,
      status: 'success',
      records_loaded: assignments.length + lineageRows.length,
      records_skipped: 0,
      errors: [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[sho-desks] failed for congress ${congress}`, message);
    return {
      source: 'senate_historical_office_desks',
      congress,
      status: 'failed',
      records_loaded: 0,
      records_skipped: assignments.length + lineageRows.length,
      errors: [message],
    };
  }
}
