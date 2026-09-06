import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * REGRESSION: the weekly 30-day re-run stamped 283 real bill titles with
 * vote-feed stubs ("HR 4795") on 2026-09-06, and every vote-derived bill
 * carried introduced_at = <run date>. upsertBills now reads title and
 * introduced_at for each batch's ids and merges through mergeBillRow, and a
 * failed read skips the batch: without the stored titles it cannot tell a
 * stub from the truth.
 *
 * mergeBillRow has its own unit tests (billTitlePreservation.test.ts). This
 * runs the real loader against a mocked Supabase chain so the wiring is
 * covered too: which columns are SELECTed, per batch, and what the upsert
 * payload actually says once the stored row is merged in. A failed read
 * falls back to insert-only (ON CONFLICT DO NOTHING) so new ids still exist
 * for the roll calls that reference them while stored rows stay untouched.
 */

const state = vi.hoisted(() => ({
  // (ids) => { data, error } for the bills pre-read; set per test.
  readBills: () => ({ data: [], error: null }),
  selects: [],
  reads: [],
  upserts: [],
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from(table) {
      const chain = {
        select(cols) {
          state.selects.push({ table, cols })
          return chain
        },
        in(col, ids) {
          if (table !== 'bills') return Promise.resolve({ data: [], error: null })
          state.reads.push({ col, ids })
          return Promise.resolve(state.readBills(ids))
        },
        upsert(rows, opts) {
          state.upserts.push({ table, rows, opts })
          // Insert-only writes return only the rows that were actually created;
          // pretend every id already existed so nothing comes back.
          const data = opts?.ignoreDuplicates ? [] : rows
          return { select: () => Promise.resolve({ data, error: null }) }
        },
        update() { return chain },
        eq() { return chain },
        filter() { return chain },
        maybeSingle() { return Promise.resolve({ data: null, error: null }) },
        insert() { return Promise.resolve({ data: [], error: null }) },
      }
      return chain
    },
  })),
}))

