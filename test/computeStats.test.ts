import { describe, it, expect } from 'vitest'
import { getPartyMajorityPosition } from '../etl/computeStats.js'

describe('getPartyMajorityPosition', () => {
  it('returns Yea when majority votes Yea', () => {
    const votes = [
      { position: 'Yea' },
      { position: 'Yea' },
      { position: 'Nay' },
    ]
    expect(getPartyMajorityPosition(votes)).toBe('Yea')
  })

  it('returns Nay when majority votes Nay', () => {
    const votes = [
      { position: 'Nay' },
      { position: 'Nay' },
      { position: 'Yea' },
    ]
    expect(getPartyMajorityPosition(votes)).toBe('Nay')
  })

  it('returns Yea on a tie (Yea >= Nay)', () => {
    const votes = [
      { position: 'Yea' },
      { position: 'Nay' },
    ]
    expect(getPartyMajorityPosition(votes)).toBe('Yea')
  })

  it('returns null when no substantive votes (all Present)', () => {
    const votes = [
      { position: 'Present' },
      { position: 'Present' },
    ]
    expect(getPartyMajorityPosition(votes)).toBeNull()
  })

  it('returns null when no substantive votes (all Not Voting)', () => {
    const votes = [
      { position: 'Not Voting' },
      { position: 'Not Voting' },
    ]
    expect(getPartyMajorityPosition(votes)).toBeNull()
  })

  it('ignores Present and Not Voting in the count', () => {
    const votes = [
      { position: 'Yea' },
      { position: 'Nay' },
      { position: 'Nay' },
      { position: 'Present' },
      { position: 'Not Voting' },
    ]
    expect(getPartyMajorityPosition(votes)).toBe('Nay')
  })

  it('handles empty array', () => {
    expect(getPartyMajorityPosition([])).toBeNull()
  })

  it('handles single Yea vote', () => {
    expect(getPartyMajorityPosition([{ position: 'Yea' }])).toBe('Yea')
  })

  it('handles single Nay vote', () => {
    expect(getPartyMajorityPosition([{ position: 'Nay' }])).toBe('Nay')
  })
})
