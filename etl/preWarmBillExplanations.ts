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

interface GeneratedExplanation {
  explanation: string;
  paragraphs: string[];
}

function buildPrompt(title: string, summary: string): string {
  const summaryBlock = summary
    ? `Here is the official summary from Congress.gov to ground your explanation:\n${summary}\n`
    : `No official summary is available yet. Reason from the title and your general knowledge of how this kind of legislation typically works. Be explicit when you are inferring vs. citing the bill itself.\n`;

  return `You are a nonpartisan expert at explaining U.S. legislation to ordinary citizens. You write like a great civics teacher: clear, specific, never condescending.

Bill: ${title}

${summaryBlock}
Write a depth explanation of this bill. Aim for 4 to 6 substantive paragraphs, written in plain English. Cover each of these in order, in flowing prose (no headers, no bullet points, no numbered lists):

1. What the bill actually does. The specific changes to law, programs, agencies, eligibility, funding, or rules. If the title is vague, say what category of bill this is and what the most likely concrete effects would be based on the text or category.
2. Why this bill exists right now. What problem its sponsors say it solves, what political or current event likely motivated it, what tradeoffs it makes.
3. Who is directly affected. Name the groups: which taxpayers, which workers, which industries, which states, which agencies, which beneficiaries. Use concrete examples ("a single parent earning $40k", "small farms in the Midwest", "Medicare Part D enrollees").
4. The likely real-world impact if it became law. Both the intended outcomes and the second-order effects opponents typically raise.
5. Realistic chances of becoming law. Note whether it is bipartisan or single-party, whether it has cleared committee, whether similar bills have failed before. Do not predict, just describe the situation.
6. Why a regular citizen should care, in one direct paragraph.

Hard rules:
- Plain language. No legalese, no jargon, no acronyms without expanding them once.
- Be specific. "This affects taxpayers" is useless. "This affects single filers earning over $200,000" is useful.
- Be balanced. Present both sides where there is genuine disagreement.
- No citations, URLs, footnotes, or bracketed source markers.
- No headers, no bullets, no numbered lists. Flowing paragraphs only.
- Do not invent specific dollar amounts, dates, or vote tallies you are not sure of. If you do not know, describe in general terms.`;
}

function cleanResponse(text: string): GeneratedExplanation {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\[\d+\]/g, '')
    .replace(/\(source:.*?\)/gi, '')
    .trim();

  const paragraphs = cleaned
    .split(/\n\s*\n/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(p => p.length > 0);

  return {
    explanation: paragraphs[0] || '',
    paragraphs,
  };
}

function shouldStopPrewarmAfterError(message: string): boolean {
  return (
    /OPENAI_API_KEY not configured/i.test(message) ||
    /OpenAI 429/i.test(message) ||
    /quota/i.test(message)
  );
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

async function generateExplanationWithOpenAI(
  config: ETLConfig,
  bill: BillRow
): Promise<GeneratedExplanation> {
  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: buildPrompt(bill.title, '') }],
      max_tokens: 2500,
      temperature: 0.5,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`);
  }

  const body = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = body.choices?.[0]?.message?.content || '';
  const generated = cleanResponse(raw);

  if (!generated.explanation || generated.paragraphs.length === 0) {
    throw new Error('Empty response from model');
  }

  return generated;
}

async function upsertGeneratedExplanation(
  supabase: SupabaseClient,
  bill: BillRow,
  generated: GeneratedExplanation
): Promise<void> {
  const { error } = await supabase
    .from('bill_explanations')
    .upsert({
      bill_key: bill.id.toLowerCase(),
      model: MODEL,
      prompt_version: PROMPT_VERSION,
      bill_title: bill.title,
      explanation: generated.explanation,
      paragraphs: generated.paragraphs,
    }, { onConflict: 'bill_key,model,prompt_version' });

  if (error) {
    throw new Error(`Failed to write bill_explanations: ${error.message}`);
  }
}

async function generateAndStoreExplanation(
  supabase: SupabaseClient,
  config: ETLConfig,
  bill: BillRow
): Promise<{ cached: boolean }> {
  const generated = await generateExplanationWithOpenAI(config, bill);
  await upsertGeneratedExplanation(supabase, bill, generated);
  return { cached: false };
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
  if (config.openaiApiKey) {
    logger.info('Pre-warm: using ETL OPENAI_API_KEY for direct generation');
  } else {
    logger.info('Pre-warm: using explain-bill Edge Function fallback');
  }

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
      const { cached } = config.openaiApiKey
        ? await generateAndStoreExplanation(supabase, config, bill)
        : await invokeExplainBill(config, bill);
      if (cached) {
        result.cacheHits++;
      } else {
        result.generated++;
        logger.debug(`Pre-warmed ${bill.id}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${bill.id}: ${message}`);
      logger.error(`Pre-warm failed for ${bill.id}: ${message}`);
      if (shouldStopPrewarmAfterError(message)) {
        logger.warn('Pre-warm stopped early because generation is not currently available');
        break;
      }
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
