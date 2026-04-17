import { describe, it, expect } from 'vitest'
import { CAUCUS_OVERRIDES, effectiveParty } from '../../src/data/caucusOverrides.js'

describe('CAUCUS_OVERRIDES', () => {
  it('covers Sanders (S000033)', () => {
    expect(CAUCUS_OVERRIDES.S000033).toBe('D')
  })

  it('covers King (K000383)', () => {
    expect(CAUCUS_OVERRIDES.K000383).toBe('D')
  })

  it('all values are D or R', () => {
    for (const party of Object.values(CAUCUS_OVERRIDES)) {
      expect(['D', 'R']).toContain(party)
    }
  })
})

describe('effectiveParty', () => {
  it('returns caucus party for Sanders', () => {
    expect(effectiveParty('S000033', 'I')).toBe('D')
  })

  it('returns raw party for non-independents', () => {
    expect(effectiveParty('A000001', 'D')).toBe('D')
    expect(effectiveParty('B000001', 'R')).toBe('R')
  })

  it('returns raw party for uncovered independents', () => {
    // When a new independent appears without an override, this surfaces it
    // transparently. The regression in the real world: a member_stats query
    // against Supabase with party='I' who is NOT in CAUCUS_OVERRIDES.
    // This unit test enforces the invariant that known independents are covered.
    expect(effectiveParty('X999999', 'I')).toBe('I')
  })
})
