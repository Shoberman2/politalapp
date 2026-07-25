/**
 * Compute Committee Survival Stats
 *
 * Weekly cron. Aggregates `bill_committee_routings` into per-primary-committee
 * survival rates per Congress.
 *
 * Methodology (locked, documented in UI methodology modal):
 *   - **Per primary committee only.** A bill is counted toward exactly one
 *     committee — derived as the earliest `referred_at` row in
 *     bill_committee_routings (ties broken by alphabetic committee_code).
 *   - **"Advanced" = any of**: routings.activity_type IN (reported_by,
 *     discharged_from, markup), OR bills.legislative_stage >= 'floor'.
 *   - **Confidence floor**: only show a percentage when N >= 30 bills
 *     referred as primary for a (committee, congress) cell.
 *   - **methodology_version stored in PK** — bump when math changes.
 *
 * Backfill-race guard (per outside-voice D18): checks `backfill_state`
 * for an in-flight `phase_b_routings_backfill`. If running, skips the
 * run + logs `survival_skipped_during_backfill` so we don't publish
 * partial aggregates mid-backfill.
 *
 * Usage:
 *   npx tsx etl/computeCommitteeSurvival.ts
 *   npx tsx etl/computeCommitteeSurvival.ts --force   (skip backfill-state check)
 */

import { createClient } from '@supabase/supabase-js';
import { loadConfig, logger } from './utils.js';

const METHODOLOGY_VERSION = 'v1';

// Stages considered "advanced" past the initial referral.
const ADVANCED_STAGES = new Set(['floor', 'passed_one', 'passed_both', 'enacted']);

// Activity types that count as advancing OUT of committee.
const ADVANCED_ACTIVITY_TYPES = new Set(['reported_by', 'discharged_from', 'markup']);

interface PrimaryRouting {
  bill_id: string;
  committee_code: string;
  referred_at: string | null;
  legislative_stage: string | null;
}

interface RoutingWithStage {
  bill_id: string;
  committee_code: string;
  subcommittee_code: string | null;
  referred_at: string | null;
  activity_type: string | null;
  legislative_stage: string | null;
}

