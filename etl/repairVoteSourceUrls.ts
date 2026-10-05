#!/usr/bin/env npx tsx
/**
 * Repair stored roll-call source URLs. Until the fix in etl/utils.ts
 * (getVoteSourceUrl), House Clerk URLs were built from the year the ETL ran,
 * so a 2025 (119th Congress, session 1) vote loaded in 2026 points at the 2026
 * roll call with the same number: the wrong official record.
 *
 * Scans every row of each table that stores a roll-call source URL (today only
 * `votes.source_url`; `roll_calls` and `roll_call_stats` have no URL column),
 * derives the correct URL from `roll_call_id` with officialRollCallUrl, and
 * rewrites only the rows that differ. Rows that are already correct, and rows
 * whose roll_call_id cannot be parsed, are never touched.
 *
 * Dry run is the default. Idempotent and resumable: a re-run (or `--after
 * <id>` from the last progress line) finds only what is still wrong.
 *
 * Usage:
 *   npx tsx etl/repairVoteSourceUrls.ts                     # dry run: counts + samples
 *   npx tsx etl/repairVoteSourceUrls.ts --apply             # write the fixes
 *   npx tsx etl/repairVoteSourceUrls.ts --apply --after 123456 --batch-size 100
 *
 * Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from './utils.js';
// @ts-ignore -- untyped JS module
import { officialRollCallUrl, parseRollCallId, sessionYear } from '../api/_lib/rollCallResult.js';

/** Tables that store a roll-call source URL, keyed by their roll-call id column. */
export const URL_TABLES = [{ table: 'votes', idColumn: 'id', rollCallColumn: 'roll_call_id', urlColumn: 'source_url' }] as const;

export const SCAN_PAGE_SIZE = 1000; // PostgREST's per-request cap
export const DEFAULT_BATCH_SIZE = 200; // ids per UPDATE ... WHERE id IN (...)
export const MAX_BATCH_SIZE = 500;
export const SAMPLE_COUNT = 5;

export interface RepairArgs {
  apply: boolean;
  batchSize: number;
  after: number | null;
  /** Rows per scan request; tests shrink it. */
  pageSize?: number;
}

export function parseRepairArgs(argv: string[]): RepairArgs {
  const num = (flag: string): number | null => {
    const i = argv.indexOf(flag);
    if (i < 0) return null;
    const n = parseInt(argv[i + 1] ?? '', 10);
    return Number.isFinite(n) ? n : null;
  };
  const size = num('--batch-size');
  const after = num('--after');
  return {
    // --dry-run wins over --apply so a mistyped command never writes.
    apply: argv.includes('--apply') && !argv.includes('--dry-run'),
    batchSize: size && size > 0 ? Math.min(size, MAX_BATCH_SIZE) : DEFAULT_BATCH_SIZE,
    after: after != null && after >= 0 ? after : null,
  };
}

export interface Row {
  id: number;
  roll_call_id: string | null;
  source_url: string | null;
}

export interface Fix {
  id: number;
  rollCallId: string;
  before: string | null;
  after: string;
  chamber: 'house' | 'senate';
  year: number | null;
}

/** The fix a row needs, or null when it is already correct or not derivable. */
export function planFix(row: Row): Fix | null {
  const p = parseRollCallId(row.roll_call_id);
  if (!p) return null;
  const expected: string | null = officialRollCallUrl(row.roll_call_id);
  if (!expected || row.source_url === expected) return null;
  return {
    id: row.id,
    rollCallId: String(row.roll_call_id).toLowerCase(),
    before: row.source_url,
    after: expected,
    chamber: p.chamberKey,
    year: sessionYear(p.congress, p.session),
  };
}

export interface TableReport {
  table: string;
  scanned: number;
  correct: number;
  underivable: number;
  mismatched: number;
  updated: number;
  byYear: Record<string, number>;
  byChamber: Record<string, number>;
  samples: Array<{ id: number; roll_call_id: string; before: string | null; after: string }>;
  lastId: number | null;
}

// Minimal surface of the Supabase client this script uses, so tests can mock it.
export interface RepairClient {
  from(table: string): any;
}

/**
 * Scan one table in id order and fix mismatched rows. Updates go out per
 * page, grouped by target URL, in batches of `batchSize` ids, each guarded by
 * `neq(url, expected)` so a concurrent writer or a re-run never rewrites a row
 * that is already correct.
 */
