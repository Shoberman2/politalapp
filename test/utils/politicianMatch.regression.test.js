import { describe, it, expect } from 'vitest'
import {
  politicianMatches,
  filterPoliticians,
  autocompletePoliticians,
} from '../../src/utils/politicianMatch'

/**
 * REGRESSION (CRITICAL per eng-review D10):
 * politicianMatch was extracted from the searchFilter.js used by
 * AllPoliticians. The cases below mirror the original behavior — they
 * must continue to pass against the extracted module so AllPoliticians
 * doesn't regress when the sponsor filter pill is shipped.
 */

const POLITICIANS = [
  { firstName: 'Bernard', lastName: 'Sanders', name: 'Sanders, Bernard' },
  { firstName: 'Elizabeth', lastName: 'Warren', name: 'Warren, Elizabeth' },
  { firstName: 'Mitch', lastName: 'McConnell', name: 'McConnell, Mitch' },
  { firstName: 'Alexandria', lastName: 'Ocasio-Cortez', name: 'Ocasio-Cortez, Alexandria' },
  { firstName: 'Nancy', lastName: 'Pelosi', name: 'Pelosi, Nancy' },
]

describe('politicianMatches — regression from AllPoliticians', () => {
  it('matches when each search word prefixes a name part', () => {
    expect(politicianMatches(POLITICIANS[0], 'Sand Ber')).toBe(true)
    expect(politicianMatches(POLITICIANS[1], 'Eliz War')).toBe(true)
  })
  it('is word-order independent', () => {
    expect(politicianMatches(POLITICIANS[0], 'ber sand')).toBe(true)
  })
  it('matches single-word first or last name', () => {
    expect(politicianMatches(POLITICIANS[2], 'mcconnell')).toBe(true)
    expect(politicianMatches(POLITICIANS[2], 'mitch')).toBe(true)
  })
  it('matches partial prefix', () => {
    expect(politicianMatches(POLITICIANS[2], 'mcc')).toBe(true)
  })
  it('rejects non-prefix substrings', () => {
    expect(politicianMatches(POLITICIANS[2], 'onnell')).toBe(false)
  })
  it('handles hyphenated names', () => {
    expect(politicianMatches(POLITICIANS[3], 'ocasio')).toBe(true)
  })
  it('treats commas + whitespace as word separators', () => {
    expect(politicianMatches(POLITICIANS[0], 'Sanders, Ber')).toBe(true)
  })
  it('returns true on empty / whitespace search (no filter)', () => {
    expect(politicianMatches(POLITICIANS[0], '')).toBe(true)
    expect(politicianMatches(POLITICIANS[0], '   ')).toBe(true)
    expect(politicianMatches(POLITICIANS[0], null)).toBe(true)
  })
  it('handles snake_case field names (first_name/last_name from Supabase)', () => {
    const snake = { first_name: 'Bernard', last_name: 'Sanders', name: 'Sanders, Bernard' }
    expect(politicianMatches(snake, 'sand')).toBe(true)
  })
})

describe('filterPoliticians', () => {
  it('preserves input order on match', () => {
    // Search 'el' → matches Elizabeth Warren (firstName starts with 'el')
    // and no other; this asserts the matcher AND the order preservation.
    const filtered = filterPoliticians(POLITICIANS, 'el')
    expect(filtered.map((p) => p.name)).toEqual(['Warren, Elizabeth'])
  })
  it('returns [] for non-array input', () => {
    expect(filterPoliticians(null, 'x')).toEqual([])
    expect(filterPoliticians(undefined, 'x')).toEqual([])
    expect(filterPoliticians('not an array', 'x')).toEqual([])
  })
  it('returns input unchanged on empty search', () => {
    expect(filterPoliticians(POLITICIANS, '')).toEqual(POLITICIANS)
  })
  it('supports order-independent multi-word matching across the array', () => {
    const filtered = filterPoliticians(POLITICIANS, 'ber sand')
    expect(filtered.map((p) => p.name)).toEqual(['Sanders, Bernard'])
  })
})

describe('autocompletePoliticians', () => {
  it('caps results at limit', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      firstName: 'Sam',
      lastName: `Person${i}`,
      name: `Person${i}, Sam`,
    }))
    expect(autocompletePoliticians(many, 'sam', 50)).toHaveLength(50)
    expect(autocompletePoliticians(many, 'sam', 10)).toHaveLength(10)
  })
})
