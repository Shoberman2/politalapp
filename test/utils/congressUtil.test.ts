import { describe, it, expect } from 'vitest'
import {
  BILL_ARCHIVE_START_DATE,
  BILL_CONGRESS_MIN,
  CONGRESS_MIN,
  CONGRESS_MAX,
  getCurrentCongress,
  getCurrentCongressForDate,
  parseCongressParam,
  getCongressStartYear,
  getCongressEndYear,
  formatCongressLabel,
  InvalidCongressError,
} from '../../src/utils/congressUtil'

describe('bill archive bounds', () => {
  it('starts public bill/history browsing at the 107th Congress in 2001', () => {
    expect(BILL_CONGRESS_MIN).toBe(107)
    expect(BILL_ARCHIVE_START_DATE).toBe('2001-01-03')
  })
})

describe('getCurrentCongressForDate', () => {
  it('returns 119 for any date during the 119th Congress (Jan 2025 to Jan 2027)', () => {
    expect(getCurrentCongressForDate(new Date('2025-01-03'))).toBe(119)
    expect(getCurrentCongressForDate(new Date('2025-06-15'))).toBe(119)
    expect(getCurrentCongressForDate(new Date('2026-05-21'))).toBe(119)
    expect(getCurrentCongressForDate(new Date('2026-12-31'))).toBe(119)
  })

  it('returns 118 for any date during the 118th Congress (Jan 2023 to Jan 2025)', () => {
    expect(getCurrentCongressForDate(new Date('2023-01-03'))).toBe(118)
    expect(getCurrentCongressForDate(new Date('2024-07-04'))).toBe(118)
  })

  it('returns 107 for early 2001 (post-9/11 era)', () => {
    expect(getCurrentCongressForDate(new Date('2001-02-15'))).toBe(107)
    expect(getCurrentCongressForDate(new Date('2001-09-11'))).toBe(107)
  })

  it('returns 93 for the start of the historical archive (1973)', () => {
    expect(getCurrentCongressForDate(new Date('1973-04-01'))).toBe(93)
  })

  it('handles the January 3 boundary correctly', () => {
    // Jan 1-2, 2025: still in the 118th Congress (which ends Jan 3, 2025)
    expect(getCurrentCongressForDate(new Date('2025-01-02'))).toBe(118)
    // Jan 3, 2025: now in the 119th Congress
    expect(getCurrentCongressForDate(new Date('2025-01-03'))).toBe(119)
  })
})

describe('getCurrentCongress', () => {
  it('uses today by default and returns a valid Congress in range', () => {
    const c = getCurrentCongress()
    expect(c).toBeGreaterThanOrEqual(CONGRESS_MIN)
    expect(c).toBeLessThanOrEqual(CONGRESS_MAX)
  })

  it('accepts an explicit now parameter for testability', () => {
    expect(getCurrentCongress(new Date('2026-05-21'))).toBe(119)
    expect(getCurrentCongress(new Date('2010-09-15'))).toBe(111)
  })
})

describe('parseCongressParam', () => {
  it('accepts integer Congress values in range', () => {
    expect(parseCongressParam(119)).toBe(119)
    expect(parseCongressParam(93)).toBe(93)
    expect(parseCongressParam(107)).toBe(107)
  })

  it('accepts numeric strings in range', () => {
    expect(parseCongressParam('119')).toBe(119)
    expect(parseCongressParam('93')).toBe(93)
  })

  it('throws InvalidCongressError on out-of-range integers', () => {
    expect(() => parseCongressParam(200)).toThrow(InvalidCongressError)
    expect(() => parseCongressParam(0)).toThrow(InvalidCongressError)
    expect(() => parseCongressParam(92)).toThrow(InvalidCongressError)
    expect(() => parseCongressParam(120)).toThrow(InvalidCongressError)
  })

  it('throws InvalidCongressError on null / undefined / empty string', () => {
    expect(() => parseCongressParam(null)).toThrow(InvalidCongressError)
    expect(() => parseCongressParam(undefined)).toThrow(InvalidCongressError)
    expect(() => parseCongressParam('')).toThrow(InvalidCongressError)
  })

  it('throws InvalidCongressError on non-numeric strings', () => {
    expect(() => parseCongressParam('abc')).toThrow(InvalidCongressError)
    expect(() => parseCongressParam('119abc')).toThrow(InvalidCongressError)
    expect(() => parseCongressParam('119.0')).toThrow(InvalidCongressError)
  })

  it('throws InvalidCongressError on non-integer numbers', () => {
    expect(() => parseCongressParam(119.5)).toThrow(InvalidCongressError)
  })

  it('attaches the original param on the error', () => {
    try {
      parseCongressParam(200)
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidCongressError)
      expect((e as InvalidCongressError).param).toBe(200)
    }
  })
})

describe('getCongressStartYear / getCongressEndYear', () => {
  it('returns 2025/2027 for the 119th Congress', () => {
    expect(getCongressStartYear(119)).toBe(2025)
    expect(getCongressEndYear(119)).toBe(2027)
  })

  it('returns 2001/2003 for the 107th Congress', () => {
    expect(getCongressStartYear(107)).toBe(2001)
    expect(getCongressEndYear(107)).toBe(2003)
  })

  it('returns 1973/1975 for the 93rd Congress (start of archive)', () => {
    expect(getCongressStartYear(93)).toBe(1973)
    expect(getCongressEndYear(93)).toBe(1975)
  })
})

describe('formatCongressLabel', () => {
  it('formats with ordinal + year range', () => {
    expect(formatCongressLabel(119)).toBe('119th Congress (2025-2027)')
    expect(formatCongressLabel(107)).toBe('107th Congress (2001-2003)')
    expect(formatCongressLabel(93)).toBe('93rd Congress (1973-1975)')
    expect(formatCongressLabel(101)).toBe('101st Congress (1989-1991)')
    expect(formatCongressLabel(102)).toBe('102nd Congress (1991-1993)')
    expect(formatCongressLabel(103)).toBe('103rd Congress (1993-1995)')
    expect(formatCongressLabel(111)).toBe('111th Congress (2009-2011)')
    expect(formatCongressLabel(112)).toBe('112th Congress (2011-2013)')
    expect(formatCongressLabel(113)).toBe('113th Congress (2013-2015)')
  })
})
