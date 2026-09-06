import { describe, expect, it, vi, beforeEach } from 'vitest'

// REGRESSION: 283 voted-on bills sat with stub titles ("HR 4795") for months
// because the CRS pass picked 50 arbitrary rows a day from a 180k-row archive
// missing crs_summary, so a placeholder-titled bill was never reached. It
// also never wrote introduced_at, although it already fetched the bill
// detail that carries it. Now placeholder titles are selected first (newest
// Congress first) and the real introducedDate is written back.

type Row = { id: string; title: string | null; introduced_at: string | null; crs_summary: string | null; policy_area: string | null }

const db = vi.hoisted(() => ({
  stubs: [] as Row[],
  missing: [] as Row[],
  queries: [] as Array<{ or: string; limit: number; order: unknown }>,
  updates: [] as Array<{ id: string; patch: Record<string, string> }>,
}))

const api = vi.hoisted(() => ({
  calls: [] as string[],
  answer(endpoint: string): unknown {
    api.calls.push(endpoint)
    if (endpoint.endsWith('/summaries')) return { summaries: [] }
    if (endpoint === '/bill/119/hr/4795') {
      return { bill: { title: 'Rural Broadband Protection Act', introducedDate: '2025-07-23', policyArea: { name: 'Science, Technology, Communications' } } }
    }
    if (endpoint === '/bill/119/s/12') return { bill: { title: 'S 12', introducedDate: 'not-a-date' } }
    if (endpoint === '/bill/118/hr/1') return { bill: { title: 'Lower Energy Costs Act', introducedDate: '2023-03-14', policyArea: { name: 'Energy' } } }
    throw new Error(`Congress API error: 404 Not Found for ${endpoint}`)
  },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      if (table !== 'bills') throw new Error(`unexpected table ${table}`)
      let filter = ''
      let order: unknown = null
      const chain = {
        select: () => chain,
        or(f: string) { filter = f; return chain },
        order(col: string, opts: unknown) { order = { col, ...(opts as object) }; return chain },
        limit(n: number) {
          db.queries.push({ or: filter, limit: n, order })
          const data = /title\.ilike/.test(filter) ? db.stubs : db.missing
          return Promise.resolve({ data: data.slice(0, n), error: null })
        },
        update(patch: Record<string, string>) {
          return { eq: (_col: string, id: string) => { db.updates.push({ id, patch }); return Promise.resolve({ error: null }) } }
        },
      }
      return chain
    },
  }),
}))

vi.mock('../../etl/utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../etl/utils.js')>()),
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  sleep: async () => {},
  fetchCongressApi: async (endpoint: string) => api.answer(endpoint),
}))

const config = { congressApiKey: 'k', supabaseUrl: 'u', supabaseServiceKey: 's', daysBack: 7, maxVotesPerRun: 100, dryRun: false } as never

describe('fetchCRSSummaries heals placeholder titles first', () => {
  beforeEach(() => {
    db.stubs.length = 0; db.missing.length = 0; db.queries.length = 0; db.updates.length = 0; api.calls.length = 0
  })

  it('selects placeholder-titled bills before the archive backlog, newest Congress first', async () => {
    db.stubs = [
      { id: '119-hr-4795', title: 'HR 4795', introduced_at: null, crs_summary: null, policy_area: null },
      // The ilike net is wide; a real title that happens to start with "S " must be dropped.
      { id: '119-hr-77', title: 'S Corporation Modernization Act', introduced_at: '2025-01-01', crs_summary: null, policy_area: 'Taxation' },
    ]
    db.missing = [
      { id: '119-hr-4795', title: 'HR 4795', introduced_at: null, crs_summary: null, policy_area: null },
      { id: '118-hr-1', title: 'Lower Energy Costs Act', introduced_at: null, crs_summary: null, policy_area: null },
    ]
    const { selectBillsToEnrich } = await import('../../etl/fetchCRS')
    const { createClient } = await import('@supabase/supabase-js')
    const { bills, error } = await selectBillsToEnrich(createClient('u', 's') as never, 3)

    expect(error).toBeNull()
    expect(bills.map((b) => b.id)).toEqual(['119-hr-4795', '118-hr-1'])
    expect(db.queries[0].or).toContain('title.ilike.HR %')
    expect(db.queries[0].order).toEqual({ col: 'id', ascending: false })
    expect(db.queries[1].or).toContain('introduced_at.is.null')
  })

  it('writes the real title, introduced date, and policy area from the bill detail', async () => {
    db.stubs = [{ id: '119-hr-4795', title: 'HR 4795', introduced_at: null, crs_summary: null, policy_area: null }]
    db.missing = [{ id: '118-hr-1', title: 'Lower Energy Costs Act', introduced_at: null, crs_summary: null, policy_area: null }]
    const { fetchCRSSummaries } = await import('../../etl/fetchCRS')
    const result = await fetchCRSSummaries(config, 5)

    expect(result.errors).toEqual([])
    const stub = db.updates.find((u) => u.id === '119-hr-4795')!
    expect(stub.patch).toEqual({ title: 'Rural Broadband Protection Act', introduced_at: '2025-07-23', policy_area: 'Science, Technology, Communications' })

    // A bill with a real title only gets the date and policy area; its title is left alone.
    const dated = db.updates.find((u) => u.id === '118-hr-1')!
    expect(dated.patch).toEqual({ introduced_at: '2023-03-14', policy_area: 'Energy' })
    expect(dated.patch.title).toBeUndefined()
  })

  it('never writes a placeholder title or a malformed date back', async () => {
    db.stubs = [{ id: '119-s-12', title: 'S 12', introduced_at: null, crs_summary: 'has one', policy_area: 'Taxation' }]
    const { fetchCRSSummaries } = await import('../../etl/fetchCRS')
    await fetchCRSSummaries(config, 5)
    expect(db.updates).toEqual([])
  })
})
