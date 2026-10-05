import { describe, it, expect, vi, afterEach } from 'vitest'
import { getVoteSourceUrl } from '../../etl/utils'
import { officialRollCallUrl as exporterUrl } from '../../etl/exportOpenData'
// @ts-ignore -- untyped JS module
import { officialRollCallUrl, sessionYear, voteSourceUrl } from '../../api/_lib/rollCallResult.js'

describe('sessionYear', () => {
  it('maps congress + session to the calendar year', () => {
    expect(sessionYear(119, 1)).toBe(2025)
    expect(sessionYear(119, 2)).toBe(2026)
    expect(sessionYear(118, 1)).toBe(2023)
    expect(sessionYear(117, 2)).toBe(2022)
    expect(sessionYear(101, 2)).toBe(1990)
    expect(sessionYear(1, 1)).toBe(1789)
  })
  it('rejects sessions other than 1 or 2 and bad congresses', () => {
    expect(sessionYear(119, 3)).toBeNull()
    expect(sessionYear(0, 1)).toBeNull()
    expect(sessionYear('x', 1)).toBeNull()
  })
})

describe('getVoteSourceUrl (ETL)', () => {
  afterEach(() => { vi.useRealTimers() })

  it('a 2025 session-1 House vote gets the 2025 Clerk URL even when loaded in 2026', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-05T12:00:00Z'))
    expect(getVoteSourceUrl('house', 119, 1, 123)).toBe('https://clerk.house.gov/Votes/2025123')
  })

  it('a 2026 session-2 House vote gets the 2026 Clerk URL even when loaded in 2027', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-01-15T12:00:00Z'))
    expect(getVoteSourceUrl('house', 119, 2, 295)).toBe('https://clerk.house.gov/Votes/2026295')
  })

  it('historical congresses', () => {
    expect(getVoteSourceUrl('house', 118, 1, 4)).toBe('https://clerk.house.gov/Votes/20234')
    expect(getVoteSourceUrl('house', 117, 2, 450)).toBe('https://clerk.house.gov/Votes/2022450')
    expect(getVoteSourceUrl('house', 110, 1, 1)).toBe('https://clerk.house.gov/Votes/20071')
    expect(getVoteSourceUrl('house', 101, 2, 10)).toBe('https://clerk.house.gov/Votes/199010')
  })

  it('Senate URLs carry congress, session and a 5-digit roll', () => {
    expect(getVoteSourceUrl('senate', 119, 1, 7)).toBe('https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00007.htm')
    expect(getVoteSourceUrl('senate', 119, 2, 12)).toBe('https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00012.htm')
    expect(getVoteSourceUrl('senate', 113, 1, 659)).toBe('https://www.senate.gov/legislative/LIS/roll_call_votes/vote1131/vote_113_1_00659.htm')
  })

  it('returns null for an invalid roll-call identity instead of a bogus URL', () => {
    expect(getVoteSourceUrl('house', 119, 1, 0)).toBeNull()
    expect(getVoteSourceUrl('house', 119, 3, 5)).toBeNull()
    expect(getVoteSourceUrl('senate', 119, 1, NaN)).toBeNull()
  })
})

describe('one builder for ETL, exporter and API', () => {
  const ids = ['house-119-1-123', 'house-119-2-295', 'house-118-1-4', 'senate-119-2-12', 'senate-117-1-1']
  it('agree on every id', () => {
    for (const id of ids) {
      const [chamber, c, s, r] = id.split('-')
      expect(exporterUrl(id)).toBe(officialRollCallUrl(id))
      expect(getVoteSourceUrl(chamber as 'house' | 'senate', +c, +s, +r)).toBe(officialRollCallUrl(id))
    }
  })
  it('accepts parts as well as ids, case-insensitively', () => {
    expect(officialRollCallUrl({ chamber: 'House', congress: 119, session: 1, roll: 123 })).toBe('https://clerk.house.gov/Votes/2025123')
    expect(officialRollCallUrl('HOUSE-119-1-123')).toBe('https://clerk.house.gov/Votes/2025123')
    expect(officialRollCallUrl('nope')).toBeNull()
    expect(officialRollCallUrl(null)).toBeNull()
  })
  it('voteSourceUrl prefers the derived URL over a stored wrong-year one', () => {
    expect(voteSourceUrl('house-119-1-123', 'https://clerk.house.gov/Votes/2026123')).toBe('https://clerk.house.gov/Votes/2025123')
    expect(voteSourceUrl(null, 'https://example.gov/x')).toBe('https://example.gov/x')
    expect(voteSourceUrl('bad', null)).toBeNull()
  })
})