// Map current Congress number to year ranges so we group bills per Congress.
function congressForBillId(id: string): number | null {
  const match = /^(\d+)-/.exec(id);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes('--force');

  const config = loadConfig();
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --------- Backfill-race guard ---------
  if (!force) {
    const { data: sentinel, error: sentinelErr } = await supabase
      .from('backfill_state')
      .select('status, started_at')
      .eq('name', 'phase_b_routings_backfill')
      .maybeSingle();

    if (sentinelErr) {
      logger.warn(`backfill_state read failed (continuing): ${sentinelErr.message}`);
    } else if (sentinel && (sentinel as any).status === 'running') {
      logger.warn(
        `Phase B routings backfill is in progress (started ${(sentinel as any).started_at}). ` +
          `Skipping survival computation to avoid publishing partial aggregates. ` +
          `Bump feature_metrics(survival_skipped_during_backfill).`
      );
      // Counter increment is best-effort.
      await supabase
        .from('feature_metrics')
        .upsert(
          {
            metric_name: 'survival_skipped_during_backfill',
            day: new Date().toISOString().slice(0, 10),
            value: 1,
          },
          {
            onConflict: 'metric_name,day',
            ignoreDuplicates: false,
          }
        );
      // No actual value-increment via upsert in this path; the row will exist with
      // value=1. For continuous tracking, the api/metrics/inc.js pattern is used.
      return;
    }
  }

  // --------- Pull all routings (with bill stages joined) ---------
  // At ~200K routings post-backfill this is a single page-paginated query.
  logger.info('Loading bill_committee_routings + bills.legislative_stage...');
  const allRoutings: RoutingWithStage[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('bill_committee_routings')
      .select('bill_id, committee_code, subcommittee_code, referred_at, activity_type, bills!inner(legislative_stage)')
      // Total order over the table's unique key. Offset paging without an
      // ORDER BY can repeat and skip rows, quietly dropping routings from the
      // survival aggregate.
      .order('bill_id', { ascending: true })
      .order('committee_code', { ascending: true })
      .order('subcommittee_code', { ascending: true, nullsFirst: true })
      .range(offset, offset + PAGE - 1);

    if (error) {
      logger.error('Routings page fetch failed', error);
      throw error;
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      allRoutings.push({
        bill_id: (row as any).bill_id,
        committee_code: (row as any).committee_code,
        subcommittee_code: (row as any).subcommittee_code,
        referred_at: (row as any).referred_at,
        activity_type: (row as any).activity_type,
        legislative_stage: ((row as any).bills as any)?.legislative_stage ?? null,
      });
    }

    if (data.length < PAGE) break;
    offset += PAGE;
  }
  logger.info(`Loaded ${allRoutings.length} routings`);

  // --------- Derive primary committee per bill (DISTINCT ON equivalent in JS) ---------
  // Sort by (bill_id, referred_at ASC NULLS LAST, committee_code ASC), then
  // pick the first row per bill_id. This matches the DB-side DISTINCT ON
  // formulation called out in the migration index plan.
  allRoutings.sort((a, b) => {
    if (a.bill_id !== b.bill_id) return a.bill_id < b.bill_id ? -1 : 1;
    // referred_at ASC, NULLs last
    if (a.referred_at === null && b.referred_at !== null) return 1;
    if (b.referred_at === null && a.referred_at !== null) return -1;
    if (a.referred_at !== b.referred_at) {
      return (a.referred_at ?? '') < (b.referred_at ?? '') ? -1 : 1;
    }
    return a.committee_code < b.committee_code ? -1 : 1;
  });

  const primaryByBill = new Map<string, PrimaryRouting>();
  // Same bill_id can have many advance signals across multiple routings. We
  // track advance status per bill separately so secondary referrals can still
  // contribute their activity_type evidence.
  const advancedBills = new Set<string>();

  for (const r of allRoutings) {
    if (!primaryByBill.has(r.bill_id)) {
      primaryByBill.set(r.bill_id, {
        bill_id: r.bill_id,
        committee_code: r.committee_code,
        referred_at: r.referred_at,
        legislative_stage: r.legislative_stage,
      });
    }
    if (r.activity_type && ADVANCED_ACTIVITY_TYPES.has(r.activity_type)) {
      advancedBills.add(r.bill_id);
    }
    if (r.legislative_stage && ADVANCED_STAGES.has(r.legislative_stage)) {
      advancedBills.add(r.bill_id);
    }
  }

  // --------- Aggregate per (committee, congress) ---------
  interface Cell {
    referred: number;
    advanced: number;
  }
  const cells = new Map<string, Cell>(); // key: `${committee_code}:${congress}`

  for (const p of primaryByBill.values()) {
    const congress = congressForBillId(p.bill_id);
    if (congress == null) continue;
    const key = `${p.committee_code}:${congress}`;
    if (!cells.has(key)) {
      cells.set(key, { referred: 0, advanced: 0 });
    }
    const cell = cells.get(key)!;
    cell.referred++;
    if (advancedBills.has(p.bill_id)) cell.advanced++;
  }

  logger.info(`Aggregated ${cells.size} (committee, congress) cells from ${primaryByBill.size} primary referrals`);

  // --------- Upsert into committee_survival_stats ---------
  const now = new Date().toISOString();
  const rows: Array<{
    committee_code: string;
    congress: number;
    bills_referred_as_primary: number;
    bills_advanced: number;
    survival_pct: number | null;
    methodology_version: string;
    computed_at: string;
  }> = [];

  let insufficientHistoryCount = 0;
  for (const [key, cell] of cells) {
    const [code, congressStr] = key.split(':');
    const congress = parseInt(congressStr, 10);
    const survival_pct =
      cell.referred >= 30 ? Number(((cell.advanced / cell.referred) * 100).toFixed(2)) : null;
    if (survival_pct === null) insufficientHistoryCount++;
    rows.push({
      committee_code: code,
      congress,
      bills_referred_as_primary: cell.referred,
      bills_advanced: cell.advanced,
      survival_pct,
      methodology_version: METHODOLOGY_VERSION,
      computed_at: now,
    });
  }

  // Batched upsert
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('committee_survival_stats')
      .upsert(batch, {
        onConflict: 'committee_code,congress,methodology_version',
        ignoreDuplicates: false,
      });
    if (error) {
      logger.error(`Survival stats upsert batch ${i}-${i + BATCH} failed`, error);
      throw error;
    }
  }

  const pctInsufficient = cells.size === 0 ? 0 : Math.round((insufficientHistoryCount / cells.size) * 100);
  logger.info(
    `Survival stats upserted: ${rows.length} cells, ${insufficientHistoryCount} below confidence floor (${pctInsufficient}%)`
  );

  // Counter: insufficient_history_pct as a percentage value for the day.
  await supabase
    .from('feature_metrics')
    .upsert(
      {
        metric_name: 'committee_survival.insufficient_history_pct',
        day: new Date().toISOString().slice(0, 10),
        value: pctInsufficient,
      },
      {
        onConflict: 'metric_name,day',
        ignoreDuplicates: false,
      }
    );

  logger.info('computeCommitteeSurvival complete.');
}

main().catch((err) => {
  logger.error('computeCommitteeSurvival failed', err);
  process.exit(1);
});
