import { validateApiKey } from '../_lib/auth.js'
import { handleCors, jsonResponse, errorResponse, nodeHandler } from '../_lib/response.js'
import { logUsage } from '../_lib/usage.js'
import {
  OPEN_DATA_STORAGE_BASE,
  LATEST_PREFIX,
  MANIFEST_URL,
  DATAPACKAGE_URL,
  DATA_LICENSE,
} from '../../shared/openData.js'

// GET /api/v1/datasets
//
// The manifest of the latest open-data snapshot (bulk CSV/NDJSON files of
// every member, bill, roll call and vote; CC0 1.0), so agents can discover the
// files programmatically. The files themselves are static objects in Supabase
// Storage served at /data/full/* (vercel.json); this function only relays the
// small manifest. Keyless like the rest of /api/v1. The CDN caches the
// anonymous 200 for 15 minutes; each instance also memoizes for 5 minutes so a
// burst does not fan out to Storage.

const ENDPOINT = '/v1/datasets'
const MANIFEST_SOURCE = `${OPEN_DATA_STORAGE_BASE}/${LATEST_PREFIX}/manifest.json`
const MEMO_MS = 5 * 60 * 1000
const CACHE_OK = 'public, s-maxage=900, stale-while-revalidate=3600'

let memo = { at: 0, manifest: null }

export function _resetDatasetsMemo() { memo = { at: 0, manifest: null } }

async function loadManifest() {
  const now = Date.now()
  if (memo.manifest && now - memo.at < MEMO_MS) return memo.manifest
  const res = await fetch(MANIFEST_SOURCE, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw Object.assign(new Error(`manifest ${res.status}`), { status: res.status })
  const manifest = await res.json()
  if (!manifest || !Array.isArray(manifest.files)) throw new Error('manifest malformed')
  memo = { at: now, manifest }
  return manifest
}

async function route(req) {
  const cors = handleCors(req)
  if (cors) return cors

  const start = Date.now()
  const auth = await validateApiKey(req)
  if (auth.error) return auth.error

  let manifest
  try {
    manifest = await loadManifest()
  } catch (err) {
    logUsage(auth.key, ENDPOINT, 'GET', 503, Date.now() - start)
    const failed = errorResponse(
      err?.status === 404 || err?.status === 400
        ? 'No open-data snapshot has been published yet. The daily export publishes it to /data/full/manifest.json.'
        : 'The open-data manifest could not be read right now; try again shortly.',
      503,
      'SNAPSHOT_UNAVAILABLE'
    )
    failed.headers.set('Cache-Control', 'public, s-maxage=60')
    failed.headers.set('Retry-After', '60')
    return failed
  }

  logUsage(auth.key, ENDPOINT, 'GET', 200, Date.now() - start)
  return jsonResponse({
    data: manifest,
    meta: {
      api_version: 'v1',
      data_updated_at: manifest.data_updated_at ?? null,
      generated_at: manifest.generated_at ?? null,
      manifest_url: MANIFEST_URL,
      datapackage_url: DATAPACKAGE_URL,
      license: DATA_LICENSE.path,
    },
  }, 200, req.headers?.authorization ? {} : { 'Cache-Control': CACHE_OK, Vary: 'Authorization' })
}

export default nodeHandler(route)

export const config = { runtime: 'nodejs' }
