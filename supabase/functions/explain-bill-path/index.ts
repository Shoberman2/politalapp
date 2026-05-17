/**
 * Edge Function: explain-bill-path
 *
 * Invoked synchronously by BillDetail.jsx when the bill_path_explanations
 * cache has no row for the bill. Generates a 2-3 sentence narrative of
 * "where this bill goes" — which committees, what those committees do,
 * where the bill currently sits, and what the typical next step is.
 *
 * Grounded in structured data:
 *   - bills.title + legislative_stage
 *   - bill_committee_routings (committee + subcommittee)
 *   - committee_survival_stats (primary committee survival % per Congress)
 *
 * Hard rules baked into the prompt + filter:
 *   - No politically-loaded language (forbidden-word filter, retry-once).
 *   - No fabricated stats; only cite numbers we passed in.
 *   - No headers, bullets, or lists; flowing prose only.
 *   - Skip the glossary sentence for unknown committees rather than
 *     hallucinating jurisdiction.
 *
 * Cache key: (bill_id, prompt_version). Bumping PROMPT_VERSION writes new
 * rows; old rows stay for audit.
 *
 * Counters incremented in feature_metrics:
 *   - explain_bill_path.cold_start
 *   - explain_bill_path.cache_hit
 *   - explain_bill_path.forbidden_word_retry
 *
 * Note: forbidden-word filter is inlined here rather than imported from
 * /shared because Supabase Edge Functions deploy as standalone Deno bundles
 * and reaching outside supabase/functions/ at deploy time is fragile. The
 * filter is small enough that duplication is acceptable; the regex is
 * intentionally identical to shared/forbiddenWordFilter.ts.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'gpt-4o-mini';
const PROMPT_VERSION = 'v1';
const FORBIDDEN_REGEX = /\b(bias(ed)?|anti-american|corrupt(ion)?|influence[- ]peddling)\b/i;

// =============================================================================
// PROMPT
// =============================================================================

interface RoutingRow {
  committee_code: string;
  committee_name: string | null;
  subcommittee_name: string | null;
  chamber: string | null;
  referred_at: string | null;
  activity_type: string | null;
}

interface BillRow {
  id: string;
  title: string;
  legislative_stage: string | null;
  introduced_at: string | null;
  sponsor_name: string | null;
}

interface SurvivalRow {
  committee_code: string;
  congress: number;
  bills_referred_as_primary: number;
  bills_advanced: number;
  survival_pct: number | null;
}

function buildPrompt(
  bill: BillRow,
  routings: RoutingRow[],
  primaryCommittee: RoutingRow | null,
  primarySurvival: SurvivalRow | null
): string {
  const stage = bill.legislative_stage || 'unknown';

  const routingLines = routings
    .map((r) => {
      const sub = r.subcommittee_name ? ` (Subcommittee on ${r.subcommittee_name})` : '';
      const date = r.referred_at ? ` on ${r.referred_at}` : '';
      const verb = (r.activity_type || 'referred_to').replace(/_/g, ' ');
      return `- ${r.committee_name || r.committee_code}${sub}: ${verb}${date}`;
    })
    .join('\n');

  const survivalLine =
    primaryCommittee && primarySurvival && primarySurvival.survival_pct != null
      ? `The primary committee (${primaryCommittee.committee_name || primaryCommittee.committee_code}) historically advances ${primarySurvival.survival_pct}% of bills referred to it (${primarySurvival.bills_referred_as_primary} bills sampled in the ${primarySurvival.congress}th Congress).`
      : primaryCommittee
        ? `Survival history for ${primaryCommittee.committee_name || primaryCommittee.committee_code} is not yet established (insufficient sample).`
        : 'This bill has no committee referral.';

  return `You are a nonpartisan civic explainer. Describe in 2 to 3 short sentences where this bill currently sits in the legislative process and what the typical next step is.

Bill: ${bill.title} (${bill.id})
Current legislative stage: ${stage}
Sponsor: ${bill.sponsor_name || 'unknown'}

Committee routings:
${routingLines || '(none — bill is not in committee)'}

Historical context:
${survivalLine}

Hard rules:
- Plain English. No legalese, no jargon, no acronyms without expanding.
- Cite numbers ONLY from the historical context above. Do not invent percentages or dates.
- Do not speculate about motive. Describe what is, not what should be.
- Do NOT use these words: bias, biased, anti-American, corruption, influence-peddling.
- No headers, no bullets, no numbered lists. 2 to 3 flowing sentences only, total under 80 words.
- No URLs, no footnotes.`;
}

// =============================================================================
// HELPERS
// =============================================================================

function containsForbidden(s: string): boolean {
  return FORBIDDEN_REGEX.test(s);
}

// Compute the primary committee for this bill — earliest referred_at, ties by
// alphabetic committee_code. Mirrors the methodology in computeCommitteeSurvival.
function pickPrimaryCommittee(routings: RoutingRow[]): RoutingRow | null {
  if (routings.length === 0) return null;
  const sorted = [...routings].sort((a, b) => {
    // NULLs last on referred_at
    if (a.referred_at === null && b.referred_at !== null) return 1;
    if (b.referred_at === null && a.referred_at !== null) return -1;
    if (a.referred_at !== b.referred_at) {
      return (a.referred_at ?? '') < (b.referred_at ?? '') ? -1 : 1;
    }
    return a.committee_code < b.committee_code ? -1 : 1;
  });
  return sorted[0];
}

function congressFromBillId(id: string): number | null {
  const m = /^(\d+)-/.exec(id);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

async function bumpCounter(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  metricName: string
): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  // Best-effort: read current value + 1 + upsert. Race-tolerant enough for
  // anonymous daily counters; precise counts are not safety-critical.
  try {
    const { data: existing } = await supabase
      .from('feature_metrics')
      .select('value')
      .eq('metric_name', metricName)
      .eq('day', day)
      .maybeSingle();
    const newValue = ((existing as any)?.value || 0) + 1;
    await supabase
      .from('feature_metrics')
      .upsert(
        { metric_name: metricName, day, value: newValue },
        { onConflict: 'metric_name,day', ignoreDuplicates: false }
      );
  } catch (_) {
    // Swallow — metric bump must never fail the user-facing call.
  }
}

async function callOpenAI(prompt: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 220,
        temperature: 0.35,
      }),
    });
    if (!res.ok) {
      console.warn(`[explain-bill-path] OpenAI ${res.status}`);
      return null;
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    return typeof text === 'string' ? text.trim() : null;
  } catch (err) {
    console.warn(`[explain-bill-path] OpenAI network error: ${(err as Error).message}`);
    return null;
  }
}

function templateFallback(bill: BillRow, primary: RoutingRow | null): string {
  if (!primary) {
    return `${bill.title || bill.id} has not been referred to a committee yet. Typical next step is committee referral upon introduction.`;
  }
  const stage = bill.legislative_stage || 'introduced';
  return `${bill.title || bill.id} is currently at the ${stage.replace(/_/g, ' ')} stage. It was referred to the ${primary.committee_name || primary.committee_code}, which handles bills in this area. The typical next step is committee markup or further referral within that committee.`;
}

// =============================================================================
// HANDLER
// =============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { bill_id } = await req.json();
    if (!bill_id || typeof bill_id !== 'string' || !/^\d+-[a-z]+-\d+$/i.test(bill_id)) {
      return new Response(
        JSON.stringify({ error: 'Invalid bill_id (expected "{congress}-{type}-{number}")' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // --------- Cache lookup ---------
    const { data: cached } = await supabase
      .from('bill_path_explanations')
      .select('narrative, generated_at')
      .eq('bill_id', bill_id)
      .eq('prompt_version', PROMPT_VERSION)
      .maybeSingle();

    if (cached) {
      await bumpCounter(supabase, 'explain_bill_path.cache_hit');
      return new Response(
        JSON.stringify({
          narrative: (cached as any).narrative,
          prompt_version: PROMPT_VERSION,
          model: MODEL,
          cached: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --------- Cache miss: load context ---------
    const { data: bill, error: billErr } = await supabase
      .from('bills')
      .select('id, title, legislative_stage, introduced_at, sponsor_name')
      .eq('id', bill_id)
      .maybeSingle();

    if (billErr || !bill) {
      return new Response(JSON.stringify({ error: 'Bill not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: routingRows } = await supabase
      .from('bill_committee_routings')
      .select('committee_code, committee_name, subcommittee_name, chamber, referred_at, activity_type')
      .eq('bill_id', bill_id)
      .order('referred_at', { ascending: true });

    const routings: RoutingRow[] = (routingRows as any[]) || [];
    const primary = pickPrimaryCommittee(routings);
    const congress = congressFromBillId(bill_id);

    let survival: SurvivalRow | null = null;
    if (primary && congress != null) {
      const { data: surv } = await supabase
        .from('committee_survival_stats')
        .select('committee_code, congress, bills_referred_as_primary, bills_advanced, survival_pct')
        .eq('committee_code', primary.committee_code)
        .eq('congress', congress)
        .eq('methodology_version', 'v1')
        .maybeSingle();
      survival = (surv as SurvivalRow) || null;
    }

    await bumpCounter(supabase, 'explain_bill_path.cold_start');

    // --------- Generate narrative (retry-once on forbidden words) ---------
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const prompt = buildPrompt(bill as BillRow, routings, primary, survival);

    let narrative = await callOpenAI(prompt, apiKey);
    let source: 'first' | 'retry' | 'fallback' = 'first';
    if (!narrative || containsForbidden(narrative)) {
      if (narrative && containsForbidden(narrative)) {
        await bumpCounter(supabase, 'explain_bill_path.forbidden_word_retry');
      }
      narrative = await callOpenAI(prompt, apiKey);
      source = 'retry';
      if (!narrative || containsForbidden(narrative)) {
        narrative = templateFallback(bill as BillRow, primary);
        source = 'fallback';
      }
    }

    // --------- Persist ---------
    await supabase
      .from('bill_path_explanations')
      .upsert(
        {
          bill_id,
          narrative,
          model: MODEL,
          prompt_version: PROMPT_VERSION,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'bill_id,prompt_version', ignoreDuplicates: false }
      );

    return new Response(
      JSON.stringify({
        narrative,
        prompt_version: PROMPT_VERSION,
        model: MODEL,
        cached: false,
        source,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[explain-bill-path] error', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
