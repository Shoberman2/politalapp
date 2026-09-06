import { supabaseAdmin } from './supabase.js'

// The ETL's last successful run, cached for a minute per function instance so
// every API response can carry `data_updated_at` without a query each time.
const TTL_MS = 60_000
let cache = { value: null, at: 0 }

export async function getDataUpdatedAt() {
  const now = Date.now()
  if (cache.at && now - cache.at < TTL_MS) return cache.value
  try {
    const { data } = await supabaseAdmin.from('etl_metadata').select('value').eq('key', 'last_successful_run').maybeSingle()
    cache = { value: data?.value || null, at: now }
  } catch (err) {
    console.warn('[etlMeta] lookup failed:', err?.message)
    cache = { value: cache.value, at: now }
  }
  return cache.value
}

export function _resetEtlMetaCache() {
  cache = { value: null, at: 0 }
}
