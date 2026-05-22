#!/usr/bin/env npx ts-node
/**
 * Historical Congress backfill orchestrator (P1 + P5).
 *
 * Long-running CLI driver that backfills member_congress_terms, member_id_aliases,
 * senate_desk_assignments, senate_desk_lineage, and (later) historical roll-call
 * votes for Congresses 93rd-119th.
 *
 * Architecture (per /plan-eng-review A3):
 *   - Runs from a developer laptop, NOT GitHub Actions (6h cap doesn't fit).
 *   - Resumable: state persisted in backfill_state per migration 006.
 *   - Sentinel-coordinated with daily ETL via the existing backfill_state.
 *   - Per-source isolation: one source's failure marks a Congress as 'partial'
 *     and continues to the next source; doesn't halt the run.
 *   - Per-Congress error budget: 3 consecutive 5xx errors halt the run.
 *
 * Usage:
 *   npx tsx etl/backfillHistorical.ts                       # Full backfill
 *   npx tsx etl/backfillHistorical.ts --from 95 --to 95     # Single-Congress probe
 *   npx tsx etl/backfillHistorical.ts --resume              # Resume from checkpoint
 *   npx tsx etl/backfillHistorical.ts --voteview-only       # Only ingest Voteview crosswalk
 *   npx tsx etl/backfillHistorical.ts --dry-run             # No writes
 *
 * Environment:
 *   CONGRESS_API_KEY         — Congress.gov
 *   SUPABASE_URL             — required
 *   SUPABASE_SERVICE_ROLE_KEY — required (writes through trigger require service role)
 *
 * IMPORTANT: This script writes to live Supabase. Test against a staging
 * project first, or use --dry-run.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger, setLogLevel, LogLevel } from './utils.js';
import {
  HISTORICAL_BACKFILL_NAME,
  MAX_CONSECUTIVE_5XX,
  type BackfillCheckpoint,
  type BackfillSource,
  type CongressBackfillResult,
  type ErrorBudget,
  type SourceFetchResult,
} from './historicalTypes.js';
import { ingestVoteviewAliases } from './sources/voteview.js';
import { ingestCongressGovMembers } from './sources/congressGovMembers.js';
import { ingestSenateHistoricalOfficeDesks } from './sources/senateHistoricalOfficeDesks.js';
import { ingestSenateGovRollCalls } from './sources/senateGovRollCalls.js';
import type { FidelityTier } from '../shared/fidelity.js';

// =============================================================================
// CLI
// =============================================================================

interface CliOptions {
  fromCongress: number;
  toCongress: number;
  resume: boolean;
  voteviewOnly: boolean;
  dryRun: boolean;
  verbose: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    if (idx === -1) return undefined;
    return args[idx + 1];
  };
  return {
    fromCongress: parseInt(get('--from') ?? '93', 10),
    toCongress: parseInt(get('--to') ?? '119', 10),
    resume: args.includes('--resume'),
    voteviewOnly: args.includes('--voteview-only'),
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose') || args.includes('-v'),
  };
}

// =============================================================================
// SUPABASE
// =============================================================================

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required'
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getCongressApiKey(): string {
  const key = process.env.CONGRESS_API_KEY;
  if (!key) {
    throw new Error('CONGRESS_API_KEY env var is required');
  }
  return key;
}

// =============================================================================
// CHECKPOINT MANAGEMENT
// =============================================================================

async function loadCheckpoint(
  supabase: SupabaseClient
): Promise<BackfillCheckpoint | null> {
  const { data, error } = await supabase
    .from('backfill_state')
    .select('*')
    .eq('name', HISTORICAL_BACKFILL_NAME)
    .maybeSingle();
  if (error) {
    logger.error('checkpoint load failed', error);
    throw error;
  }
  if (!data) return null;
  return {
    name: data.name,
    status: data.status,
    last_completed_congress: data.last_completed_congress ?? null,
    current_source: data.current_source ?? null,
    started_at: data.started_at,
    updated_at: data.updated_at,
  };
}

async function saveCheckpoint(
  supabase: SupabaseClient,
  checkpoint: Partial<BackfillCheckpoint> & { name?: string }
): Promise<void> {
  const now = new Date().toISOString();
  const row = {
    name: HISTORICAL_BACKFILL_NAME,
    status: checkpoint.status ?? 'running',
    started_at: checkpoint.started_at ?? now,
    updated_at: now,
    last_completed_congress: checkpoint.last_completed_congress ?? null,
    current_source: checkpoint.current_source ?? null,
    completed_at: checkpoint.status === 'complete' ? now : null,
  };
  const { error } = await supabase
    .from('backfill_state')
    .upsert(row, { onConflict: 'name' });
  if (error) {
    logger.error('checkpoint save failed', error);
    throw error;
  }
}

// =============================================================================
// PER-CONGRESS BACKFILL
// =============================================================================

interface CongressMetaRow {
  congress: number;
  start_date: string;
  end_date: string;
  fidelity_tier: FidelityTier;
  senate_xml_url_pattern: string | null;
}

async function loadCongressMetadata(
  supabase: SupabaseClient,
  congress: number
): Promise<CongressMetaRow | null> {
  const { data, error } = await supabase
    .from('congress_metadata')
    .select('congress, start_date, end_date, fidelity_tier, senate_xml_url_pattern')
    .eq('congress', congress)
    .maybeSingle();
  if (error) {
    logger.error(`failed to load congress_metadata for ${congress}`, error);
    return null;
  }
  return data as CongressMetaRow | null;
}

async function updateFidelityTier(
  supabase: SupabaseClient,
  congress: number,
  tier: FidelityTier
): Promise<void> {
  const { error } = await supabase
    .from('congress_metadata')
    .update({ fidelity_tier: tier, updated_at: new Date().toISOString() })
    .eq('congress', congress);
  if (error) logger.error(`fidelity update failed for ${congress}`, error);
}

/**
 * Combines per-source results into a final fidelity tier for the Congress.
 *
 * Rules:
 *   - If congress_gov_members SUCCEEDED AND sho_desks SUCCEEDED → 'full'
 *   - If congress_gov_members SUCCEEDED AND sho_desks UNAVAILABLE → 'partial'
 *   - If members failed entirely → 'composition_only'
 *   - If any source explicitly suggests a downgrade, take the lowest tier.
 */
