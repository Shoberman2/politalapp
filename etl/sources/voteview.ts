/**
 * Voteview ICPSR ↔ bioguide alias source.
 *
 * UCSD Voteview publishes a hand-maintained crosswalk between ICPSR member IDs
 * (used in their roll-call data) and bioguide IDs (used by Congress.gov).
 *
 * Source: https://voteview.com/static/data/members/HSall_members.csv
 *
 * The full CSV has one row per (congress, member). We extract a deduplicated
 * (icpsr, bioguide_id) crosswalk and bulk-insert into member_id_aliases with
 * alias_source='voteview_icpsr'.
 *
 * This is fetched ONCE during P1 — not per Congress. The crosswalk is stable
 * (Voteview adds new members; historical IDs don't change).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils.js';
import type { MemberIdAlias, SourceFetchResult } from '../historicalTypes.js';

export const VOTEVIEW_CSV_URL =
  'https://voteview.com/static/data/members/HSall_members.csv';

interface VoteviewRow {
  icpsr: string;
  bioguide_id: string;
  bioname: string;
}

/**
 * Fetches the Voteview HSall_members.csv and parses to (icpsr, bioguide_id) rows.
 *
 * The CSV columns include: icpsr, bioguide_id, bioname, party_code, state_abbrev,
 * district_code, chamber, etc. We only need icpsr + bioguide_id + bioname for aliasing.
 *
 * Note: some Voteview rows have empty bioguide_id (very old members, pre-1900).
 * We skip those — they can't be aliased to anything in our system.
 */
async function fetchVoteviewCsv(): Promise<VoteviewRow[]> {
  logger.info(`[voteview] fetching crosswalk from ${VOTEVIEW_CSV_URL}`);
  const response = await fetch(VOTEVIEW_CSV_URL);
  if (!response.ok) {
    throw new Error(
      `Voteview fetch failed: ${response.status} ${response.statusText}`
    );
  }
  const text = await response.text();
  return parseVoteviewCsv(text);
}

/**
 * Parses Voteview CSV text into rows. Exported for testing.
 *
 * Voteview format uses standard CSV with header row. We only need three columns:
 *   icpsr, bioguide_id, bioname
 *
 * Skips rows with empty bioguide_id (cannot be aliased).
 */
export function parseVoteviewCsv(text: string): VoteviewRow[] {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map((s) => s.trim().toLowerCase());
  const icpsrIdx = header.indexOf('icpsr');
  const bioguideIdx = header.indexOf('bioguide_id');
  const bionameIdx = header.indexOf('bioname');

  if (icpsrIdx < 0 || bioguideIdx < 0) {
    throw new Error(
      `Voteview CSV missing required columns. Header: ${header.join(', ')}`
    );
  }

  const seen = new Set<string>();
  const rows: VoteviewRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    // Naive CSV split — Voteview rows do not contain quoted commas in the columns we use.
    // If they ever do, we'd need a real CSV parser.
    const cols = line.split(',');
    const icpsr = cols[icpsrIdx]?.trim();
    const bioguide = cols[bioguideIdx]?.trim();
    const bioname = bionameIdx >= 0 ? cols[bionameIdx]?.trim() ?? null : null;

    if (!icpsr || !bioguide) continue;
    const key = `${icpsr}::${bioguide}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({ icpsr, bioguide_id: bioguide, bioname: bioname ?? '' });
  }

  return rows;
}

/**
 * Bulk-upserts Voteview alias rows into member_id_aliases.
 */
export async function ingestVoteviewAliases(
  supabase: SupabaseClient
): Promise<SourceFetchResult> {
  const start = new Date();
  try {
    const rows = await fetchVoteviewCsv();
    logger.info(`[voteview] parsed ${rows.length} unique (icpsr,bioguide) rows`);

    const aliases: MemberIdAlias[] = rows.map((r) => ({
      canonical_bioguide: r.bioguide_id,
      alias_source: 'voteview_icpsr',
      alias_id: r.icpsr,
      notes: r.bioname || null,
    }));

    // Chunk to keep payloads small.
    const CHUNK = 500;
    let loaded = 0;
    for (let i = 0; i < aliases.length; i += CHUNK) {
      const chunk = aliases.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('member_id_aliases')
        .upsert(chunk, { onConflict: 'alias_source,alias_id' });
      if (error) {
        logger.error(`[voteview] upsert chunk ${i}-${i + chunk.length} failed`, error);
        throw error;
      }
      loaded += chunk.length;
      if (i % (CHUNK * 10) === 0) {
        logger.info(`[voteview] upserted ${loaded}/${aliases.length}`);
      }
    }

    return {
      source: 'voteview_aliases',
      congress: 0, // Voteview is global, not per-Congress
      status: 'success',
      records_loaded: loaded,
      records_skipped: 0,
      errors: [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      source: 'voteview_aliases',
      congress: 0,
      status: 'failed',
      records_loaded: 0,
      records_skipped: 0,
      errors: [message],
    };
  } finally {
    logger.info(
      `[voteview] ingest took ${
        (new Date().getTime() - start.getTime()) / 1000
      }s`
    );
  }
}
