import { describe, it, expect } from 'vitest'
import { isPlaceholderTitle, extractActName, explanationMatchesBill, memberGate, rollCallGate, billGate } from '../../api/_lib/indexGate.js'

describe('indexGate', () => {
  it('treats bill-number stubs and empty titles as placeholders', () => {
    for (const t of ['HR 915', 'H.R. 915', 'S. 12', 'S12', 'H.J.Res. 4', 'HConRes 7', '', null, '   ']) {
      expect(isPlaceholderTitle(t), t).toBe(true)
    }
    expect(isPlaceholderTitle('Water Resources Development Act of 2026')).toBe(false)
    expect(isPlaceholderTitle('An act to provide for reconciliation pursuant to title II of H. Con. Res. 14.')).toBe(false)
  })

  it('extracts a named act and ignores "This Act"', () => {
    expect(extractActName('The For the People Act of 2025 is a piece of legislation aimed at')).toBe('For the People Act of 2025')
    expect(extractActName('This Act amends title 5 to require')).toBeNull()
    expect(extractActName('Provides funding for water projects.')).toBeNull()
  })

  it('discards an explanation cached under a different title (the H.R. 1 bug)', () => {
    const bill = { title: 'An act to provide for reconciliation pursuant to title II of H. Con. Res. 14.', crs_summary: null, summary: null }
    expect(explanationMatchesBill({ explanationTitle: 'For the People Act of 2025', oneLiner: 'The For the People Act of 2025 is a piece of legislation' }, bill)).toBe(false)
    expect(explanationMatchesBill({ explanationTitle: bill.title, oneLiner: 'This Act provides for reconciliation.' }, bill)).toBe(true)
  })

  it('accepts an explanation whose named act appears in the official text', () => {
    const bill = { title: 'Water Resources Development Act of 2026', crs_summary: 'Authorizes projects.' }
    expect(explanationMatchesBill({ explanationTitle: null, oneLiner: 'The Water Resources Development Act of 2026 authorizes projects.' }, bill)).toBe(true)
    expect(explanationMatchesBill({ explanationTitle: null, oneLiner: 'The Clean Rivers Act of 2026 authorizes projects.' }, bill)).toBe(false)
  })

  it('gates members, roll calls, and bills', () => {
    expect(memberGate({ voteCount: 0 })).toEqual({ indexable: false, reason: 'no_votes' })
    expect(memberGate({ voteCount: 12 }).indexable).toBe(true)

    expect(rollCallGate({ yea: 0, nay: 0, countedYeaNay: null, sane: false }).reason).toBe('no_tally')
    expect(rollCallGate({ yea: 500, nay: 10, countedYeaNay: null, sane: false }).reason).toBe('tally_out_of_range')
    expect(rollCallGate({ yea: 220, nay: 210, countedYeaNay: 400, sane: true }).reason).toBe('tally_mismatch')
    expect(rollCallGate({ yea: 220, nay: 210, countedYeaNay: 430, sane: true }).indexable).toBe(true)
    expect(rollCallGate({ yea: 51, nay: 49, countedYeaNay: null, sane: true }).indexable).toBe(true)

    expect(billGate({ title: 'HR 915', hasVote: true, hasSummary: true }).reason).toBe('placeholder_title')
    expect(billGate({ title: 'A real title', hasVote: false, hasSummary: false }).reason).toBe('no_vote_or_summary')
    expect(billGate({ title: 'A real title', hasVote: true, hasSummary: false }).indexable).toBe(true)
  })
})