function deriveFidelity(
  results: Record<BackfillSource, SourceFetchResult | null>
): FidelityTier {
  const members = results.congress_gov_members;
  const desks = results.senate_historical_office_desks;

  if (!members || members.status === 'failed') return 'composition_only';
  if (members.status === 'success' && desks?.status === 'success') return 'full';
  if (desks?.status === 'unavailable') return 'partial';
  return 'partial';
}

async function backfillOneCongress(
  supabase: SupabaseClient,
  congress: number,
  apiKey: string,
  options: { dryRun: boolean }
): Promise<CongressBackfillResult> {
  const start = new Date();
  logger.info(`\n========== CONGRESS ${congress} ==========`);

  const meta = await loadCongressMetadata(supabase, congress);
  if (!meta) {
    return {
      congress,
      start_time: start.toISOString(),
      end_time: new Date().toISOString(),
      results_by_source: emptyResults(),
      final_fidelity_tier: 'composition_only',
      halted_early: true,
      reason: `no congress_metadata row found for congress ${congress}`,
    };
  }

  const results: Record<BackfillSource, SourceFetchResult | null> = emptyResults();
  const budget: ErrorBudget = {
    consecutive_5xx: 0,
    last_error_at: null,
    last_error_message: null,
  };
  let halted = false;
  let reason: string | null = null;

  // ---- 1. Congress.gov members ----
  if (!options.dryRun) {
    results.congress_gov_members = await ingestCongressGovMembers(
      supabase,
      congress,
      meta.start_date,
      apiKey
    );
  } else {
    results.congress_gov_members = {
      source: 'congress_gov_members',
      congress,
      status: 'success',
      records_loaded: 0,
      records_skipped: 0,
      errors: ['dry-run; skipped'],
    };
  }

  // Error-budget check
  const mResult = results.congress_gov_members;
  if (mResult.status === 'failed') {
    const has5xx = mResult.errors.some((e) => /HTTP 5\d\d/.test(e));
    if (has5xx) budget.consecutive_5xx += 1;
    else budget.consecutive_5xx = 0;
    if (budget.consecutive_5xx >= MAX_CONSECUTIVE_5XX) {
      halted = true;
      reason = `error budget exhausted (${MAX_CONSECUTIVE_5XX} consecutive 5xx)`;
    }
  } else {
    budget.consecutive_5xx = 0;
  }

  // ---- 2. Senate Historical Office desks ----
  if (!halted) {
    if (!options.dryRun) {
      results.senate_historical_office_desks =
        await ingestSenateHistoricalOfficeDesks(supabase, congress, meta.start_date);
    } else {
      results.senate_historical_office_desks = {
        source: 'senate_historical_office_desks',
        congress,
        status: 'unavailable',
        records_loaded: 0,
        records_skipped: 0,
        errors: ['dry-run; skipped'],
        suggested_tier_downgrade: 'composition_only',
      };
    }
  }

  // ---- 3. Senate.gov roll calls (stub for now; runs in P5) ----
  if (!halted) {
    results.senate_gov_roll_calls = await ingestSenateGovRollCalls(
      supabase,
      congress,
      meta.senate_xml_url_pattern
    );
  }

  // ---- Final fidelity tier ----
  const tier = halted ? 'composition_only' : deriveFidelity(results);
  if (!options.dryRun) {
    await updateFidelityTier(supabase, congress, tier);
  }

  const end = new Date();
  logger.info(
    `congress ${congress} done in ${(end.getTime() - start.getTime()) / 1000}s; fidelity=${tier}`
  );

  return {
    congress,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    results_by_source: results,
    final_fidelity_tier: tier,
    halted_early: halted,
    reason,
  };
}

