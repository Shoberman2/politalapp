#!/usr/bin/env npx ts-node
/**
 * Historical bill backfill.
 *
 * Loads every Congress.gov bill in the public archive window into the existing
 * `bills` table, using the same normalizer and Supabase loader as the daily
 * ETL. Default range is the 107th Congress (2001-2003) through the current
 * Congress, matching the product archive exposed in the UI.
 *
 * Usage:
 *   npx tsx etl/backfillBills.ts --dry-run
 *   npx tsx etl/backfillBills.ts --from 107 --to 119
 *   npx tsx etl/backfillBills.ts --resume
 *   npx tsx etl/backfillBills.ts --congress 107 --bill-type hr
 *   npx tsx etl/backfillBills.ts --list-only --from 107 --to 119
 *
 * Environment for non-dry-run:
 *   CONGRESS_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { extractIntroducedBills } from './extractIntroducedBills.js';
import type {
  Bill,
  BillCommitteeRouting,
  BillCosponsor,
  ETLConfig,
} from './types.js';
import { loadConfig, logger, setLogLevel, LogLevel } from './utils.js';
import { MAX_CONSECUTIVE_5XX } from './historicalTypes.js';
import { BILL_CONGRESS_MIN, CONGRESS_MAX } from '../src/utils/congressUtil.js';

const BILL_BACKFILL_NAME = 'historical_bill_backfill';
const BILL_SOURCE_PREFIX = 'congress_gov_bills';
const WRITE_BATCH_SIZE = 100;

const BILL_TYPES = [
  'hr',
  's',
  'hjres',
  'sjres',
  'hconres',
  'sconres',
  'hres',
  'sres',
] as const;

type BillType = typeof BILL_TYPES[number];

interface CliOptions {
  fromCongress: number;
  toCongress: number;
  congress: number | null;
  billType: BillType | null;
  resume: boolean;
  dryRun: boolean;
  verbose: boolean;
  listOnly: boolean;
  includeCommittees: boolean;
  includeCosponsors: boolean;
  maxDetailCalls: number;
}

interface BillCheckpoint {
  name: string;
  status: 'running' | 'complete' | 'failed' | 'paused';
  last_completed_congress: number | null;
  current_source: string | null;
  started_at: string | null;
  updated_at: string | null;
}

interface ResumePoint {
  congress: number;
  billType: BillType;
}

interface LoadOperationResult {
  count: number;
  errors: string[];
}

interface ExistingBillFields {
  id: string;
  summary: string | null;
  crs_summary: string | null;
  policy_area: string | null;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    if (idx === -1) return undefined;
    return args[idx + 1];
  };

  const billTypeRaw = get('--bill-type');
  const billType = billTypeRaw ? normalizeBillType(billTypeRaw) : null;
  const listOnly = args.includes('--list-only');

  return {
    fromCongress: parseInt(get('--from') ?? String(BILL_CONGRESS_MIN), 10),
    toCongress: parseInt(get('--to') ?? String(CONGRESS_MAX), 10),
    congress: get('--congress') ? parseInt(get('--congress')!, 10) : null,
    billType,
    resume: args.includes('--resume'),
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    listOnly,
    includeCommittees: args.includes('--include-committees'),
    includeCosponsors: args.includes('--include-cosponsors'),
    maxDetailCalls: listOnly
      ? 0
      : parsePositiveInt(get('--max-detail-calls')) ?? Number.MAX_SAFE_INTEGER,
  };
}

function normalizeBillType(value: string): BillType {
  const normalized = value.toLowerCase().replace(/\./g, '') as BillType;
  if (!BILL_TYPES.includes(normalized)) {
    throw new Error(`Unknown bill type "${value}". Expected one of: ${BILL_TYPES.join(', ')}`);
  }
  return normalized;
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Expected a positive integer, got "${value}"`);
  }
  return n;
}

function validateOptions(opts: CliOptions): void {
  if (!Number.isInteger(opts.fromCongress) || !Number.isInteger(opts.toCongress)) {
    throw new Error('--from and --to must be integers');
  }
  if (opts.fromCongress > opts.toCongress) {
    throw new Error(`Invalid range: --from ${opts.fromCongress} is after --to ${opts.toCongress}`);
  }
  if (opts.congress != null && !Number.isInteger(opts.congress)) {
    throw new Error('--congress must be an integer');
  }
}

function getSupabase(config: ETLConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function loadCheckpoint(supabase: SupabaseClient): Promise<BillCheckpoint | null> {
  const { data, error } = await supabase
    .from('backfill_state')
    .select('*')
    .eq('name', BILL_BACKFILL_NAME)
    .maybeSingle();
  if (error) throw error;
  return data as BillCheckpoint | null;
}

async function saveCheckpoint(
  supabase: SupabaseClient,
  patch: {
    status: BillCheckpoint['status'];
    lastCompletedCongress: number | null;
    currentSource: string | null;
    startedAt?: string | null;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('backfill_state')
    .upsert(
      {
        name: BILL_BACKFILL_NAME,
        status: patch.status,
        started_at: patch.startedAt ?? now,
        updated_at: now,
        completed_at: patch.status === 'complete' || patch.status === 'failed' ? now : null,
        last_completed_congress: patch.lastCompletedCongress,
        current_source: patch.currentSource,
      },
      { onConflict: 'name' }
    );
  if (error) throw error;
}

function sourceFor(congress: number, billType: BillType): string {
  return `${BILL_SOURCE_PREFIX}:${congress}:${billType}`;
}

function parseSource(source: string | null): ResumePoint | null {
  if (!source) return null;
  const match = new RegExp(`^${BILL_SOURCE_PREFIX}:(\\d+):(${BILL_TYPES.join('|')})$`).exec(source);
  if (!match) return null;
  return {
    congress: parseInt(match[1], 10),
    billType: match[2] as BillType,
  };
}

function congressesFor(opts: CliOptions): number[] {
  if (opts.congress != null) return [opts.congress];
  return Array.from(
    { length: opts.toCongress - opts.fromCongress + 1 },
    (_, i) => opts.fromCongress + i
  );
}

function billTypesFor(opts: CliOptions): BillType[] {
  return opts.billType ? [opts.billType] : [...BILL_TYPES];
}

function isLikely5xx(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b5\d\d\b/.test(message);
}

function billRowForBackfill(bill: Bill, existing?: ExistingBillFields): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: bill.id,
    title: bill.title,
    introduced_at: bill.introduced_at,
    summary: bill.summary || existing?.summary || null,
    crs_summary: bill.crs_summary || existing?.crs_summary || null,
    policy_area: bill.policy_area || existing?.policy_area || null,
    source_url: bill.source_url,
  };

  // Omit sparse detail fields when list-only mode did not fetch them, so a
  // fast visibility backfill does not erase richer rows already in Supabase.
  if (bill.sponsor_bioguide_id != null) row.sponsor_bioguide_id = bill.sponsor_bioguide_id;
  if (bill.sponsor_name != null) row.sponsor_name = bill.sponsor_name;
  if (bill.sponsor_party != null) row.sponsor_party = bill.sponsor_party;
  if (bill.sponsor_state != null) row.sponsor_state = bill.sponsor_state;
  if (bill.legislative_stage != null) row.legislative_stage = bill.legislative_stage;

  return row;
}

async function upsertBillsForBackfill(
  supabase: SupabaseClient,
  bills: Bill[]
): Promise<LoadOperationResult> {
  const result: LoadOperationResult = { count: 0, errors: [] };
  if (bills.length === 0) return result;

  for (let start = 0; start < bills.length; start += WRITE_BATCH_SIZE) {
    const batch = bills.slice(start, start + WRITE_BATCH_SIZE);
    const existingBills = new Map<string, ExistingBillFields>();

    try {
      const { data: existing, error: existingError } = await supabase
        .from('bills')
        .select('id, summary, crs_summary, policy_area')
        .in('id', batch.map((b) => b.id));

      if (existingError) {
        logger.warn(`Could not fetch existing bills for summary preservation: ${existingError.message}`);
      } else {
        for (const row of existing ?? []) {
          const bill = row as ExistingBillFields;
          existingBills.set(bill.id, bill);
        }
      }
    } catch (error) {
      logger.warn('Could not fetch existing bills for summary preservation', error);
    }

    try {
      const { data, error } = await supabase
        .from('bills')
        .upsert(
          batch.map((bill) => billRowForBackfill(bill, existingBills.get(bill.id))),
          {
            onConflict: 'id',
            ignoreDuplicates: false,
          }
        )
        .select('id');

      if (error) {
        result.errors.push(`Bills upsert error: ${error.message}`);
        logger.error('Bills upsert error', error);
      } else {
        result.count += data?.length || batch.length;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Bills batch error: ${message}`);
      logger.error('Bills batch error', error);
    }
  }

  return result;
}

async function upsertBillCommitteeRoutingsForBackfill(
  supabase: SupabaseClient,
  routings: BillCommitteeRouting[]
): Promise<LoadOperationResult> {
  const result: LoadOperationResult = { count: 0, errors: [] };
  if (routings.length === 0) return result;

  for (let start = 0; start < routings.length; start += WRITE_BATCH_SIZE) {
    const batch = routings.slice(start, start + WRITE_BATCH_SIZE);
    try {
      const { data, error } = await supabase
        .from('bill_committee_routings')
        .upsert(
          batch.map((routing) => ({
            bill_id: routing.bill_id,
            committee_code: routing.committee_code,
            committee_name: routing.committee_name,
            subcommittee_code: routing.subcommittee_code,
            subcommittee_name: routing.subcommittee_name,
            chamber: routing.chamber,
            referred_at: routing.referred_at,
            activity_type: routing.activity_type,
            updated_at: new Date().toISOString(),
          })),
          {
            onConflict: 'bill_id,committee_code,subcommittee_code',
            ignoreDuplicates: false,
          }
        )
        .select('bill_id');

      if (error) {
        result.errors.push(`Routings upsert error: ${error.message}`);
        logger.error('Routings upsert error', error);
      } else {
        result.count += data?.length || batch.length;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Routings batch error: ${message}`);
      logger.error('Routings batch error', error);
    }
  }

  return result;
}

async function upsertBillCosponsorsForBackfill(
  supabase: SupabaseClient,
  cosponsors: BillCosponsor[]
): Promise<LoadOperationResult> {
  const result: LoadOperationResult = { count: 0, errors: [] };
  if (cosponsors.length === 0) return result;

  for (let start = 0; start < cosponsors.length; start += WRITE_BATCH_SIZE) {
    const batch = cosponsors.slice(start, start + WRITE_BATCH_SIZE);
    try {
      const { data, error } = await supabase
        .from('bill_cosponsors')
        .upsert(
          batch.map((cosponsor) => ({
            bill_id: cosponsor.bill_id,
            bioguide_id: cosponsor.bioguide_id,
            cosponsored_at: cosponsor.cosponsored_at,
            withdrawn_at: cosponsor.withdrawn_at,
          })),
          {
            onConflict: 'bill_id,bioguide_id',
            ignoreDuplicates: false,
          }
        )
        .select('bill_id');

      if (error) {
        result.errors.push(`Cosponsors upsert error: ${error.message}`);
        logger.error('Cosponsors upsert error', error);
      } else {
        result.count += data?.length || batch.length;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Cosponsors batch error: ${message}`);
      logger.error('Cosponsors batch error', error);
    }
  }

  return result;
}

async function upsertUnknownCommitteeCodesForBackfill(
  supabase: SupabaseClient,
  codes: Array<{ committee_code: string; subcommittee_code: string | null }>
): Promise<LoadOperationResult> {
  const result: LoadOperationResult = { count: 0, errors: [] };
  if (codes.length === 0) return result;

  const now = new Date().toISOString();
  for (const code of codes) {
    const subKey = code.subcommittee_code ?? '';
    try {
      const { data: existing } = await supabase
        .from('unknown_committee_codes')
        .select('occurrence_count')
        .eq('committee_code', code.committee_code)
        .filter(
          'subcommittee_code',
          code.subcommittee_code == null ? 'is' : 'eq',
          code.subcommittee_code ?? null
        )
        .maybeSingle();

      if (existing) {
        const occurrenceCount = Number((existing as { occurrence_count?: number }).occurrence_count ?? 0);
        const { error } = await supabase
          .from('unknown_committee_codes')
          .update({
            last_seen_at: now,
            occurrence_count: occurrenceCount + 1,
          })
          .eq('committee_code', code.committee_code)
          .filter(
            'subcommittee_code',
            code.subcommittee_code == null ? 'is' : 'eq',
            code.subcommittee_code ?? null
          );
        if (error) {
          result.errors.push(`Unknown committee code update error (${code.committee_code}/${subKey}): ${error.message}`);
        } else {
          result.count++;
        }
      } else {
        const { error } = await supabase
          .from('unknown_committee_codes')
          .insert({
            committee_code: code.committee_code,
            subcommittee_code: code.subcommittee_code,
            first_seen_at: now,
            last_seen_at: now,
            occurrence_count: 1,
          });
        if (error) {
          result.errors.push(`Unknown committee code insert error (${code.committee_code}/${subKey}): ${error.message}`);
        } else {
          result.count++;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Unknown committee codes batch error: ${message}`);
      logger.error('Unknown committee codes batch error', error);
    }
  }

  return result;
}

async function backfillOneType(
  supabase: SupabaseClient,
  config: ETLConfig,
  congress: number,
  billType: BillType,
  opts: CliOptions
): Promise<number> {
  const intro = await extractIntroducedBills(config, {
    congress,
    billTypes: [billType],
    daysBack: null,
    maxListPagesPerType: Number.MAX_SAFE_INTEGER,
    maxDetailCalls: opts.maxDetailCalls,
    includeCommittees: opts.includeCommittees,
    includeCosponsors: opts.includeCosponsors,
  });

  logger.info(`Loading ${intro.bills.length} bills in ${WRITE_BATCH_SIZE}-row batches...`);
  const billResult = await upsertBillsForBackfill(supabase, intro.bills);
  if (billResult.errors.length > 0) {
    throw new Error(`Load errors for ${congress} ${billType}: ${billResult.errors.slice(0, 5).join('; ')}`);
  }

  const enrichmentErrors: string[] = [];
  if (intro.routings.length > 0) {
    logger.info(`Loading ${intro.routings.length} bill_committee_routings in batches...`);
    const routingResult = await upsertBillCommitteeRoutingsForBackfill(supabase, intro.routings);
    enrichmentErrors.push(...routingResult.errors);
  }
  if (intro.cosponsors.length > 0) {
    logger.info(`Loading ${intro.cosponsors.length} bill_cosponsors in batches...`);
    const cosponsorResult = await upsertBillCosponsorsForBackfill(supabase, intro.cosponsors);
    enrichmentErrors.push(...cosponsorResult.errors);
  }
  if (intro.unknownCommitteeCodes.length > 0) {
    logger.info(`Logging ${intro.unknownCommitteeCodes.length} unknown committee codes in batches...`);
    const unknownResult = await upsertUnknownCommitteeCodesForBackfill(supabase, intro.unknownCommitteeCodes);
    enrichmentErrors.push(...unknownResult.errors);
  }
  if (enrichmentErrors.length > 0) {
    throw new Error(`Enrichment load errors for ${congress} ${billType}: ${enrichmentErrors.slice(0, 5).join('; ')}`);
  }

  logger.info(
    `Loaded ${billResult.count} bills for Congress ${congress} ${billType.toUpperCase()} ` +
      `(${intro.stats.detailed} detailed, ${intro.stats.errors.length} fetch warnings)`
  );
  intro.bills.length = 0;
  intro.routings.length = 0;
  intro.cosponsors.length = 0;
  intro.unknownCommitteeCodes.length = 0;
  return billResult.count;
}

function printDryRun(opts: CliOptions): void {
  const congresses = congressesFor(opts);
  const billTypes = billTypesFor(opts);
  const totalCombos = congresses.length * billTypes.length;
  logger.info(`Would process ${totalCombos} (congress, bill_type) combos:`);
  for (const congress of congresses) {
    logger.info(`  Congress ${congress}: ${billTypes.map((t) => t.toUpperCase()).join(', ')}`);
  }
  logger.info(`Default range starts at the ${BILL_CONGRESS_MIN}th Congress (2001).`);
  logger.info(opts.listOnly
    ? 'Mode: list-only (fastest; title/action/source URL, less complete introduced dates).'
    : 'Mode: detailed bills (title, introduced date, sponsor, policy area, source URL).'
  );
  logger.info('No network or database writes performed in --dry-run mode.');
}

async function main(): Promise<void> {
  const opts = parseArgs();
  validateOptions(opts);
  if (opts.verbose) setLogLevel(LogLevel.DEBUG);

  logger.info('Historical bill backfill starting', {
    fromCongress: opts.fromCongress,
    toCongress: opts.toCongress,
    congress: opts.congress,
    billType: opts.billType,
    resume: opts.resume,
    dryRun: opts.dryRun,
    listOnly: opts.listOnly,
    includeCommittees: opts.includeCommittees,
    includeCosponsors: opts.includeCosponsors,
  });

  if (opts.dryRun) {
    printDryRun(opts);
    return;
  }

  const config = loadConfig();
  config.dryRun = false;
  const supabase = getSupabase(config);

  let checkpoint: BillCheckpoint | null = null;
  let resumePoint: ResumePoint | null = null;
  let lastCompletedCongress: number | null = null;

  if (opts.resume) {
    checkpoint = await loadCheckpoint(supabase);
    resumePoint = parseSource(checkpoint?.current_source ?? null);
    lastCompletedCongress = checkpoint?.last_completed_congress ?? null;
    logger.info('Loaded bill-backfill checkpoint', checkpoint);
  }

  const startedAt = checkpoint?.started_at ?? new Date().toISOString();
  let consecutive5xx = 0;
  let totalLoaded = 0;

  for (const congress of congressesFor(opts)) {
    if (opts.resume && resumePoint == null && lastCompletedCongress != null && congress <= lastCompletedCongress) {
      logger.info(`Skipping Congress ${congress}; checkpoint already completed it.`);
      continue;
    }

    const billTypes = billTypesFor(opts);
    let typeStartIndex = 0;
    if (opts.resume && resumePoint && congress === resumePoint.congress) {
      typeStartIndex = Math.max(0, billTypes.indexOf(resumePoint.billType));
    } else if (opts.resume && resumePoint && congress < resumePoint.congress) {
      logger.info(`Skipping Congress ${congress}; resume point is Congress ${resumePoint.congress}.`);
      continue;
    }

    for (let i = typeStartIndex; i < billTypes.length; i++) {
      const billType = billTypes[i];
      logger.info(`\n========== CONGRESS ${congress} ${billType.toUpperCase()} ==========`);
      await saveCheckpoint(supabase, {
        status: 'running',
        startedAt,
        lastCompletedCongress,
        currentSource: sourceFor(congress, billType),
      });

      try {
        totalLoaded += await backfillOneType(supabase, config, congress, billType, opts);
        consecutive5xx = 0;
      } catch (error) {
        if (isLikely5xx(error)) consecutive5xx++;
        logger.error(`Bill backfill failed for Congress ${congress} ${billType}`, error);
        if (consecutive5xx >= MAX_CONSECUTIVE_5XX) {
          await saveCheckpoint(supabase, {
            status: 'failed',
            startedAt,
            lastCompletedCongress,
            currentSource: sourceFor(congress, billType),
          });
          throw new Error(`Halting after ${consecutive5xx} consecutive 5xx-style failures`);
        }
        throw error;
      }
    }

    lastCompletedCongress = congress;
    resumePoint = null;
    await saveCheckpoint(supabase, {
      status: 'running',
      startedAt,
      lastCompletedCongress,
      currentSource: null,
    });
  }

  await saveCheckpoint(supabase, {
    status: 'complete',
    startedAt,
    lastCompletedCongress,
    currentSource: null,
  });
  logger.info(`Historical bill backfill complete. Bills upserted: ${totalLoaded}`);
}

void main().catch((error) => {
  logger.error('Historical bill backfill failed', error);
  process.exit(1);
});
