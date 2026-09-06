import { describe, it, expect, vi, beforeEach } from 'vitest'

// The loader must never guess: when it cannot read the rows it is about to
// overwrite, it inserts new ids with ON CONFLICT DO NOTHING instead of writing
// vote-feed stubs over real titles. And when it can read them, the real title
// and date survive.
const state: { inResult: { data: unknown; error: unknown }; upserts: Array<{ table: string; payload: unknown; opts?: unknown }> } = {
  inResult: { data: [], error: null },
  upserts: [],
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        in: () => Promise.resolve(state.inResult),
        upsert(payload: unknown, opts?: unknown) {
          state.upserts.push({ table, payload, opts })
          return { select: () => Promise.resolve({ data: [], error: null }) }
        },
        update: () => chain,
        eq: () => chain,
        filter: () => chain,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        insert: () => Promise.resolve({ data: [], error: null }),
      }
      return chain
    },
  }),
}))

vi.mock('../../etl/utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../etl/utils.js')>()),
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

const config = { congressApiKey: 'x', supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'x', daysBack: 7, maxVotesPerRun: 100, dryRun: false } as never
const stub = { id: '119-hr-1', title: 'HR 1', introduced_at: null, summary: null, crs_summary: null, policy_area: null, source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/1' }
const payload = (bills: object[]) => ({
  politicians: new Map(), bills: new Map(bills.map((b: any) => [b.id, b])), rollCalls: new Map(), votes: [],
  billCommitteeRoutings: [], billCosponsors: [], unknownCommitteeCodes: [],
}) as never

describe('upsertBills protects existing titles', () => {
  beforeEach(() => { state.upserts.length = 0; vi.resetModules() })

  it('never updates stored rows when the existing-row read fails: insert-only, and an error is recorded', async () => {
    state.inResult = { data: null, error: { message: 'boom' } }
    const { loadToSupabase } = await import('../../etl/load.js')
    const result = await loadToSupabase(payload([stub]), config)
    const writes = state.upserts.filter((u) => u.table === 'bills')
    expect(writes).toHaveLength(1)
    // ON CONFLICT DO NOTHING: a stub can only create a row, never replace one.
    expect(writes[0].opts).toMatchObject({ onConflict: 'id', ignoreDuplicates: true })
    expect(result.errors.some((e: string) => /existing rows left untouched/.test(e) && /boom/.test(e))).toBe(true)
  })

  it('keeps the stored real title and date when the incoming row is a stub', async () => {
    state.inResult = { data: [{ id: '119-hr-1', title: 'One Big Beautiful Bill Act', introduced_at: '2025-05-20', summary: null, crs_summary: 'CRS', policy_area: 'Economics' }], error: null }
    const { loadToSupabase } = await import('../../etl/load.js')
    await loadToSupabase(payload([stub]), config)
    const rows = state.upserts.find((u) => u.table === 'bills')!.payload as any[]
    expect(rows[0]).toMatchObject({ id: '119-hr-1', title: 'One Big Beautiful Bill Act', introduced_at: '2025-05-20', crs_summary: 'CRS', policy_area: 'Economics' })
  })
})
