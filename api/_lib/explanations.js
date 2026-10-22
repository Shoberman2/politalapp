// Read a bill's plain-English explanation, writing it first when it is not
// cached yet. The writing happens once per bill (shared/billExplainer.js);
// every later reader gets the stored row.
//
// Callers: api/explain.js (website, iOS app) and the explain_bill MCP tool.

import { supabaseAdmin } from './supabase.js'
import { explainBill, parseBillKey, EXPLAINER_MODEL, EXPLAINER_PROMPT_VERSION } from '../../shared/billExplainer.js'

const COLUMNS = 'bill_key, bill_title, explanation, paragraphs, key_points, source_kind, source_label, source_date, source_url, created_at'

// Two readers of the same uncached bill on one instance share one model call.
const inFlight = new Map()

// Site-wide ceiling on explanations written because a reader opened a bill
// (the ETL's pre-warm is not counted). Per-IP limits only hold per instance
// without Upstash, so this is the real bound on model spend.
const DAILY_ON_DEMAND_CAP = Number(process.env.EXPLAIN_DAILY_CAP) || 500

async function onDemandWrittenToday() {
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)
  const { count, error } = await supabaseAdmin
    .from('bill_explanations')
    .select('bill_key', { count: 'exact', head: true })
    .eq('generated_by', 'on_demand')
    .gte('created_at', since.toISOString())
  if (error) throw new Error(`explanation count failed: ${error.message}`)
  return count || 0
}

export function explanationPayload(row) {
  if (!row) return null
  return {
    summary: row.explanation,
    paragraphs: (row.paragraphs || []).slice(1),
    key_points: row.key_points || [],
    source: {
      kind: row.source_kind,
      label: row.source_label,
      date: row.source_date,
      url: row.source_url,
    },
    written_by: 'AI, from the official text',
    model: EXPLAINER_MODEL,
    generated_at: row.created_at || null,
  }
}

// Throws on a database error: a failed read must not look like a cache miss,
// or every request would pay for a new explanation.
export async function readExplanation(billKey) {
  const { data, error } = await supabaseAdmin
    .from('bill_explanations')
    .select(COLUMNS)
    .eq('bill_key', billKey)
    .eq('model', EXPLAINER_MODEL)
    .eq('prompt_version', EXPLAINER_PROMPT_VERSION)
    .maybeSingle()
  if (error) throw new Error(`explanation read failed: ${error.message}`)
  return data || null
}

/**
 * @returns {Promise<{status: 'ok', row} | {status: 'not_found'|'no_source'|'rejected'|'unavailable', reason?: string}>}
 *   `allowGenerate: false` only reads the cache.
 */
export async function getOrCreateExplanation(billKey, { allowGenerate = true } = {}) {
  const key = parseBillKey(billKey)
  if (!key) return { status: 'not_found' }
  const id = `${key.congress}-${key.type}-${key.number}`

  const cached = await readExplanation(id)
  if (cached) return { status: 'ok', row: cached }
  if (!allowGenerate) return { status: 'unavailable', reason: 'not_cached' }

  if (inFlight.has(id)) return inFlight.get(id)
  const job = (async () => {
    // Only bills we carry. This also keeps arbitrary ids from spending model calls.
    const { data: bill } = await supabaseAdmin.from('bills').select('id, title, crs_summary').eq('id', id).maybeSingle()
    if (!bill) return { status: 'not_found' }
    if (await onDemandWrittenToday() >= DAILY_ON_DEMAND_CAP) {
      console.warn(`[explain] daily cap of ${DAILY_ON_DEMAND_CAP} reached; ${id} not written`)
      return { status: 'unavailable', reason: 'daily_cap' }
    }

    let out
    try {
      out = await explainBill(
        { key, title: bill.title, crsSummary: bill.crs_summary },
        { congressApiKey: process.env.CONGRESS_API_KEY, openaiApiKey: process.env.OPENAI_API_KEY },
      )
    } catch (err) {
      console.error(`[explain] ${id} failed:`, err?.message)
      return { status: 'unavailable', reason: 'source_or_model_error' }
    }
    if (out.status !== 'ok') return { status: out.status, reason: out.reason }

    const { error } = await supabaseAdmin.from('bill_explanations').upsert({ ...out.row, generated_by: 'on_demand' })
    if (error) console.error(`[explain] ${id} cache write failed:`, error.message)
    return { status: 'ok', row: { ...out.row, created_at: new Date().toISOString() } }
  })()
  inFlight.set(id, job)
  try {
    return await job
  } finally {
    inFlight.delete(id)
  }
}
