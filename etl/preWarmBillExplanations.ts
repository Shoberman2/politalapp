/**
 * Pre-warm Module - Long-form Bill Explanations
 *
 * Finds bills that don't yet have a row in `bill_explanations` for the current
 * model/prompt_version and asks the deployed `explain-bill` Edge Function to
 * generate one. The function persists the result, so this module only triggers
 * generation — it does not write the table itself.
 *
 * Keep MODEL and PROMPT_VERSION in sync with supabase/functions/explain-bill/index.ts.
 * If they drift, the ETL will re-warm rows the function already considers fresh
 * (wasted spend) or miss rows the function already wrote (lazy fill on first view).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ETLConfig } from './types.js';
import { logger, sleep } from './utils.js';

const MODEL = 'gpt-4o-mini';
const PROMPT_VERSION = 2;
const REQUEST_SPACING_MS = 500;
// Single explain-bill call shouldn't take more than 60s — OpenAI generation
// budget plus network. Anything longer is a stuck call that would otherwise
// stall the whole pre-warm loop against the workflow's job timeout.
const PER_BILL_TIMEOUT_MS = 60_000;
const PROGRESS_LOG_EVERY = 25;
// Stop pre-warming if the loop has been running for this long, even if the
// candidate list isn't drained. Bills we skip get caught by the next day's
// run (or lazy-loaded on first user view). Tunable via ETL_PREWARM_BUDGET_MS.
const DEFAULT_BUDGET_MS = 20 * 60 * 1000;

export interface PreWarmResult {
  scanned: number;
  generated: number;
  cacheHits: number;
  errors: string[];
}

interface BillRow {
  id: string;
  title: string;
}

function parseBillId(id: string): { congress: number; billType: string; number: number } | null {
  const match = /^(\d+)-([a-z]+)-(\d+)$/i.exec(id);
  if (!match) return null;
  return {
    congress: parseInt(match[1], 10),
    billType: match[2].toLowerCase(),
    number: parseInt(match[3], 10),
  };
}

async function fetchCachedBillKeys(supabase: SupabaseClient): Promise<Set<string>> {
  const keys = new Set<string>();
  const PAGE = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('bill_explanations')
      .select('bill_key')
      .eq('model', MODEL)
      .eq('prompt_version', PROMPT_VERSION)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Failed to read bill_explanations: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) keys.add(row.bill_key);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return keys;
}

async function fetchCandidateBills(
  supabase: SupabaseClient,
  cachedKeys: Set<string>,
  maxBills: number
): Promise<BillRow[]> {
  const candidates: BillRow[] = [];
  const PAGE = 500;
  let from = 0;

  while (candidates.length < maxBills) {
    const { data, error } = await supabase
      .from('bills')
      .select('id, title')
      .order('introduced_at', { ascending: false, nullsFirst: false })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Failed to read bills: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (!row.title) continue;
      if (cachedKeys.has(row.id.toLowerCase())) continue;
      candidates.push({ id: row.id, title: row.title });
      if (candidates.length >= maxBills) break;
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return candidates;
}

async function invokeExplainBill(
  config: ETLConfig,
  bill: BillRow
): Promise<{ cached: boolean }> {
  const parsed = parseBillId(bill.id);
  if (!parsed) throw new Error(`Unparseable bill id: ${bill.id}`);

  const url = `${config.supabaseUrl}/functions/v1/explain-bill`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PER_BILL_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.supabaseServiceKey}`,
        apikey: config.supabaseServiceKey,
      },
      body: JSON.stringify({
        congress: parsed.congress,
        billType: parsed.billType,
        number: parsed.number,
        title: bill.title,
        summary: '',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`explain-bill ${res.status}: ${text.slice(0, 200)}`);
    }

    const body = await res.json();
    return { cached: Boolean(body.cached) };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`explain-bill timeout after ${PER_BILL_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function preWarmBillExplanations(
  config: ETLConfig,
  maxBills?: number
): Promise<PreWarmResult> {
  // Resolution order: explicit arg → ETL_PREWARM_MAX env → 200 (daily default).
  // The backfill workflow sets the env to a large number to drain the backlog
  // in a single 6-hour run.
  const effectiveMax =
    maxBills ?? (parseInt(process.env.ETL_PREWARM_MAX || '200', 10) || 200);

  const result: PreWarmResult = { scanned: 0, generated: 0, cacheHits: 0, errors: [] };

  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let cachedKeys: Set<string>;
  try {
    cachedKeys = await fetchCachedBillKeys(supabase);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(message);
    return result;
  }

  logger.info(`Pre-warm: ${cachedKeys.size} explanations already cached`);

  let candidates: BillRow[];
  try {
    candidates = await fetchCandidateBills(supabase, cachedKeys, effectiveMax);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(message);
    return result;
  }

  if (candidates.length === 0) {
    logger.info('Pre-warm: no bills missing explanations');
    return result;
  }

  const budgetMs =
    parseInt(process.env.ETL_PREWARM_BUDGET_MS || '', 10) || DEFAULT_BUDGET_MS;
  const startedAt = Date.now();
  logger.info(
    `Pre-warm: generating up to ${candidates.length} explanations ` +
    `(budget ${(budgetMs / 60000).toFixed(0)}m)`
  );

  for (const bill of candidates) {
    if (Date.now() - startedAt > budgetMs) {
      logger.info(
        `Pre-warm: budget exhausted after ${result.scanned} bills; ` +
        `${candidates.length - result.scanned} skipped (will retry next run)`
      );
      break;
    }
    result.scanned++;
    try {
      const { cached } = await invokeExplainBill(config, bill);
      if (cached) {
        result.cacheHits++;
      } else {
        result.generated++;
        logger.debug(`Pre-warmed ${bill.id}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${bill.id}: ${message}`);
      logger.error(`Pre-warm failed for ${bill.id}`, err);
    }
    if (result.scanned % PROGRESS_LOG_EVERY === 0) {
      logger.info(
        `Pre-warm progress: ${result.scanned}/${candidates.length} (` +
        `${result.generated} generated, ${result.cacheHits} cached, ${result.errors.length} errors)`
      );
    }
    await sleep(REQUEST_SPACING_MS);
  }

  logger.info(
    `Pre-warm complete: ${result.generated} generated, ${result.cacheHits} already-cached, ${result.errors.length} errors`
  );

  return result;
}
