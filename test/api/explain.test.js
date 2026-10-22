import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '../fixtures/supabaseChain.js'

const db = makeSupabaseMock()
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: (t) => db.from(t) } }))

const explainBill = vi.fn()
vi.mock('../../shared/billExplainer.js', async (orig) => ({ ...(await orig()), explainBill: (...a) => explainBill(...a) }))

import handler from '../../api/explain.js'
import { getOrCreateExplanation } from '../../api/_lib/explanations.js'
import { explainBill as explainBillTool } from '../../api/_lib/mcpTools.js'

const row = {
  bill_key: '119-hr-12', model: 'gpt-5.4-mini', prompt_version: 3, bill_title: 'Delivery Times Act',
  explanation: 'This bill would require monthly delivery reports.',
  paragraphs: ['This bill would require monthly delivery reports.', 'The Postal Service would post them online.'],
  key_points: ['Monthly reports'], source_kind: 'bill-text', source_label: 'Introduced in House',
  source_date: '2026-01-02T05:00:00+00:00', source_url: 'https://www.congress.gov/119/bills/hr12/BILLS-119hr12ih.htm',
}

const get = (q, ip = '9.9.9.9') => handler(new Request(`https://www.ballotwatch.io/api/explain?${q}`, { headers: { 'x-real-ip': ip } }))

describe('GET /api/explain', () => {
  beforeEach(() => { db.reset(); explainBill.mockReset() })

  it('serves a stored explanation without calling the model', async () => {
    db.responses.bill_explanations = { data: row }
    const res = await get('bill=119-HR-12')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=86400/)
    const body = await res.json()
    expect(body).toMatchObject({ status: 'ok', bill: '119-hr-12', explanation: { summary: row.explanation, paragraphs: [row.paragraphs[1]], key_points: ['Monthly reports'], source: { kind: 'bill-text', label: 'Introduced in House', url: row.source_url } } })
    expect(explainBill).not.toHaveBeenCalled()
    expect(db.ops('bill_explanations', 'eq')).toEqual([['eq', 'bill_key', '119-hr-12'], ['eq', 'model', 'gpt-5.4-mini'], ['eq', 'prompt_version', 3]])
  })

  it('writes and stores one on first view, from the bill row we carry', async () => {
    // api read, cache read, today's on-demand count, upsert.
    db.responses.bill_explanations = [{ data: null }, { data: null }, { count: 3 }, { data: null, error: null }]
    db.responses.bills = { data: { id: '119-hr-12', title: 'Delivery Times Act', crs_summary: null } }
    explainBill.mockResolvedValue({ status: 'ok', row, usage: [] })
    const res = await get('bill=119-hr-12', '9.9.9.1')
    expect((await res.json()).status).toBe('ok')
    expect(explainBill.mock.calls[0][0]).toMatchObject({ key: { congress: 119, type: 'hr', number: 12 }, title: 'Delivery Times Act' })
    expect(db.ops('bill_explanations', 'upsert')[0][1]).toEqual({ ...row, generated_by: 'on_demand' })
  })

  it('stops writing new ones at the site-wide daily cap', async () => {
    db.responses.bill_explanations = [{ data: null }, { data: null }, { count: 500 }]
    db.responses.bills = { data: { id: '119-hr-15', title: 'T', crs_summary: null } }
    const res = await get('bill=119-hr-15', '9.9.9.5')
    expect(await res.json()).toEqual({ status: 'unavailable', bill: '119-hr-15' })
    expect(explainBill).not.toHaveBeenCalled()
  })

  // A failed read must not look like a cache miss, or every request pays.
  it('never writes when the cache read fails', async () => {
    db.responses.bill_explanations = { data: null, error: { message: 'column key_points does not exist' } }
    db.responses.bills = { data: { id: '119-hr-16', title: 'T', crs_summary: null } }
    const res = await get('bill=119-hr-16', '9.9.9.6')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ status: 'unavailable', bill: '119-hr-16' })
    expect(explainBill).not.toHaveBeenCalled()
  })

  it('never writes for a bill we do not carry, or from a title alone', async () => {
    db.responses.bills = { data: null }
    expect((await get('bill=119-hr-999999', '9.9.9.2')).status).toBe(404)
    expect((await get('bill=nonsense', '9.9.9.2')).status).toBe(404)
    expect(explainBill).not.toHaveBeenCalled()

    db.reset()
    db.responses.bills = { data: { id: '119-hr-13', title: 'A bill.', crs_summary: null } }
    explainBill.mockResolvedValue({ status: 'no_source' })
    const res = await get('bill=119-hr-13', '9.9.9.3')
    expect(await res.json()).toEqual({ status: 'no_source', bill: '119-hr-13' })
    expect(db.ops('bill_explanations', 'upsert')).toEqual([])
  })

  it('limits first-time explanations per IP', async () => {
    db.responses.bills = { data: { id: '119-hr-14', title: 'T', crs_summary: null } }
    explainBill.mockResolvedValue({ status: 'no_source' })
    const statuses = []
    for (let i = 0; i < 11; i++) statuses.push((await get(`bill=119-hr-${100 + i}`, '9.9.9.4')).status)
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true)
    expect(statuses[10]).toBe(429)
  })
})

describe('explain_bill MCP tool', () => {
  beforeEach(() => { db.reset(); explainBill.mockReset() })

  it('returns the explanation and says what it was written from', async () => {
    db.responses.bills = { data: { id: '119-hr-12', title: 'Delivery Times Act', crs_summary: null, source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/12' } }
    db.responses.roll_calls = { data: [] }
    db.responses.bill_explanations = { data: row }
    const out = await explainBillTool({ id: 'H.R. 12' })
    expect(out.plain_english).toEqual({ summary: row.explanation, paragraphs: [row.paragraphs[1]], key_points: ['Monthly reports'] })
    expect(out.explained_from).toMatchObject({ kind: 'bill-text', url: row.source_url, note: expect.stringContaining('Introduced in House, Jan 2, 2026') })
    expect(explainBill).not.toHaveBeenCalled()
  })

  it('never writes one: MCP calls are not under the generation limit', async () => {
    db.responses.bills = { data: { id: '119-hr-17', title: 'T', crs_summary: null, source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/17' } }
    db.responses.roll_calls = { data: [] }
    db.responses.bill_explanations = { data: null }
    const out = await explainBillTool({ id: 'H.R. 17' })
    expect(out.plain_english).toBeNull()
    expect(out.note).toMatch(/been written for this bill yet/)
    expect(explainBill).not.toHaveBeenCalled()
  })

  it('getOrCreateExplanation can read without writing', async () => {
    expect(await getOrCreateExplanation('119-hr-12', { allowGenerate: false })).toEqual({ status: 'unavailable', reason: 'not_cached' })
    expect(explainBill).not.toHaveBeenCalled()
  })
})
