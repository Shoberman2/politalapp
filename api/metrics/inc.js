/**
 * POST /api/metrics/inc
 *
 * Increments anonymous daily engagement counters in feature_metrics.
 * Called from the frontend (fire-and-forget, debounced) on:
 *   - routing_panel_expanded
 *   - survival_pill_opened
 *   - committee_page_visited
 *   - sponsor_filter_used
 *
 * Vercel serverless function — mirrors the existing api/share.js pattern
 * for runtime + handler shape.
 *
 * Security (per eng-review D5 + outside-voice D15):
 *   1. Origin header MUST equal VITE_PUBLIC_ORIGIN env var. 403 otherwise.
 *      (Spoofable but stops trivial abuse from random scripts.)
 *   2. Per-IP rate limit: 60 events/min. 429 over budget.
 *   3. metric_name MUST be in the allow-list. 400 otherwise.
 *
 * Rate-limit storage: in-memory Map per Vercel instance. This is a v1
 * compromise — Vercel KV / Upstash would give cross-instance limits but
 * isn't yet provisioned. In practice the rate limit deters abuse from a
 * single script even with per-instance state, and any sustained abuse
 * is visible in feature_metrics row counts.
 *
 * Returns 204 on success (no body).
 */

import { createClient } from '@supabase/supabase-js';

const ALLOWED_METRICS = new Set([
  'routing_panel_expanded',
  'survival_pill_opened',
  'committee_page_visited',
  'sponsor_filter_used',
  // Edge Function counters are written from the function itself, NOT through
  // this endpoint. The names live in the same `feature_metrics` table:
  //   explain_bill_path.cold_start
  //   explain_bill_path.cache_hit
  //   explain_bill_path.forbidden_word_retry
  //   committee_survival.insufficient_history_pct
]);

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

// In-memory rate-limit map. Lives per Vercel instance.
// { ip: { count, windowStart } }
const rateLimitMap = new Map();

function rateLimitOk(ip) {
  if (!ip) return true; // can't enforce without an IP
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    // Lazy cleanup of stale entries to avoid unbounded memory growth.
    if (rateLimitMap.size > 5000) {
      const cutoff = now - RATE_LIMIT_WINDOW_MS;
      for (const [k, v] of rateLimitMap) {
        if (v.windowStart < cutoff) rateLimitMap.delete(k);
      }
    }
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || null;
}

export default async function handler(req, res) {
  // CORS: this endpoint is for the same-origin frontend only. Reflect
  // the configured public origin if it matches the request's Origin;
  // otherwise no CORS header is sent (and the browser blocks the call).
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).setHeader('Allow', 'POST').end();
    return;
  }

  // --------- Origin check ---------
  const expectedOrigin = process.env.VITE_PUBLIC_ORIGIN;
  const origin = req.headers.origin;
  if (expectedOrigin) {
    if (!origin || origin !== expectedOrigin) {
      res.status(403).json({ error: 'Origin not allowed' });
      return;
    }
  }
  // If VITE_PUBLIC_ORIGIN is unset (dev / first deploy), skip the check
  // rather than 403 every request — but log so it's visible.
  if (!expectedOrigin) {
    console.warn('[metrics/inc] VITE_PUBLIC_ORIGIN unset — Origin check disabled');
  }

  // --------- Rate limit ---------
  const ip = clientIp(req);
  if (!rateLimitOk(ip)) {
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }

  // --------- Body validation ---------
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }
  }
  const metricName = body?.metric_name;
  if (!metricName || typeof metricName !== 'string' || !ALLOWED_METRICS.has(metricName)) {
    res.status(400).json({ error: 'Invalid or unknown metric_name' });
    return;
  }

  // --------- Increment ---------
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('[metrics/inc] Supabase env missing — cannot increment');
    res.status(500).json({ error: 'Server misconfigured' });
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const day = new Date().toISOString().slice(0, 10);
  try {
    // Read-then-upsert. Race-tolerant for anonymous engagement counters;
    // precision is not safety-critical at the per-event level.
    const { data: existing } = await supabase
      .from('feature_metrics')
      .select('value')
      .eq('metric_name', metricName)
      .eq('day', day)
      .maybeSingle();
    const newValue = ((existing?.value) || 0) + 1;
    const { error: upsertErr } = await supabase
      .from('feature_metrics')
      .upsert(
        { metric_name: metricName, day, value: newValue },
        { onConflict: 'metric_name,day', ignoreDuplicates: false }
      );
    if (upsertErr) {
      console.error('[metrics/inc] upsert failed', upsertErr);
      res.status(500).json({ error: 'Increment failed' });
      return;
    }
    res.status(204).end();
  } catch (err) {
    console.error('[metrics/inc] unexpected error', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
}
