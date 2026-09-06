#!/usr/bin/env npx tsx
/**
 * Repair bills whose real title was overwritten by a vote-derived stub
 * ("HR 1", "S 1582"). Targets bills that have a recorded roll call, fetches
 * the bill detail from Congress.gov, and restores title, introduced date, and
 * policy area. Idempotent; safe to re-run.
 *
 * Usage:
 *   npx tsx etl/repairPlaceholderTitles.ts --dry-run
 *   npx tsx etl/repairPlaceholderTitles.ts
 *   npx tsx etl/repairPlaceholderTitles.ts --all      # every placeholder-titled bill, not only voted-on ones
 *
 * Environment: CONGRESS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { fetchCongressApi, isPlaceholderTitle, isTransientCongressError, loadConfig, logger, retry, chunk, parseBillId } from './utils.js';

interface BillDetailResponse {
  bill?: { title?: string; introducedDate?: string; policyArea?: { name?: string } };
}

const PAGE_SIZE = 1000; // PostgREST's per-request cap
const IN_CLAUSE_SIZE = 200;
const MAX_TITLE_LENGTH = 2000;
const MAX_POLICY_AREA_LENGTH = 200;
const MAX_CONSECUTIVE_FAILURES = 10;

// Log lines carry upstream text; keep control characters out of the terminal.
const printable = (t: string): string => t.replace(/[\x00-\x1f\x7f]/g, ' ');

export interface RepairArgs { dryRun: boolean; all: boolean; maxDetailCalls: number }

// Congress.gov allows 5,000 requests per hour; stop well short and let the
// next (idempotent) run continue from wherever this one stopped.
export const DEFAULT_MAX_DETAIL_CALLS = 2000;

export function parseRepairArgs(argv: string[]): RepairArgs {
  const idx = argv.indexOf('--limit');
  const raw = idx >= 0 ? parseInt(argv[idx + 1] ?? '', 10) : NaN;
  return {
    dryRun: argv.includes('--dry-run'),
    all: argv.includes('--all'),
    maxDetailCalls: Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_DETAIL_CALLS,
  };
}

/** The columns a Congress.gov detail response lets us restore, or null when it has no real title. */
export function buildRepairUpdate(detail: BillDetailResponse): Record<string, unknown> | null {
  const d = detail.bill;
  const title = d?.title?.trim().slice(0, MAX_TITLE_LENGTH);
  if (!title || isPlaceholderTitle(title)) return null;
  const update: Record<string, unknown> = { title };
  if (d?.introducedDate && /^\d{4}-\d{2}-\d{2}$/.test(d.introducedDate)) update.introduced_at = d.introducedDate;
  const area = d?.policyArea?.name?.trim().slice(0, MAX_POLICY_AREA_LENGTH);
  if (area) update.policy_area = area;
  return update;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { dryRun, all, maxDetailCalls: MAX_DETAIL_CALLS } = parseRepairArgs(argv);
  const config = loadConfig();
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false } });

  // Candidate ids: bills with a roll call (the pages that matter), or every bill.
  let ids: string[] = [];
  if (all) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase.from('bills').select('id, title').order('id').range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      ids.push(...(data || []).filter((b) => isPlaceholderTitle(b.title)).map((b) => b.id));
      if (!data || data.length < PAGE_SIZE) break;
    }
  } else {
    // Paged: PostgREST returns at most 1,000 rows per request.
    const billIds: string[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase.from('roll_calls').select('bill_id').not('bill_id', 'is', null).order('id').range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      billIds.push(...(data || []).map((r) => r.bill_id as string));
      if (!data || data.length < PAGE_SIZE) break;
    }
    const distinct = [...new Set(billIds)];
    logger.info(`${billIds.length} roll calls scanned, ${distinct.length} distinct bills`);
    for (const group of chunk(distinct, IN_CLAUSE_SIZE)) {
      const { data: rows, error: e2 } = await supabase.from('bills').select('id, title').in('id', group);
      if (e2) throw new Error(e2.message);
      ids.push(...(rows || []).filter((b) => isPlaceholderTitle(b.title)).map((b) => b.id));
    }
  }
  ids = [...new Set(ids)].sort();
  logger.info(`${ids.length} bills with placeholder titles${all ? '' : ' among voted-on bills'}${dryRun ? ' (dry run)' : ''}`);

  let repaired = 0;
  let missing = 0;
  let calls = 0;
  let consecutiveFailures = 0;
  for (const id of ids) {
    if (calls >= MAX_DETAIL_CALLS) {
      logger.warn(`Stopping after ${MAX_DETAIL_CALLS} Congress.gov calls; run again to continue (${ids.length - calls} left)`);
      break;
    }
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      logger.error(`Stopping after ${MAX_CONSECUTIVE_FAILURES} consecutive failures (rate limit or outage); run again later`);
      break;
    }
    const parsed = parseBillId(id);
    if (!parsed) continue;
    calls += 1;
    try {
      const detail = await retry(
        () => fetchCongressApi<BillDetailResponse>(`/bill/${parsed.congress}/${parsed.type}/${parsed.number}`, config.congressApiKey),
        3,
        1000,
        isTransientCongressError
      );
      consecutiveFailures = 0;
      const update = buildRepairUpdate(detail);
      if (!update) {
        missing += 1;
        logger.warn(`No title on Congress.gov for ${id}`);
        continue;
      }
      const title = String(update.title);
      if (dryRun) {
        logger.info(`[dry-run] ${id}: "${printable(title)}"`);
      } else {
        const { error } = await supabase.from('bills').update(update).eq('id', id);
        if (error) throw new Error(error.message);
        logger.info(`${id}: "${printable(title)}"`);
      }
      repaired += 1;
    } catch (err) {
      consecutiveFailures += 1;
      logger.error(`Failed ${id}`, err);
    }
  }
  logger.info(`Done: ${repaired} ${dryRun ? 'would be repaired' : 'repaired'}, ${missing} without a title on Congress.gov`);
}

// Only run when executed directly, so tests can import the helpers.
if (process.argv[1] && /repairPlaceholderTitles\.(ts|js)$/.test(process.argv[1])) {
  main().catch((err) => {
    logger.error('Repair failed', err);
    process.exit(1);
  });
}
