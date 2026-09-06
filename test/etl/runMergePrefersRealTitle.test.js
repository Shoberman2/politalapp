import { describe, it, expect, vi } from 'vitest'

/**
 * REGRESSION: the introduced-bills phase merged onto bills the vote feed had
 * already produced with `title: existing.title || bill.title`. The vote-derived
 * title is never empty (transformBill fills it with a stub such as "HR 1"), so
 * the real title from the bill listing lost every time and the stub went on to
 * the loader. The rule is now: a stub yields to anything real; a real title is
 * never replaced.
 *
 * Runs runETLPipeline with every I/O phase mocked. transform.ts is real, so
 * the stub in play is the one production actually produces.
 */

const state = vi.hoisted(() => ({ extracted: [], introduced: [], loaded: null }))

vi.mock('../../etl/utils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  loadConfig: () => ({
    congressApiKey: 'x',
    supabaseUrl: 'https://x',
    supabaseServiceKey: 'x',
    daysBack: 7,
    maxVotesPerRun: 100,
    dryRun: false,
  }),
}))
vi.mock('../../etl/extractHouseVotes.js', () => ({
  extractRecentVotes: async () => state.extracted,
}))
vi.mock('../../etl/extractIntroducedBills.js', () => ({
  extractIntroducedBills: async () => ({
    bills: state.introduced,
    routings: [],
    cosponsors: [],
    unknownCommitteeCodes: [],
    stats: { listed: 0, unique: 0, detailed: 0, emitted: 0, routingsEmitted: 0, cosponsorsEmitted: 0, errors: [] },
  }),
}))
vi.mock('../../etl/load.js', async (importOriginal) => ({
  ...(await importOriginal()),
  checkTablesExist: async () => true,
  getExistingCounts: async () => ({}),
  loadToSupabase: async (data) => {
    state.loaded = data
    return { politiciansUpserted: 0, billsUpserted: data.bills.size, rollCallsUpserted: 0, votesInserted: 0, errors: [] }
  },
}))
vi.mock('../../etl/fetchCRS.js', () => ({ fetchCRSSummaries: async () => ({ errors: [] }) }))
vi.mock('../../etl/enrichBillsWithAI.js', () => ({ enrichBillsWithSummaries: async () => ({ errors: [] }) }))
vi.mock('../../etl/computeStats.js', () => ({ computeMemberStats: async () => ({ membersProcessed: 0, errors: [] }) }))
vi.mock('../../etl/preWarmBillExplanations.js', () => ({ preWarmBillExplanations: async () => ({ scanned: 0, errors: [] }) }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: () => ({ upsert: async () => ({ error: null }) }) }),
}))

const rollCallOn = (bill, rollNumber) => ({
  vote: {
    congress: 119,
    chamber: 'House',
    session: 1,
    rollNumber,
    date: '2025-07-03',
    updateDate: '2025-07-03',
    question: 'On Passage',
    description: '',
    voteType: 'YEA-AND-NAY',
    result: 'Passed',
    bill: { congress: 119, ...bill },
    votes: [],
  },
  memberVotes: [],
  rawResponse: '',
})

const introduced = (id, title) => ({
  id,
  title,
  introduced_at: '2025-05-20',
  summary: null,
  crs_summary: null,
  policy_area: 'Economics and Public Finance',
  source_url: `https://www.congress.gov/${id}`,
  sponsor_bioguide_id: 'A000375',
  sponsor_name: 'Jodey Arrington',
  sponsor_party: 'R',
  sponsor_state: 'TX',
  legislative_stage: 'passed_house',
})

const options = {
  dryRun: false,
  enrichOnly: false,
  backfillExplanations: false,
  skipEnrich: true,
  skipPrewarm: true,
  days: 7,
  verbose: false,
}

describe('runETLPipeline: introduced-bills merge onto vote-derived bills', () => {
  it('a real title beats a vote-feed stub, and a real title is never replaced', async () => {
    state.extracted = [
      // No title on the vote: transformBill emits the stub "HR 1".
      rollCallOn({ type: 'HR', number: 1 }, 200),
      // The vote carried a title: it must survive the merge untouched.
      rollCallOn({ type: 'S', number: 1582, title: 'Title the vote feed carried' }, 201),
    ]
    state.introduced = [
      introduced('119-hr-1', 'One Big Beautiful Bill Act'),
      introduced('119-s-1582', 'A different title from the bill listing'),
    ]

    const { runETLPipeline } = await import('../../etl/run.js')
    const result = await runETLPipeline(options)
    expect(result.errors).toEqual([])
    expect(state.loaded).not.toBeNull()

    const hr1 = state.loaded.bills.get('119-hr-1')
    expect(hr1.title).toBe('One Big Beautiful Bill Act')
    expect(hr1.introduced_at).toBe('2025-05-20')
    expect(hr1.policy_area).toBe('Economics and Public Finance')
    // Sponsor + stage still merge onto the vote-derived record.
    expect(hr1.sponsor_name).toBe('Jodey Arrington')
    expect(hr1.legislative_stage).toBe('passed_house')

    const s1582 = state.loaded.bills.get('119-s-1582')
    expect(s1582.title).toBe('Title the vote feed carried')
    expect(s1582.introduced_at).toBe('2025-05-20')
    expect(s1582.sponsor_name).toBe('Jodey Arrington')
  })
})
