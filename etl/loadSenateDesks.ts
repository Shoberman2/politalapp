#!/usr/bin/env npx tsx
/**
 * Loads one Congress's Senate desks and nothing else: the desk layout, the
 * desk assignments and the named-desk lineage from etl/historical/desks/.
 *
 * backfillHistorical.ts does this too, as one step among several (it also
 * re-ingests members and the Voteview crosswalk and resets fidelity tiers).
 * Use this when only the desks changed.
 *
 *   npx tsx --env-file=.env etl/loadSenateDesks.ts --congress 119 --dry-run
 *   npx tsx --env-file=.env etl/loadSenateDesks.ts --congress 119
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Writes to live Supabase
 * unless --dry-run is given.
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from './utils.js';
import { getDeskDataForCongress } from './historical/desks/index.js';
import { ingestSenateHistoricalOfficeDesks, validateDeskData } from './sources/senateHistoricalOfficeDesks.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const at = args.indexOf('--congress');
  const congress = at === -1 ? NaN : parseInt(args[at + 1] ?? '', 10);
  const dryRun = args.includes('--dry-run');
  if (!Number.isInteger(congress)) {
    logger.error('usage: loadSenateDesks.ts --congress <n> [--dry-run]');
    process.exit(1);
  }

  const data = getDeskDataForCongress(congress);
  if (!data) {
    logger.error(`no desk data file for congress ${congress}`);
    process.exit(1);
  }
  const problems = validateDeskData(data);
  const current = data.assignments.filter((a) => !a.vacatedAt);
  logger.info(`congress ${congress} desk data`, {
    source: data.source ?? 'hand_curated_sho',
    desks: data.desks?.length ?? 0,
    assignmentRows: data.assignments.length,
    currentOccupants: current.filter((a) => a.bioguideId).length,
    currentlyEmpty: current.filter((a) => !a.bioguideId).length,
    lineageRows: data.lineageRows?.length ?? 0,
    retiredFamousDeskIds: data.retiredFamousDeskIds ?? [],
    problems,
  });
  if (problems.length > 0) process.exit(1);
  if (dryRun) {
    logger.info('dry run: nothing written');
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    logger.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: meta, error } = await supabase
    .from('congress_metadata')
    .select('start_date')
    .eq('congress', congress)
    .maybeSingle();
  if (error || !meta) {
    logger.error(`no congress_metadata row for congress ${congress}`, error?.message);
    process.exit(1);
  }

  const result = await ingestSenateHistoricalOfficeDesks(supabase, congress, meta.start_date);
  logger.info('desk load result', result);
  if (result.status !== 'success') process.exit(1);
}

void main();
