/**
 * Senate Historical Office desk-assignment source.
 *
 * Desk data lives in etl/historical/desks/<congress>.ts. The 119th file is
 * generated from the floor plans behind the Senate's interactive seating map
 * (machine-readable XML, published back to the 108th Congress); see the
 * header of that file for the URLs.
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
import { getDeskDataForCongress, type DeskDataForCongress } from '../historical/desks/index.js';

// The source value the original invented lineage rows carried. Only those rows
// are cleared from retired desks; real lineage filed later is left alone.
const STUB_LINEAGE_SOURCE = 'senate_historical_office';

/** Checks a Congress's desk file before anything is written. Returns problems; empty means sound. */
export function validateDeskData(data: DeskDataForCongress): string[] {
  const problems: string[] = [];
  const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= 100;

  if (data.desks) {
    const ids = new Set(data.desks.map((d) => d.deskId));
    if (data.desks.length !== 100 || ids.size !== 100) {
      problems.push(`desks: expected 100 distinct desks, found ${data.desks.length} rows / ${ids.size} distinct`);
    }
    const slots = new Set<string>();
    for (const d of data.desks) {
      if (!inRange(d.deskId)) problems.push(`desks: desk id ${d.deskId} is outside 1-100`);
      if (!(d.arc >= 1 && d.arc <= 4)) problems.push(`desks: desk ${d.deskId} has arc ${d.arc}`);
      const slot = `${d.arc}:${d.position}`;
      if (slots.has(slot)) problems.push(`desks: two desks share row ${d.arc} position ${d.position}`);
      slots.add(slot);
    }
  }

  const keys = new Set<string>();
  const current = new Map<number, number>();
  for (const a of data.assignments) {
    if (!inRange(a.deskId)) problems.push(`assignments: desk id ${a.deskId} is outside 1-100`);
    if (a.bioguideId !== null && !/^[A-Z]\d{6}$/.test(a.bioguideId)) {
      problems.push(`assignments: desk ${a.deskId} has bioguide id "${a.bioguideId}"`);
    }
    const key = `${a.deskId}:${a.assignedAt ?? 'start'}`;
    if (keys.has(key)) problems.push(`assignments: desk ${a.deskId} has two rows starting ${a.assignedAt ?? 'at the start'}`);
    keys.add(key);
    if (!a.vacatedAt) current.set(a.deskId, (current.get(a.deskId) ?? 0) + 1);
  }
  for (const [deskId, n] of current) {
    if (n > 1) problems.push(`assignments: desk ${deskId} has ${n} current occupants`);
  }
  // One senator, one desk at a time.
  const holders = new Map<string, number>();
  for (const a of data.assignments) {
    if (a.bioguideId && !a.vacatedAt) holders.set(a.bioguideId, (holders.get(a.bioguideId) ?? 0) + 1);
  }
  for (const [bioguideId, n] of holders) {
    if (n > 1) problems.push(`assignments: ${bioguideId} currently holds ${n} desks`);
  }
  return problems;
}

export async function ingestSenateHistoricalOfficeDesks(
  supabase: SupabaseClient,
  congress: number,
  congressStartDate: string
): Promise<SourceFetchResult> {
  const data = getDeskDataForCongress(congress);
  if (!data) {
    logger.info(
      `[sho-desks] no desk data for congress ${congress}: fidelity stays composition_only`
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

  const problems = validateDeskData(data);
  if (problems.length > 0) {
    logger.error(`[sho-desks] desk data for congress ${congress} failed validation`, problems);
    return {
      source: 'senate_historical_office_desks',
      congress,
      status: 'failed',
      records_loaded: 0,
      records_skipped: data.assignments.length + (data.lineageRows ?? []).length,
      errors: problems,
    };
  }

  const source = data.source ?? 'hand_curated_sho';
  const assignments: SenateDeskAssignment[] = data.assignments.map((a) => ({
    congress,
    desk_id: a.deskId,
    assigned_at: a.assignedAt ?? congressStartDate,
    bioguide_id: a.bioguideId,
    vacated_at: a.vacatedAt ?? null,
    reason: a.reason ?? 'newly_seated',
    source,
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

  const deskRows = (data.desks ?? []).map((d) => ({
    desk_id: d.deskId,
    side: d.side,
    arc: d.arc,
    position: d.position,
    famous_name: d.famousName ?? null,
    description: d.description ?? null,
  }));

  try {
    let removed = 0;

    // 1. Lineage rows that an earlier version of the file filed under the
    //    wrong desks. Cleared first; the right desks get their rows in step 4.
    const retired = data.retiredFamousDeskIds ?? [];
    if (retired.length > 0) {
      const { error, count } = await supabase
        .from('senate_desk_lineage')
        .delete({ count: 'exact' })
        .in('desk_id', retired)
        .eq('source', STUB_LINEAGE_SOURCE);
      if (error) throw error;
      removed += count ?? 0;
    }

    // 2. Where each desk stands, and which desks have a name. All 100 rows.
    if (deskRows.length > 0) {
      const { error } = await supabase
        .from('senate_desks')
        .upsert(deskRows, { onConflict: 'desk_id' });
      if (error) throw error;
    }

    // 3. Assignments. Upsert the file's rows, then drop any row for this
    //    Congress the file no longer has (the file is the whole Congress).
    if (assignments.length > 0) {
      const { error: aErr } = await supabase
        .from('senate_desk_assignments')
        .upsert(assignments, { onConflict: 'congress,desk_id,assigned_at' });
      if (aErr) throw aErr;

      const keep = new Set(assignments.map((a) => `${a.desk_id}|${a.assigned_at}`));
      const { data: existing, error: eErr } = await supabase
        .from('senate_desk_assignments')
        .select('desk_id, assigned_at')
        .eq('congress', congress);
      if (eErr) throw eErr;
      for (const row of existing ?? []) {
        if (keep.has(`${row.desk_id}|${row.assigned_at}`)) continue;
        const { error: dErr } = await supabase
          .from('senate_desk_assignments')
          .delete()
          .eq('congress', congress)
          .eq('desk_id', row.desk_id)
          .eq('assigned_at', row.assigned_at);
        if (dErr) throw dErr;
        removed += 1;
      }
    }

    // 4. Lineage for the named desks.
    if (lineageRows.length > 0) {
      const { error: lErr } = await supabase
        .from('senate_desk_lineage')
        .upsert(lineageRows, { onConflict: 'desk_id,year_start' });
      if (lErr) throw lErr;
    }

    if (removed > 0) logger.info(`[sho-desks] removed ${removed} superseded rows for congress ${congress}`);

    return {
      source: 'senate_historical_office_desks',
      congress,
      status: 'success',
      records_loaded: deskRows.length + assignments.length + lineageRows.length,
      records_skipped: 0,
      errors: [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
    logger.error(`[sho-desks] failed for congress ${congress}`, message);
    return {
      source: 'senate_historical_office_desks',
      congress,
      status: 'failed',
      records_loaded: 0,
      records_skipped: deskRows.length + assignments.length + lineageRows.length,
      errors: [message],
    };
  }
}
