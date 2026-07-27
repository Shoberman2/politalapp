import { describe, expect, it } from 'vitest'
import { transformVoteData } from '../../etl/transform'

// REGRESSION: votes were deduplicated on `politician_id-bill_id-voted_at`,
// which omits the roll call. Procedural roll calls — nominations, motions,
// en bloc confirmations — carry no bill, so every bill-less roll call a member
// voted on in a single day produced the SAME key. Only the first survived;
// every later one had all of its member votes discarded as "duplicates", and
// the discard logs at debug level so nothing surfaced.
//
// Observed in production on 2025-12-18: five bill-less Senate roll calls,
// exactly one (senate-119-1-659) held votes; 655-658 held zero.
// Found 2026-07-27 while tracing 685 roll calls that had metadata but no votes.

const senator = (bioguideId: string, name: string) => ({
  member: { bioguideId, name, party: 'D', state: 'NY' },
  votePosition: 'Yea',
})

/** A bill-less Senate roll call, the shape that collided. */
const nomination = (rollNumber: number, date = '2025-12-18') => ({
  vote: {
    congress: 119,
    chamber: 'Senate',
    session: 1,
    rollNumber,
    date,
    updateDate: date,
    question: 'On the Nomination',
    description: `Confirmation: En Bloc Nominations ${rollNumber}`,
    voteType: '',
    result: 'Confirmed',
    bill: undefined,
    votes: [],
  },
  memberVotes: [senator('S000148', 'Charles Schumer'), senator('S000033', 'Bernard Sanders')],
  rawResponse: '',
}) as never

const config = { congressApiKey: 'k', supabaseUrl: 'u', supabaseServiceKey: 's', daysBack: 7, dryRun: true } as never

describe('vote deduplication', () => {
  it('keeps votes for every bill-less roll call held on one day', () => {
    // The exact production shape: five nominations, same day, same members.
    const extracted = [655, 656, 657, 658, 659].map((n) => nomination(n))

    const { votes } = transformVoteData(extracted, config) as { votes: Array<{ roll_call_id: string }> }

    const byRollCall = new Set(votes.map((v) => v.roll_call_id))
    expect(byRollCall.size).toBe(5)
    // Two senators on each of five roll calls. The old key produced 2 total.
    expect(votes).toHaveLength(10)
    for (const n of [655, 656, 657, 658, 659]) {
      expect(byRollCall.has(`senate-119-1-${n}`)).toBe(true)
    }
  })

  it('still collapses a genuine duplicate of the same roll call', () => {
    // Same roll call twice — e.g. overlapping extraction windows. One member's
    // position on one roll call is one row, matching the database's
    // UNIQUE(roll_call_id, politician_id).
    const extracted = [nomination(655), nomination(655)]

    const { votes } = transformVoteData(extracted, config) as { votes: unknown[] }
    expect(votes).toHaveLength(2)
  })

  it('separates the same member voting on the same bill on different days', () => {
    const extracted = [nomination(700, '2026-01-14'), nomination(701, '2026-01-15')]

    const { votes } = transformVoteData(extracted, config) as { votes: Array<{ roll_call_id: string }> }
    expect(new Set(votes.map((v) => v.roll_call_id)).size).toBe(2)
  })
})
