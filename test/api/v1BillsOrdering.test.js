import { describe, it, expect, vi, beforeEach } from 'vitest'

// REGRESSION: bills that have not yet been detailed carry introduced_at =
// NULL (the ETL no longer fabricates a date). Postgres puts NULLs first in a
// DESC order, so without nullsFirst:false every undated stub would head the
// public bills listing and search results.
const m = vi.hoisted(() => ({ orders: [], insert: vi.fn(), maybeSingle: vi.fn() }))
vi.mock('../../api/_lib/supabase.js', () => ({
  supabaseAdmin: {
    from: (table) => {
      if (table === 'bills') {
        const chain = {
          select: () => chain, ilike: () => chain, gte: () => chain, lte: () => chain,
          order: (col, opts) => { m.orders.push({ col, opts }); return chain },
          range: () => Promise.resolve({ data: [], count: 0, error: null }),
          limit: () => Promise.resolve({ data: [], error: null }),
        }
        return chain
      }
      if (table === 'politicians') {
        const chain = { select: () => chain, or: () => chain, ilike: () => chain, limit: () => Promise.resolve({ data: [], error: null }) }
        return chain
      }
      if (table === 'etl_metadata') return { select: () => ({ eq: () => ({ maybeSingle: m.maybeSingle }) }) }
      if (table === 'api_usage') return { insert: m.insert }
      throw new Error(`unexpected table ${table}`)
    },
  },
}))

import bills from '../../api/v1/bills.js'
import search from '../../api/v1/search.js'
import { _resetMemory } from '../../api/_lib/rateLimit.js'
import { _resetEtlMetaCache } from '../../api/_lib/etlMeta.js'

function res() {
  const h = new Map()
  return { statusCode: 0, body: '', setHeader: (k, v) => h.set(k.toLowerCase(), v), end(b) { this.body = b || '' }, h }
}

describe('public bill listings put undated bills last', () => {
  beforeEach(() => {
    _resetMemory(); _resetEtlMetaCache(); m.orders.length = 0
    m.maybeSingle.mockResolvedValue({ data: { value: '2026-09-06T06:00:00.000Z' } })
    m.insert.mockImplementation(() => ({ then: (r) => { r({ error: null }); return { catch() {} } } }))
  })

  it('GET /api/v1/bills orders by introduced_at desc with nulls last', async () => {
    const r = res()
    await bills({ method: 'GET', url: '/api/v1/bills', headers: { 'x-real-ip': '203.0.113.7' } }, r)
    expect(r.statusCode).toBe(200)
    expect(m.orders).toEqual([{ col: 'introduced_at', opts: { ascending: false, nullsFirst: false } }])
  })

  it('GET /api/v1/search?type=bills orders the same way', async () => {
    const r = res()
    await search({ method: 'GET', url: '/api/v1/search?q=broadband&type=bills', headers: { 'x-real-ip': '203.0.113.8' } }, r)
    expect(r.statusCode).toBe(200)
    expect(m.orders).toEqual([{ col: 'introduced_at', opts: { ascending: false, nullsFirst: false } }])
  })
})
