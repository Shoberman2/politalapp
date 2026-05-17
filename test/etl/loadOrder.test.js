import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * REGRESSION (CRITICAL per outside-voice D19):
 * load.ts MUST upsert bills BEFORE bill_committee_routings and
 * bill_cosponsors. Both child tables have FK to bills(id) ON DELETE CASCADE;
 * if the order is reversed, the upserts hit 23503 FK violations.
 *
 * This test asserts the order by mocking the Supabase client and verifying
 * which table was hit first.
 */

const callOrder = []

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from(table) {
      const chain = {
        _table: table,
        select() { return chain },
        upsert() {
          callOrder.push({ op: 'upsert', table })
          return {
            select: () => Promise.resolve({ data: [], error: null }),
          }
        },
        in() { return Promise.resolve({ data: [], error: null }) },
        update() { return chain },
        eq() { return chain },
        filter() { return chain },
        maybeSingle() { return Promise.resolve({ data: null, error: null }) },
        insert() {
          callOrder.push({ op: 'insert', table })
          return Promise.resolve({ data: [], error: null })
        },
      }
      return chain
    },
  })),
}))

vi.mock('../../etl/utils.js', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  chunk: (arr, size) => {
    const out = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
  },
}))

describe('loadToSupabase — strict FK order', () => {
  beforeEach(() => {
    callOrder.length = 0
  })

  it('upserts bills BEFORE bill_committee_routings and bill_cosponsors', async () => {
    const { loadToSupabase } = await import('../../etl/load.js')

    const transformed = {
      politicians: new Map(),
      bills: new Map([
        [
          '119-hr-1',
          {
            id: '119-hr-1',
            title: 'Test Bill',
            introduced_at: '2026-01-01',
            summary: null,
            crs_summary: null,
            policy_area: null,
            source_url: 'https://x',
            sponsor_bioguide_id: 'X000001',
            sponsor_name: 'Sample Member',
            sponsor_party: 'D',
            sponsor_state: 'CA',
            legislative_stage: 'referred',
          },
        ],
      ]),
      rollCalls: new Map(),
      votes: [],
      billCommitteeRoutings: [
        {
          bill_id: '119-hr-1',
          committee_code: 'HSAG',
          committee_name: 'House Committee on Agriculture',
          subcommittee_code: null,
          subcommittee_name: null,
          chamber: 'House',
          referred_at: '2026-01-02',
          activity_type: 'referred_to',
        },
      ],
      billCosponsors: [
        {
          bill_id: '119-hr-1',
          bioguide_id: 'Y000002',
          cosponsored_at: '2026-01-03',
          withdrawn_at: null,
        },
      ],
      unknownCommitteeCodes: [],
    }

    const config = {
      congressApiKey: 'x',
      supabaseUrl: 'https://x',
      supabaseServiceKey: 'x',
      daysBack: 7,
      maxVotesPerRun: 100,
      dryRun: false,
    }

    await loadToSupabase(transformed, config)

    // Find first occurrence of each table.
    const firstBills = callOrder.findIndex((c) => c.table === 'bills' && c.op === 'upsert')
    const firstRoutings = callOrder.findIndex((c) => c.table === 'bill_committee_routings' && c.op === 'upsert')
    const firstCosponsors = callOrder.findIndex((c) => c.table === 'bill_cosponsors' && c.op === 'upsert')

    expect(firstBills).toBeGreaterThanOrEqual(0)
    expect(firstRoutings).toBeGreaterThanOrEqual(0)
    expect(firstCosponsors).toBeGreaterThanOrEqual(0)

    // Bills MUST come before either child.
    expect(firstBills, 'bills must be upserted before bill_committee_routings').toBeLessThan(firstRoutings)
    expect(firstBills, 'bills must be upserted before bill_cosponsors').toBeLessThan(firstCosponsors)
  })
})
