/**
 * Pre-warm Module - Plain-English Bill Explanations
 *
 * Finds bills without an explanation under the current model and prompt
 * version and writes one from what the bill actually says: the model reads
 * the bill's newest official text from Congress.gov (plus the CRS summary
 * when the text is long or missing). Bills with neither yet are skipped and
 * retried on a later run. Nothing is written from a title alone.
 *
 * The writer is shared/billExplainer.js, the same code the website calls on
 * demand (api/_lib/explanations.js), so a bill explained here and a bill
 * explained on first view are indistinguishable.
 *
 * Order: bills with a recorded floor vote first (people look them up), then
 * newest first. Only ETL_EXPLAIN_CONGRESSES (default: the current Congress);
 * older bills are explained when someone opens them.
 *
 * Congress.gov allows 5,000 API calls an hour per key, and the website's proxy
 * spends the same key, so this run paces itself to CONGRESS_CALLS_PER_HOUR
 * (default 2,000) and leaves the rest for readers.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ETLConfig } from './types.js';
import { logger, sleep } from './utils.js';
import {
  explainBill,
  parseBillKey,
  EXPLAINER_MODEL,
  EXPLAINER_PROMPT_VERSION,
} from '../shared/billExplainer.js';

const PROGRESS_LOG_EVERY = 25;
const CONCURRENCY = 4;
// Stop after this long even if the list isn't drained; the next run picks up.
// Tunable via ETL_PREWARM_BUDGET_MS.
const DEFAULT_BUDGET_MS = 20 * 60 * 1000;
// One text lookup per bill, a summary lookup for some.
const API_CALLS_PER_BILL = 1.3;

export interface PreWarmResult {
  scanned: number;
  stored: number;
  noSource: number;
  rejected: number;
  promptTokens: number;
  completionTokens: number;
  errors: string[];
}

interface BillRow {
  id: string;
  title: string;
  crs_summary: string | null;
}

function shouldStop(message: string): boolean {
  return /OpenAI (401|403|429)|insufficient_quota|no credits|not configured/i.test(message);
}

async function pagedIds(
  supabase: SupabaseClient,
  build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>,
  pick: (row: any) => string
): Promise<string[]> {
  const out: string[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const row of data) out.push(pick(row));
    if (data.length < PAGE) break;
  }
  return out;
}

async function fetchCandidates(supabase: SupabaseClient, maxBills: number): Promise<BillRow[]> {
  const congresses = (process.env.ETL_EXPLAIN_CONGRESSES || '119')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => /^\d+$/.test(c));

  // bill_key is unique within a (model, prompt_version) pair, so ordering by
  // it is a total order and offset paging cannot skip rows.
  const done = new Set(
    await pagedIds(
      supabase,
      (from, to) =>
        supabase
          .from('bill_explanations')
          .select('bill_key')
          .eq('model', EXPLAINER_MODEL)
          .eq('prompt_version', EXPLAINER_PROMPT_VERSION)
          .order('bill_key', { ascending: true })
          .range(from, to),
      (r) => r.bill_key
    )
  );
  logger.info(`Pre-warm: ${done.size} explanations already written`);

  const voted = new Set<string>();
  for (const c of congresses) {
    const ids = await pagedIds(
      supabase,
      (from, to) =>
        supabase
          .from('roll_calls')
          .select('bill_id')
          .like('bill_id', `${c}-%`)
          .order('id', { ascending: true })
          .range(from, to),
      (r) => r.bill_id
    );
    for (const id of ids) if (id) voted.add(id.toLowerCase());
  }

  const rows: (BillRow & { voted: boolean; introduced_at: string | null })[] = [];
  for (const c of congresses) {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('bills')
        .select('id, title, crs_summary, introduced_at')
        .like('id', `${c}-%`)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Failed to read bills: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const r of data) {
        const id = String(r.id).toLowerCase();
        if (!r.title || done.has(id) || !parseBillKey(id)) continue;
        rows.push({ id, title: r.title, crs_summary: r.crs_summary, introduced_at: r.introduced_at, voted: voted.has(id) });
      }
      if (data.length < PAGE) break;
    }
  }

  rows.sort((a, b) =>
    Number(b.voted) - Number(a.voted) ||
    String(b.introduced_at || '').localeCompare(String(a.introduced_at || ''))
  );
  return rows.slice(0, maxBills);
}

export async function preWarmBillExplanations(
  config: ETLConfig,
  maxBills?: number
): Promise<PreWarmResult> {
  // Resolution order: explicit arg → ETL_PREWARM_MAX env → 300 (daily default).
  const effectiveMax =
    maxBills ?? (parseInt(process.env.ETL_PREWARM_MAX || '300', 10) || 300);

  const result: PreWarmResult = {
    scanned: 0, stored: 0, noSource: 0, rejected: 0, promptTokens: 0, completionTokens: 0, errors: [],
  };

  const openaiApiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    logger.warn('Pre-warm: OPENAI_API_KEY not set; skipping explanations');
    return result;
  }

  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let candidates: BillRow[];
  try {
    candidates = await fetchCandidates(supabase, effectiveMax);
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    return result;
  }
  if (candidates.length === 0) {
    logger.info('Pre-warm: every bill in scope has an explanation');
    return result;
  }

  const budgetMs = parseInt(process.env.ETL_PREWARM_BUDGET_MS || '', 10) || DEFAULT_BUDGET_MS;
  const callsPerHour = parseInt(process.env.CONGRESS_CALLS_PER_HOUR || '', 10) || 2000;
  const spacingMs = Math.ceil((3_600_000 / callsPerHour) * API_CALLS_PER_BILL);
  const startedAt = Date.now();
  logger.info(
    `Pre-warm: explaining up to ${candidates.length} bills from their text with ${EXPLAINER_MODEL} ` +
    `(budget ${(budgetMs / 60000).toFixed(0)}m, one bill every ${spacingMs}ms)`
  );

  let next = 0;
  let nextSlot = Date.now();
  let stop = false;

  const worker = async () => {
    while (!stop) {
      if (Date.now() - startedAt > budgetMs) {
        stop = true;
        break;
      }
      const bill = candidates[next++];
      if (!bill) break;
      // Shared pacing across workers: each bill takes the next free slot.
      const slot = Math.max(nextSlot, Date.now());
      nextSlot = slot + spacingMs;
      await sleep(slot - Date.now());

      result.scanned++;
      try {
        const out = await explainBill(
          { key: parseBillKey(bill.id), title: bill.title, crsSummary: bill.crs_summary },
          { congressApiKey: config.congressApiKey, openaiApiKey }
        );
        for (const u of out.usage || []) {
          result.promptTokens += u.prompt_tokens || 0;
          result.completionTokens += u.completion_tokens || 0;
        }
        if (out.status === 'no_source') result.noSource++;
        else if (out.status === 'rejected') {
          result.rejected++;
          logger.debug(`Pre-warm rejected ${bill.id}: ${out.reason}`);
        } else if (config.dryRun) {
          result.stored++;
          logger.info(`[dry run] ${bill.id}: ${out.row.explanation}`);
        } else {
          const { error } = await supabase.from('bill_explanations').upsert({ ...out.row, generated_by: 'prewarm' });
          if (error) throw new Error(`write failed: ${error.message}`);
          result.stored++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push(`${bill.id}: ${message}`);
        if (shouldStop(message)) {
          logger.warn(`Pre-warm stopped: ${message}`);
          stop = true;
          break;
        }
        logger.error(`Pre-warm failed for ${bill.id}: ${message}`);
      }
      if (result.scanned % PROGRESS_LOG_EVERY === 0) {
        logger.info(
          `Pre-warm progress: ${result.scanned}/${candidates.length} (${result.stored} written, ` +
          `${result.noSource} no text yet, ${result.rejected} rejected, ${result.errors.length} errors, ` +
          `${result.promptTokens + result.completionTokens} tokens)`
        );
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  logger.info(
    `Pre-warm complete: ${result.stored} written, ${result.noSource} without text yet, ` +
    `${result.rejected} rejected, ${result.errors.length} errors; ` +
    `${result.promptTokens} prompt + ${result.completionTokens} completion tokens`
  );
  return result;
}
