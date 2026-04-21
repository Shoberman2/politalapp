#!/usr/bin/env tsx
/**
 * One-shot: populate votes.slug for existing rows.
 *
 * Runs idempotently — a crashed/interrupted run picks up where it left off
 * because we only touch rows where slug IS NULL. Once slug_locked_at is set,
 * subsequent runs skip the row. That is the freeze-on-publish guarantee.
 *
 * Usage:
 *   npx tsx etl/backfillSlugs.ts                 # full run
 *   npx tsx etl/backfillSlugs.ts --dry-run       # no writes, print plan
 *   npx tsx etl/backfillSlugs.ts --limit=1000    # cap for testing
 *   npx tsx etl/backfillSlugs.ts --batch=500     # batch size (default 500)
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (needs write access to votes)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { generateVoteSlug } from '../lib/slugify.js';
import { acquireLease, LeaseUnavailableError } from './advisoryLock.js';

const LEASE_KEY = 'etl:backfill-slugs';
const LEASE_TTL_SECONDS = 2 * 60 * 60; // 2 hours

interface Args {
  dryRun: boolean;
  limit: number | null;
  batchSize: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, limit: null, batchSize: 500 };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a.startsWith('--limit=')) args.limit = parseInt(a.slice(8), 10);
    else if (a.startsWith('--batch=')) args.batchSize = parseInt(a.slice(8), 10);
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: npx tsx etl/backfillSlugs.ts [--dry-run] [--limit=N] [--batch=N]',
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

interface VoteRow {
  id: number;
  roll_call_id: string;
  bill_id: string | null;
  bills: { title: string | null; policy_area: string | null } | null;
}

async function fetchBatch(
  supabase: SupabaseClient,
  batchSize: number,
  cursor: number,
): Promise<VoteRow[]> {
  const { data, error } = await supabase
    .from('votes')
    .select('id, roll_call_id, bill_id, bills(title, policy_area)')
    .is('slug', null)
    .gt('id', cursor)
    .order('id', { ascending: true })
    .limit(batchSize);

  if (error) {
    throw new Error(`Fetch batch failed: ${error.message}`);
  }
  // Supabase's typed join returns `bills` as array for to-many; with a
  // to-one FK it's still typed as array in some versions. Normalize.
  return (data ?? []).map((r: any) => ({
    id: r.id,
    roll_call_id: r.roll_call_id,
    bill_id: r.bill_id,
    bills: Array.isArray(r.bills) ? (r.bills[0] ?? null) : r.bills,
  }));
}

/**
 * Resolve a slug collision by appending the roll_call_id. Returns the final
 * slug actually used (the caller should write this one).
 */
function disambiguateSlug(
  baseSlug: string,
  rollCallId: string,
): string {
  return `${baseSlug}-${rollCallId}`;
}

interface RunStats {
  processed: number;
  skippedLocked: number;
  collisions: number;
  errors: number;
}

async function run(args: Args): Promise<RunStats> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const stats: RunStats = {
    processed: 0,
    skippedLocked: 0,
    collisions: 0,
    errors: 0,
  };

  // Dry-run doesn't need the lease — it's read-only.
  const lease = args.dryRun
    ? null
    : await acquireLease(supabase, LEASE_KEY, LEASE_TTL_SECONDS, {
        script: 'backfillSlugs',
        limit: args.limit,
        batch: args.batchSize,
      });

  if (!args.dryRun && !lease) {
    throw new LeaseUnavailableError(LEASE_KEY);
  }

  try {
    let cursor = 0;
    let batchNum = 0;

    while (true) {
      const batch = await fetchBatch(supabase, args.batchSize, cursor);
      if (batch.length === 0) break;

      batchNum++;
      console.log(
        `[backfillSlugs] batch ${batchNum}: ${batch.length} rows (cursor=${cursor})`,
      );

      for (const row of batch) {
        try {
          const baseSlug = generateVoteSlug({
            roll_call_id: row.roll_call_id,
            bill_title: row.bills?.title ?? null,
          });

          const result = await writeSlug(
            supabase,
            row.id,
            baseSlug,
            row.roll_call_id,
            args.dryRun,
          );

          if (result === 'collision') stats.collisions++;
          stats.processed++;
        } catch (err) {
          stats.errors++;
          console.error(
            `[backfillSlugs] row ${row.id} failed:`,
            err instanceof Error ? err.message : err,
          );
        }
      }

      cursor = batch[batch.length - 1].id;

      if (args.limit && stats.processed >= args.limit) {
        console.log(`[backfillSlugs] reached --limit=${args.limit}, stopping`);
        break;
      }
    }
  } finally {
    if (lease) await lease.release();
  }

  return stats;
}

/**
 * Attempt to write a slug. If the partial-unique-index trips, fall back to
 * a disambiguated slug with roll_call_id suffix. Returns 'ok' or 'collision'.
 *
 * The WHERE slug IS NULL predicate is the idempotency guard — if another
 * process (or a previous interrupted run) already wrote a slug for this row,
 * this UPDATE silently no-ops.
 */
async function writeSlug(
  supabase: SupabaseClient,
  voteId: number,
  baseSlug: string,
  rollCallId: string,
  dryRun: boolean,
): Promise<'ok' | 'collision'> {
  if (dryRun) {
    console.log(`  [dry-run] vote ${voteId} -> "${baseSlug}"`);
    return 'ok';
  }

  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from('votes')
    .update({ slug: baseSlug, slug_locked_at: nowIso })
    .eq('id', voteId)
    .is('slug', null);

  if (!error) return 'ok';

  // 23505 = unique_violation on idx_votes_slug → disambiguate and retry
  if (error.code === '23505') {
    const disambiguated = disambiguateSlug(baseSlug, rollCallId);
    const { error: retryError } = await supabase
      .from('votes')
      .update({ slug: disambiguated, slug_locked_at: nowIso })
      .eq('id', voteId)
      .is('slug', null);

    if (retryError) {
      throw new Error(
        `Slug disambiguation failed for vote ${voteId}: ${retryError.message}`,
      );
    }
    return 'collision';
  }

  throw new Error(`Slug write failed for vote ${voteId}: ${error.message}`);
}

// Only auto-run when invoked directly (not when imported for testing)
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv);
  console.log(
    `[backfillSlugs] starting: dryRun=${args.dryRun} limit=${args.limit ?? 'none'} batch=${args.batchSize}`,
  );

  run(args)
    .then((stats) => {
      console.log('\n[backfillSlugs] done:', stats);
      if (stats.errors > 0) process.exit(1);
    })
    .catch((err) => {
      console.error('[backfillSlugs] fatal:', err);
      process.exit(1);
    });
}

// Export for tests
export { run, parseArgs, disambiguateSlug };
export type { Args, RunStats };
