import { beforeEach, describe, expect, it, vi } from 'vitest'

const upsertCalls: Array<{ table: string; payload: unknown; options: unknown }> = []

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from(table: string) {
      const chain = {
        select() {
          return chain
        },
        upsert(payload: unknown, options: unknown) {
          upsertCalls.push({ table, payload, options })
          return {
            select: () => Promise.resolve({ data: [], error: null }),
          }
        },
        in() {
          return Promise.resolve({ data: [], error: null })
        },
        update() {
          return chain
        },
        eq() {
          return chain
        },
        filter() {
          return chain
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null })
        },
        insert() {
          return Promise.resolve({ data: [], error: null })
        },
      }
      return chain
    },
  })),
}))

const config = {
  congressApiKey: 'x',
  supabaseUrl: 'https://x',
  supabaseServiceKey: 'x',
  daysBack: 7,
  maxVotesPerRun: 100,
  dryRun: false,
}

beforeEach(() => {
  upsertCalls.length = 0
  vi.resetModules()
})

describe('ETL vote loading', () => {
  it('deduplicates votes by roll call and politician', async () => {
    const { loadToSupabase } = await import('../../etl/load.js')

    await loadToSupabase({
      politicians: new Map(),
      bills: new Map(),
      rollCalls: new Map(),
      votes: [
        {
          politician_id: 'A000001',
          bill_id: '119-hr-1',
          roll_call_id: 'house-119-1-247',
          position: 'Yea',
          voted_at: '2026-06-28',
          source_url: 'https://example.test/vote',
        },
      ],
      billCommitteeRoutings: [],
      billCosponsors: [],
      unknownCommitteeCodes: [],
    }, config)

    const voteCall = upsertCalls.find((c) => c.table === 'votes')

    expect(voteCall).toBeTruthy()
    expect(voteCall?.options).toEqual({
      onConflict: 'roll_call_id,politician_id',
      ignoreDuplicates: true,
    })
  })
})

describe('ETL successful-run metadata gate', () => {
  it('marks a successful run only after load and stats pass', async () => {
    const { shouldMarkSuccessfulRun } = await import('../../etl/run.js')

    expect(
      shouldMarkSuccessfulRun(
        { politiciansUpserted: 0, billsUpserted: 0, rollCallsUpserted: 0, votesInserted: 0, errors: [] },
        { membersProcessed: 0, errors: [] },
        config
      )
    ).toBe(true)
  })

  it('does not mark a run successful after load errors', async () => {
    const { shouldMarkSuccessfulRun } = await import('../../etl/run.js')

    expect(
      shouldMarkSuccessfulRun(
        {
          politiciansUpserted: 0,
          billsUpserted: 0,
          rollCallsUpserted: 0,
          votesInserted: 0,
          errors: ['Votes upsert error: duplicate key value violates unique constraint'],
        },
        { membersProcessed: 0, errors: [] },
        config
      )
    ).toBe(false)
  })

  it('does not mark a run successful after stats errors or during dry runs', async () => {
    const { shouldMarkSuccessfulRun } = await import('../../etl/run.js')
    const passingLoad = {
      politiciansUpserted: 0,
      billsUpserted: 0,
      rollCallsUpserted: 0,
      votesInserted: 0,
      errors: [],
    }

    expect(
      shouldMarkSuccessfulRun(
        passingLoad,
        { membersProcessed: 0, errors: ['member_stats upsert error: permission denied'] },
        config
      )
    ).toBe(false)

    expect(
      shouldMarkSuccessfulRun(
        passingLoad,
        { membersProcessed: 0, errors: [] },
        { ...config, dryRun: true }
      )
    ).toBe(false)
  })
})
