import { describe, expect, it } from 'vitest'
import { getRosterComposition, isNonVotingDelegate } from '../../src/utils/congressRoster'

// Regression: ISSUE-005 — non-voting delegates were counted inside the
// 435-seat House composition, producing 437 occupied seats and hiding real
// vacancies while the roster claimed a fixed 535 members.
// Found by /qa on 2026-07-10.

describe('congressional roster composition regression', () => {
  it('retains delegates in the roster but excludes them from voting seats', () => {
    const members = [
      { chamber: 'house', state: 'CA', district: 12, party: 'D' },
      { chamber: 'house', state: 'Vermont', district: 0, party: 'I' },
      { chamber: 'house', state: 'District of Columbia', party: 'D' },
      { chamber: 'house', state: 'PR', party: 'R' },
      { chamber: 'house', state: 'U.S. Virgin Islands', party: 'D' },
      { chamber: 'senate', state: 'VT', party: 'I' },
      { chamber: 'senate', state: 'CA', party: 'D' },
    ]

    expect(getRosterComposition(members, { houseSeats: 3, senateSeats: 2 })).toEqual({
      house: { R: 0, D: 1, I: 1, occupied: 2, vacant: 1 },
      senate: { R: 0, D: 1, I: 1, occupied: 2, vacant: 0 },
      delegates: { R: 1, D: 2, I: 0, total: 3 },
      rosterTotal: 7,
    })
  })

  it('does not confuse ordinary at-large states with non-voting jurisdictions', () => {
    expect(isNonVotingDelegate({ chamber: 'house', state: 'AK', district: 0 })).toBe(false)
    expect(isNonVotingDelegate({ chamber: 'house', state: 'Delaware', district: 0 })).toBe(false)
    expect(isNonVotingDelegate({ chamber: 'house', state: 'VT', district: 0 })).toBe(false)
    expect(isNonVotingDelegate({ chamber: 'house', state: 'Wyoming', district: 0 })).toBe(false)
    expect(isNonVotingDelegate({ chamber: 'house', state: 'GU' })).toBe(true)
    expect(isNonVotingDelegate({ chamber: 'senate', state: 'DC' })).toBe(false)
  })
})