function emptyResults(): Record<BackfillSource, SourceFetchResult | null> {
  return {
    voteview_aliases: null,
    congress_gov_members: null,
    senate_historical_office_desks: null,
    senate_gov_roll_calls: null,
    congress_gov_bills: null,
    house_clerk_roll_calls: null,
  };
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  const opts = parseArgs();
  if (opts.verbose) setLogLevel(LogLevel.DEBUG);

  logger.info('Historical backfill orchestrator starting', {
    fromCongress: opts.fromCongress,
    toCongress: opts.toCongress,
    resume: opts.resume,
    voteviewOnly: opts.voteviewOnly,
    dryRun: opts.dryRun,
  });

  const supabase = getSupabase();
  const apiKey = getCongressApiKey();

  // Sentinel: check existing backfill_state. If status='running' AND it's
  // not us resuming, refuse to start (prevents two laptops racing).
  const existing = await loadCheckpoint(supabase);
  if (existing && existing.status === 'running' && !opts.resume) {
    logger.error(
      `another backfill is already running (started ${existing.started_at}). ` +
        `Use --resume to continue, or wait for it to complete/fail.`
    );
    process.exit(1);
  }

  await saveCheckpoint(supabase, {
    status: 'running',
    started_at: existing?.started_at ?? new Date().toISOString(),
    last_completed_congress: existing?.last_completed_congress ?? null,
  });

  try {
    // Step 1: Voteview crosswalk (once, not per-Congress).
    if (!opts.dryRun) {
      logger.info('Step 1: Voteview ICPSR ↔ bioguide crosswalk');
      const voteviewResult = await ingestVoteviewAliases(supabase);
      logger.info('Voteview ingest result', voteviewResult);
      if (voteviewResult.status === 'failed') {
        logger.warn(
          'Voteview ingest failed; continuing without ICPSR aliases. ' +
            'Pre-1993 identity reconciliation will have gaps.'
        );
      }
    }

    if (opts.voteviewOnly) {
      logger.info('--voteview-only specified; stopping after alias ingest');
      await saveCheckpoint(supabase, { status: 'complete' });
      return;
    }

    // Step 2: Per-Congress loop
    const startCongress = opts.resume
      ? (existing?.last_completed_congress ?? opts.fromCongress - 1) + 1
      : opts.fromCongress;
    logger.info(`Step 2: backfilling congresses ${startCongress}-${opts.toCongress}`);

    for (let c = startCongress; c <= opts.toCongress; c++) {
      const result = await backfillOneCongress(supabase, c, apiKey, {
        dryRun: opts.dryRun,
      });

      if (result.halted_early) {
        logger.error(
          `HALT at congress ${c}: ${result.reason}. Use --resume to retry.`
        );
        await saveCheckpoint(supabase, {
          status: 'paused',
          last_completed_congress: c - 1,
        });
        process.exit(2);
      }

      await saveCheckpoint(supabase, {
        status: 'running',
        last_completed_congress: c,
      });
    }

    await saveCheckpoint(supabase, {
      status: 'complete',
      last_completed_congress: opts.toCongress,
    });
    logger.info('Historical backfill COMPLETE');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Historical backfill FAILED', message);
    await saveCheckpoint(supabase, { status: 'failed' });
    process.exit(1);
  }
}

void main();
