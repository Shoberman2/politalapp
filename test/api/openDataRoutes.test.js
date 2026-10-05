import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const m = vi.hoisted(() => ({ insert: vi.fn() }))
vi.mock('../../api/_lib/supabase.js', () => ({
  supabaseAdmin: {
    from: (table) => {
      if (table === 'api_usage') return { insert: m.insert }
      throw new Error(`unexpected table ${table}`)
    },
  },
}))

import handler, { _resetDatasetsMemo } from '../../api/v1/datasets.js'
import { _resetMemory } from '../../api/_lib/rateLimit.js'
import { OPEN_DATA_STORAGE_BASE, openDataFiles } from '../../shared/openData.js'

const root = process.cwd()
const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'))

function res() {
  const h = new Map()
  return { statusCode: 0, body: '', setHeader: (k, v) => h.set(k.toLowerCase(), v), end(b) { this.body = b || '' }, h }
}
function get(headers = {}) {
  const r = res()
  return handler({ method: 'GET', url: '/api/v1/datasets', headers: { 'x-real-ip': '203.0.113.7', ...headers } }, r).then(() => r)
}

const MANIFEST = { generated_at: '2026-10-04T07:31:00Z', data_updated_at: '2026-10-04T06:40:00Z', current_congress: 119, license: { id: 'CC0-1.0' }, files: openDataFiles(119).map((f) => ({ ...f, rows: 1, bytes: 10, sha256: 'x' })) }

describe('GET /api/v1/datasets', () => {
  beforeEach(() => {
    _resetMemory(); _resetDatasetsMemo()
    m.insert.mockReset()
    m.insert.mockImplementation(() => ({ then: (r) => { r({ error: null }); return { catch() {} } } }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('relays the latest manifest keylessly, CDN-cached, and memoizes', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(MANIFEST), { headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await get()
    expect(r.statusCode).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(`${OPEN_DATA_STORAGE_BASE}/latest/manifest.json`, expect.anything())
    expect(r.h.get('cache-control')).toContain('s-maxage=900')
    expect(r.h.get('access-control-allow-origin')).toBe('*')
    const body = JSON.parse(r.body)
    expect(body.data.files).toHaveLength(MANIFEST.files.length)
    expect(body.meta).toMatchObject({ api_version: 'v1', data_updated_at: MANIFEST.data_updated_at, manifest_url: 'https://www.ballotwatch.io/data/full/manifest.json', license: 'https://creativecommons.org/publicdomain/zero/1.0/' })
    await get()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('answers 503 SNAPSHOT_UNAVAILABLE before the first publish', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"not_found"}', { status: 400 })))
    const r = await get()
    expect(r.statusCode).toBe(503)
    expect(JSON.parse(r.body).error.code).toBe('SNAPSHOT_UNAVAILABLE')
    expect(r.h.get('retry-after')).toBe('60')
  })
})

describe('open-data routing in vercel.json', () => {
  it('rewrites /data/full and /data/archive to the public bucket named in shared/openData.js', () => {
    const full = vercel.rewrites.find((r) => r.source === '/data/full/:path*')
    expect(full.destination).toBe(`${OPEN_DATA_STORAGE_BASE}/latest/:path*`)
    const archive = vercel.rewrites.find((r) => r.source.startsWith('/data/archive/:date'))
    expect(archive.destination).toBe(`${OPEN_DATA_STORAGE_BASE}/:date/:path*`)
    const catchAll = vercel.rewrites.findIndex((r) => r.destination === '/index.html')
    expect(vercel.rewrites.indexOf(full)).toBeLessThan(catchAll)
    expect(vercel.rewrites.indexOf(archive)).toBeLessThan(catchAll)
  })

  it('serves the MCP server card as static JSON and keeps .well-known out of the SPA catch-all', () => {
    const catchAll = vercel.rewrites.find((r) => r.destination === '/index.html')
    const re = new RegExp(`^${catchAll.source.replace(/^\//, '/')}$`)
    expect(re.test('/.well-known/mcp/server-card.json')).toBe(false)
    expect(re.test('/llms-full.txt')).toBe(false)
    expect(vercel.rewrites.find((r) => r.source === '/mcp/server-card').destination).toBe('/.well-known/mcp/server-card.json')
    const h = vercel.headers.find((x) => x.source === '/.well-known/mcp/(.*)')
    expect(h.headers.find((x) => x.key === 'Content-Type').value).toBe('application/json')
  })

  it('keeps the /data sample files static (no rewrite shadows them)', () => {
    for (const r of vercel.rewrites) expect(r.source === '/data/:path*' || r.source === '/data/(.*)').toBe(false)
  })
})
