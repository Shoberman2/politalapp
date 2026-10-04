import { describe, expect, it } from 'vitest'
import {
  AT_LARGE_STATES,
  NON_VOTING_DELEGATE_JURISDICTIONS,
  isAtLargeState,
  isDelegateJurisdiction,
  normalizeCensusDistrict,
} from '../../shared/atLargeStates.js'

describe('shared/atLargeStates', () => {
  it('lists exactly the six one-seat states from the 2020 apportionment (119th Congress)', () => {
    expect([...AT_LARGE_STATES].sort()).toEqual(['AK', 'DE', 'ND', 'SD', 'VT', 'WY'])
    for (const s of AT_LARGE_STATES) expect(isAtLargeState(s)).toBe(true)
    expect(isAtLargeState('wy')).toBe(true)
  })

  it('does not treat Montana as at-large (MT-01 and MT-02 since 2023)', () => {
    expect(isAtLargeState('MT')).toBe(false)
    expect(isAtLargeState('mt')).toBe(false)
  })

  it('keeps the non-voting delegate seats separate from the voting at-large states', () => {
    expect([...NON_VOTING_DELEGATE_JURISDICTIONS].sort()).toEqual(['AS', 'DC', 'GU', 'MP', 'PR', 'VI'])
    expect(isDelegateJurisdiction('DC')).toBe(true)
    expect(isAtLargeState('DC')).toBe(false)
    expect(isAtLargeState('')).toBe(false)
    expect(isAtLargeState(null)).toBe(false)
  })

  it('normalizes Census district codes, including the at-large BASENAME text', () => {
    expect(normalizeCensusDistrict('00')).toBe('0')
    expect(normalizeCensusDistrict('98')).toBe('0')
    expect(normalizeCensusDistrict('99')).toBe('0')
    expect(normalizeCensusDistrict('Congressional District (at Large)')).toBe('0')
    expect(normalizeCensusDistrict('02')).toBe('2')
    expect(normalizeCensusDistrict('12')).toBe('12')
    expect(normalizeCensusDistrict('')).toBeNull()
    expect(normalizeCensusDistrict(null)).toBeNull()
    expect(normalizeCensusDistrict('ZZ')).toBeNull()
  })
})
