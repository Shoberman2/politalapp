import { describe, expect, it, vi } from 'vitest'

// REGRESSION: when neither the bill detail nor the list item carried a date,
// extractIntroducedBills stamped today as introduced_at. Every run then
// re-stamped a fresh fake date over whatever an earlier run had stored, and a
// bill that was never dated looked newly introduced each time it was touched.
// "No date" now means null; the loader (mergeBillRow) keeps any stored date.
// The same goes for the list endpoint's latestAction.actionDate and
// updateDate: those used to stand in for introduced_at on every bill outside
// the detail budget, which is how a repaired introduction date got overwritten
// by the next run.

const congressApi = vi.hoisted(() => ({
  calls: [] as string[],
  answer(endpoint: string): unknown {
    if (/^\/bill\/119\/hr$/i.test(endpoint)) {
      return {
        bills: [
          // Bare list item: no title, no latestAction, no updateDate.
          { congress: 119, type: 'HR', number: 9 },
          // Fully described item, so the real values still pass through.
          { congress: 119, type: 'HR', number: 10, title: 'Dated Act', updateDate: '2025-06-02T10:00:00Z' },
          // Detail answers without introducedDate; the list's action date must not stand in.
          { congress: 119, type: 'HR', number: 11, title: 'Action Act', latestAction: { actionDate: '2025-07-01', text: 'Referred' }, updateDate: '2025-07-02T00:00:00Z' },
          // Beyond the detail budget: list-only, with action and update dates.
          { congress: 119, type: 'HR', number: 12, title: 'List Only Act', latestAction: { actionDate: '2025-07-03', text: 'Referred' }, updateDate: '2025-07-04T00:00:00Z' },
        ],
      }
    }
    if (/^\/bill\/119\/hr\/9$/.test(endpoint)) return { bill: {} }
    if (/^\/bill\/119\/hr\/10$/.test(endpoint)) {
      return { bill: { title: 'Dated Act', introducedDate: '2025-06-01', policyArea: { name: 'Taxation' } } }
    }
    if (/^\/bill\/119\/hr\/11$/.test(endpoint)) return { bill: { title: 'Action Act' } }
    throw new Error(`unexpected endpoint ${endpoint}`)
  },
}))

vi.mock('../../etl/utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../etl/utils.js')>()),
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  fetchCongressApi: async (endpoint: string) => {
    congressApi.calls.push(endpoint)
    return congressApi.answer(endpoint)
  },
}))

const config = { congressApiKey: 'k', supabaseUrl: 'u', supabaseServiceKey: 's', daysBack: 7, maxVotesPerRun: 100, dryRun: true }
const today = new Date().toISOString().slice(0, 10)

describe('extractIntroducedBills without a date from Congress.gov', () => {
  it('emits null, never today, and still passes a real date through', async () => {
    const { extractIntroducedBills } = await import('../../etl/extractIntroducedBills')
    const result = await extractIntroducedBills(config, {
      congress: 119,
      billTypes: ['hr'] as never,
      daysBack: null,
      maxListPagesPerType: 1,
      maxDetailCalls: 3,
      includeCommittees: false,
      includeCosponsors: false,
    })

    expect(result.stats.errors).toEqual([])
    expect(congressApi.calls).toEqual(['/bill/119/hr', '/bill/119/hr/9', '/bill/119/hr/10', '/bill/119/hr/11'])

    const undated = result.bills.find((b) => b.id === '119-hr-9')
    expect(undated).toBeDefined()
    expect(undated!.introduced_at).toBeNull()
    expect(undated!.introduced_at).not.toBe(today)
    // Still a stub title the loader will refuse to write over a real one.
    expect(undated!.title).toBe('HR 9')

    const dated = result.bills.find((b) => b.id === '119-hr-10')
    expect(dated!.title).toBe('Dated Act')
    expect(dated!.introduced_at).toBe('2025-06-01')
    expect(dated!.policy_area).toBe('Taxation')

    // A detail without introducedDate: the list's action date is not the answer.
    const actionOnly = result.bills.find((b) => b.id === '119-hr-11')
    expect(actionOnly!.title).toBe('Action Act')
    expect(actionOnly!.introduced_at).toBeNull()

    // Past the detail budget: same rule, and the list title still comes through.
    const listOnly = result.bills.find((b) => b.id === '119-hr-12')
    expect(listOnly!.title).toBe('List Only Act')
    expect(listOnly!.introduced_at).toBeNull()
  })
})