vi.mock('../../etl/utils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

const config = {
  congressApiKey: 'x',
  supabaseUrl: 'https://x',
  supabaseServiceKey: 'x',
  daysBack: 7,
  maxVotesPerRun: 100,
  dryRun: false,
}

const REAL_TITLE = 'An act to provide for reconciliation pursuant to title II of H. Con. Res. 14.'
// The old transformBill wrote this into every vote-derived bill.
const today = new Date().toISOString().split('T')[0]

const stubBill = (overrides = {}) => ({
  id: '119-hr-1',
  title: 'HR 1',
  introduced_at: null,
  summary: null,
  crs_summary: null,
  policy_area: null,
  source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/1',
  ...overrides,
})

async function load(bills) {
  const { loadToSupabase } = await import('../../etl/load.js')
  return loadToSupabase(
    {
      politicians: new Map(),
      bills: new Map(bills.map((b) => [b.id, b])),
      rollCalls: new Map(),
      votes: [],
      billCommitteeRoutings: [],
      billCosponsors: [],
      unknownCommitteeCodes: [],
    },
    config
  )
}

const billUpserts = () => state.upserts.filter((u) => u.table === 'bills')
const upsertedRows = () => billUpserts().flatMap((u) => u.rows)

describe('upsertBills merges onto the stored row', () => {
  beforeEach(() => {
    state.readBills = () => ({ data: [], error: null })
    state.selects.length = 0
    state.reads.length = 0
    state.upserts.length = 0
  })

  it('reads the stored title and date, then keeps them when a vote-feed stub comes through', async () => {
    state.readBills = () => ({
      data: [{ id: '119-hr-1', title: REAL_TITLE, introduced_at: '2025-05-20', summary: null, crs_summary: 'CRS text', policy_area: 'Economics and Public Finance' }],
      error: null,
    })

    const result = await load([stubBill()])
    expect(result.errors).toEqual([])
    expect(result.billsUpserted).toBe(1)

    // The pre-read must ask for title + introduced_at, or mergeBillRow has
    // nothing to preserve. It used to select only id/summary/crs/policy_area.
    const sel = state.selects.find((s) => s.table === 'bills')
    expect(sel).toBeDefined()
    const cols = sel.cols.split(',').map((c) => c.trim())
    expect(cols).toEqual(expect.arrayContaining(['id', 'title', 'introduced_at', 'summary', 'crs_summary', 'policy_area']))
    expect(state.reads).toEqual([{ col: 'id', ids: ['119-hr-1'] }])

    const [up] = billUpserts()
    expect(up.opts).toMatchObject({ onConflict: 'id', ignoreDuplicates: false })
    const row = up.rows.find((r) => r.id === '119-hr-1')
    expect(row.title).toBe(REAL_TITLE)
    expect(row.introduced_at).toBe('2025-05-20')
    expect(row.crs_summary).toBe('CRS text')
    expect(row.policy_area).toBe('Economics and Public Finance')
  })

  it('lets a real incoming title replace a stored stub and never stamps the run date as introduced_at', async () => {
    state.readBills = () => ({
      data: [{ id: '119-hr-1', title: 'HR 1', introduced_at: null, summary: null, crs_summary: null, policy_area: null }],
      error: null,
    })

    await load([stubBill({ title: 'One Big Beautiful Bill Act' })])

    const row = upsertedRows().find((r) => r.id === '119-hr-1')
    expect(row.title).toBe('One Big Beautiful Bill Act')
    expect(row.introduced_at).toBeNull()
    expect(row.introduced_at).not.toBe(today)
  })

  it('reads per batch and fails closed: a batch whose pre-read errors is insert-only, the others still merge', async () => {
    // 250 stub bills -> batches of 100, 100, 50. Stored rows all carry real
    // titles; the middle batch's read fails.
    const bills = Array.from({ length: 250 }, (_, i) =>
      stubBill({ id: `119-hr-${i + 1}`, title: `HR ${i + 1}`, source_url: `https://www.congress.gov/bill/119th-congress/house-bill/${i + 1}` })
    )
    state.readBills = (ids) => {
      if (ids.includes('119-hr-101')) return { data: null, error: { message: 'canceling statement due to statement timeout' } }
      return { data: ids.map((id) => ({ id, title: `Real title for ${id}`, introduced_at: '2025-01-15', summary: null, crs_summary: null, policy_area: null })), error: null }
    }

    const result = await load(bills)

    // One read per batch, each scoped to that batch's ids (never the whole list).
    expect(state.reads.map((r) => r.ids.length)).toEqual([100, 100, 50])
    expect(state.reads[0].ids[0]).toBe('119-hr-1')
    expect(state.reads[2].ids[0]).toBe('119-hr-201')

    // Batches 1 and 3 were merged with the stored real titles preserved.
    const merged = billUpserts().filter((u) => !u.opts.ignoreDuplicates).flatMap((u) => u.rows)
    expect(merged).toHaveLength(150)
    expect(merged.find((r) => r.id === '119-hr-1').title).toBe('Real title for 119-hr-1')
    expect(merged.find((r) => r.id === '119-hr-250').introduced_at).toBe('2025-01-15')
    expect(merged.every((r) => !/^HR \d+$/.test(r.title))).toBe(true)

    // Batch 2 was written insert-only: ON CONFLICT DO NOTHING means no stub
    // can overwrite a title we could not read, but a genuinely new id still
    // exists for the roll calls that reference it.
    const insertOnly = billUpserts().filter((u) => u.opts.ignoreDuplicates)
    expect(insertOnly).toHaveLength(1)
    expect(insertOnly[0].opts).toMatchObject({ onConflict: 'id', ignoreDuplicates: true })
    expect(insertOnly[0].rows.map((r) => r.id)).toEqual(bills.slice(100, 200).map((b) => b.id))

    expect(result.billsUpserted).toBe(150)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/read error/i)
    expect(result.errors[0]).toMatch(/untouched/i)
    expect(result.errors[0]).toContain('statement timeout')
  })
})
