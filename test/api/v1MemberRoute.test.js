import { describe, it, expect, vi, beforeEach } from 'vitest'

// One representative v1 route: anonymous access, freshness metadata, the
// canonical Link header, and usage logging with the key object.
const m = vi.hoisted(() => ({ single: vi.fn(), insert: vi.fn(), maybeSingle: vi.fn() }))
vi.mock('../../api/_lib/supabase.js', () => ({
  supabaseAdmin: {
    from: (table) => {
      if (table === 'politicians') return { select: () => ({ eq: () => ({ single: m.single }) }) }
      if (table === 'etl_metadata') return { select: () => ({ eq: () => ({ maybeSingle: m.maybeSingle }) }) }
      if (table === 'api_usage') return { insert: m.insert }
      throw new Error(`unexpected table ${table}`)
    },
  },
}))

import handler from '../../api/v1/members/[bioguideId].js'
import { _resetMemory } from '../../api/_lib/rateLimit.js'
import { _resetEtlMetaCache } from '../../api/_lib/etlMeta.js'

function res() {
  const h = new Map()
  return { statusCode: 0, body: '', setHeader: (k, v) => h.set(k.toLowerCase(), v), end(b) { this.body = b || '' }, h }
}

describe('GET /api/v1/members/:bioguideId', () => {
  beforeEach(() => {
    _resetMemory(); _resetEtlMetaCache()
    m.single.mockReset(); m.insert.mockReset(); m.maybeSingle.mockReset()
    m.maybeSingle.mockResolvedValue({ data: { value: '2026-09-05T10:25:32.028Z' } })
    m.insert.mockImplementation(() => ({ then: (r) => { r({ error: null }); return { catch() {} } } }))
  })

  it('serves an anonymous GET with freshness, source_url, a canonical Link, and CDN caching', async () => {
    m.single.mockResolvedValue({ data: { id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', state: 'CA', district: null, party: 'Democrat' }, error: null })
    const r = res()
    await handler({ method: 'GET', url: '/api/v1/members/P000197', headers: { 'x-real-ip': '203.0.113.5' } }, r)
    expect(r.statusCode).toBe(200)
    const body = JSON.parse(r.body)
    expect(body.data.source_url).toBe('https://www.congress.gov/member/P000197')
    expect(body.meta.data_updated_at).toBe('2026-09-05T10:25:32.028Z')
    expect(r.h.get('link')).toBe('<https://www.congress.gov/member/P000197>; rel="canonical"')
    expect(r.h.get('cache-control')).toContain('s-maxage=300')
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ key_id: null, endpoint: '/v1/members/P000197', status_code: 200 }))
    expect(m.insert.mock.calls[0][0].ip_hash).toHaveLength(32)
  })

  it('returns 404 with freshness for an unknown member', async () => {
    m.single.mockResolvedValue({ data: null, error: { message: 'no rows' } })
    const r = res()
    await handler({ method: 'GET', url: '/api/v1/members/Z999999', headers: { 'x-real-ip': '203.0.113.6' } }, r)
    expect(r.statusCode).toBe(404)
    expect(JSON.parse(r.body).error.code).toBe('NOT_FOUND')
    expect(r.h.get('cache-control')).toBeUndefined()
  })
})
