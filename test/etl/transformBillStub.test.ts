import { describe, expect, it } from 'vitest'
import { transformVoteData } from '../../etl/transform'
import { isPlaceholderTitle } from '../../etl/utils'

// REGRESSION: transformBill filled introduced_at with today's date ("will be
// enriched later"). It never was: every bill first seen through a roll call
// reported the ETL run date as its introduction date, and the weekly re-run
// rewrote real dates with fresh fake ones. The vote feed also rarely carries
// the title, so the stub ("HR 4795") is expected here; the loader
// (mergeBillRow) is what keeps it from overwriting a real one.

const rollCallOn = (bill: { type: string; number: number; title?: string }) =>
  ({
    vote: {
      congress: 119,
      chamber: 'House',
      session: 1,
      rollNumber: 200,
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
  }) as never

const config = { congressApiKey: 'k', supabaseUrl: 'u', supabaseServiceKey: 's', daysBack: 7, dryRun: true } as never
const today = new Date().toISOString().split('T')[0]

describe('transformBill from a roll call', () => {
  it('emits a recognisable stub and no introduced date, whether or not the vote carried a title', () => {
    const { bills, rollCalls } = transformVoteData(
      [rollCallOn({ type: 'HR', number: 4795 }), rollCallOn({ type: 'S', number: 1582, title: 'Some Act of 2025' })],
      config
    )

    const untitled = bills.get('119-hr-4795')
    expect(untitled).toBeDefined()
    expect(untitled!.title).toBe('HR 4795')
    expect(isPlaceholderTitle(untitled!.title)).toBe(true)
    expect(untitled!.introduced_at).toBeNull()
    expect(untitled!.introduced_at).not.toBe(today)

    const titled = bills.get('119-s-1582')
    expect(titled!.title).toBe('Some Act of 2025')
    expect(isPlaceholderTitle(titled!.title)).toBe(false)
    expect(titled!.introduced_at).toBeNull()

    // The stub is still a valid bill: its roll call links to it. (Both
    // fixtures share roll number 200; the second is a dedupe no-op.)
    expect(rollCalls.get('house-119-1-200')!.bill_id).toBe('119-hr-4795')
  })
})