export async function repairTable(
  client: RepairClient,
  spec: (typeof URL_TABLES)[number],
  args: RepairArgs,
  log: (msg: string) => void = (m) => logger.info(m)
): Promise<TableReport> {
  const report: TableReport = {
    table: spec.table, scanned: 0, correct: 0, underivable: 0, mismatched: 0, updated: 0,
    byYear: {}, byChamber: {}, samples: [], lastId: args.after,
  };
  let last = args.after;
  let pages = 0;
  const pageSize = args.pageSize ?? SCAN_PAGE_SIZE;
  for (;;) {
    let q = client.from(spec.table)
      .select(`${spec.idColumn}, ${spec.rollCallColumn}, ${spec.urlColumn}`)
      .order(spec.idColumn, { ascending: true })
      .limit(pageSize);
    if (last != null) q = q.gt(spec.idColumn, last);
    const { data, error } = await q;
    if (error) throw new Error(`${spec.table}: ${error.message}`);
    const rows = (data || []) as Row[];
    if (rows.length === 0) break;

    const fixes: Fix[] = [];
    for (const row of rows) {
      report.scanned += 1;
      if (!parseRollCallId(row.roll_call_id) || !officialRollCallUrl(row.roll_call_id)) {
        report.underivable += 1;
        continue;
      }
      const fix = planFix(row);
      if (!fix) { report.correct += 1; continue; }
      fixes.push(fix);
      report.mismatched += 1;
      const y = String(fix.year ?? 'unknown');
      report.byYear[y] = (report.byYear[y] || 0) + 1;
      report.byChamber[fix.chamber] = (report.byChamber[fix.chamber] || 0) + 1;
      if (report.samples.length < SAMPLE_COUNT) {
        report.samples.push({ id: fix.id, roll_call_id: fix.rollCallId, before: fix.before, after: fix.after });
      }
    }

    if (args.apply && fixes.length) {
      const byUrl = new Map<string, number[]>();
      for (const f of fixes) {
        const ids = byUrl.get(f.after) || [];
        ids.push(f.id);
        byUrl.set(f.after, ids);
      }
      for (const [url, ids] of byUrl) {
        for (let i = 0; i < ids.length; i += args.batchSize) {
          const batch = ids.slice(i, i + args.batchSize);
          const { data: updatedRows, error: upErr } = await client.from(spec.table)
            .update({ [spec.urlColumn]: url })
            .in(spec.idColumn, batch)
            .neq(spec.urlColumn, url)
            .select(spec.idColumn);
          if (upErr) {
            throw new Error(`${spec.table}: update failed after id ${last ?? 'start'} (resume with --after ${last ?? 0}): ${upErr.message}`);
          }
          report.updated += (updatedRows || []).length;
        }
      }
    }

    last = rows[rows.length - 1].id;
    report.lastId = last;
    pages += 1;
    const done = rows.length < pageSize;
    // Progress every 20 pages, after any page that wrote, and at the end.
    if (done || pages % 20 === 0 || (args.apply && fixes.length)) log(`${spec.table}: scanned ${report.scanned}, mismatched ${report.mismatched}${args.apply ? `, updated ${report.updated}` : ''}, last id ${last}`);
    if (done) break;
  }
  return report;
}

export function formatReport(r: TableReport, apply: boolean): string {
  const lines = [
    `${r.table}: ${r.scanned} rows scanned, ${r.correct} already correct, ${r.mismatched} wrong, ${r.underivable} without a parseable roll_call_id (left alone)`,
  ];
  if (apply) lines.push(`  updated: ${r.updated}`);
  const chambers = Object.entries(r.byChamber).map(([k, v]) => `${k} ${v}`).join(', ');
  if (chambers) lines.push(`  wrong by chamber: ${chambers}`);
  const years = Object.entries(r.byYear).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k} ${v}`).join(', ');
  if (years) lines.push(`  wrong by session year: ${years}`);
  for (const s of r.samples) lines.push(`  ${s.roll_call_id} (id ${s.id}): ${s.before ?? '(null)'} -> ${s.after}`);
  return lines.join('\n');
}

export async function main(argv: string[] = process.argv.slice(2), client?: RepairClient): Promise<TableReport[]> {
  const args = parseRepairArgs(argv);
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  logger.info(`Repairing roll-call source URLs (${args.apply ? `APPLY, batches of ${args.batchSize}` : 'dry run; pass --apply to write'}${args.after != null ? `, after id ${args.after}` : ''})`);
  const reports: TableReport[] = [];
  for (const spec of URL_TABLES) {
    const r = await repairTable(client, spec, args);
    reports.push(r);
    logger.info(formatReport(r, args.apply));
  }
  return reports;
}

// Only run when executed directly, so tests can import the helpers.
if (process.argv[1] && /repairVoteSourceUrls\.(ts|js)$/.test(process.argv[1])) {
  main().catch((err) => {
    logger.error(`Repair failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
