import { describe, it, expect } from 'vitest'
import { filterMembersByName } from '../src/utils/searchFilter'

const members = [
  { name: 'Sanders, Bernard', firstName: 'Bernard', lastName: 'Sanders', bioguideId: 'S000033' },
  { name: 'Pelosi, Nancy', firstName: 'Nancy', lastName: 'Pelosi', bioguideId: 'P000197' },
  { name: 'Cruz, Rafael', firstName: 'Rafael', lastName: 'Cruz', bioguideId: 'C001098' },
  { name: 'Ocasio-Cortez, Alexandria', firstName: 'Alexandria', lastName: 'Ocasio-Cortez', bioguideId: 'O000172' },
]

describe('filterMembersByName', () => {
  it('returns all members when search is empty', () => {
    expect(filterMembersByName(members, '')).toEqual(members)
    expect(filterMembersByName(members, '   ')).toEqual(members)
    expect(filterMembersByName(members, null as any)).toEqual(members)
    expect(filterMembersByName(members, undefined as any)).toEqual(members)
  })

  it('matches by last name', () => {
    const result = filterMembersByName(members, 'Sanders')
    expect(result).toHaveLength(1)
    expect(result[0].bioguideId).toBe('S000033')
  })

  it('matches by first name', () => {
    const result = filterMembersByName(members, 'Bernard')
    expect(result).toHaveLength(1)
    expect(result[0].bioguideId).toBe('S000033')
  })

  it('matches by prefix', () => {
    const result = filterMembersByName(members, 'San')
    expect(result).toHaveLength(1)
    expect(result[0].bioguideId).toBe('S000033')
  })

  it('is case insensitive', () => {
    const result = filterMembersByName(members, 'sAnDeRs')
    expect(result).toHaveLength(1)
    expect(result[0].bioguideId).toBe('S000033')
  })

  it('matches multi-word query in first-last order', () => {
    const result = filterMembersByName(members, 'Bernard Sanders')
    expect(result).toHaveLength(1)
    expect(result[0].bioguideId).toBe('S000033')
  })

  it('matches multi-word query in last-first order', () => {
    const result = filterMembersByName(members, 'Sanders Bernard')
    expect(result).toHaveLength(1)
    expect(result[0].bioguideId).toBe('S000033')
  })

  it('matches partial multi-word query', () => {
    const result = filterMembersByName(members, 'San Ber')
    expect(result).toHaveLength(1)
    expect(result[0].bioguideId).toBe('S000033')
  })

  it('matches partial multi-word query in reverse order', () => {
    const result = filterMembersByName(members, 'Ber San')
    expect(result).toHaveLength(1)
    expect(result[0].bioguideId).toBe('S000033')
  })

  it('handles comma in search query', () => {
    const result = filterMembersByName(members, 'Sanders, Bernard')
    expect(result).toHaveLength(1)
    expect(result[0].bioguideId).toBe('S000033')
  })

  it('handles extra whitespace', () => {
    const result = filterMembersByName(members, '  Sanders   Bernard  ')
    expect(result).toHaveLength(1)
    expect(result[0].bioguideId).toBe('S000033')
  })

  it('returns empty array when no matches', () => {
    expect(filterMembersByName(members, 'xyzabc')).toHaveLength(0)
  })

  it('handles hyphenated last names', () => {
    const result = filterMembersByName(members, 'Ocasio')
    expect(result).toHaveLength(1)
    expect(result[0].bioguideId).toBe('O000172')
  })

  it('handles member with missing firstName/lastName fields', () => {
    const sparse = [{ name: 'Smith, John', bioguideId: 'test1' }]
    const result = filterMembersByName(sparse, 'John')
    expect(result).toHaveLength(1)
  })

  it('handles member with no name field, using firstName/lastName fallback', () => {
    const sparse = [{ firstName: 'John', lastName: 'Smith', bioguideId: 'test2' }]
    const result = filterMembersByName(sparse, 'Smith')
    expect(result).toHaveLength(1)
  })

  it('requires ALL search words to match (AND logic)', () => {
    // "Nancy Sanders" should match nobody — no member has both names
    expect(filterMembersByName(members, 'Nancy Sanders')).toHaveLength(0)
  })
})
