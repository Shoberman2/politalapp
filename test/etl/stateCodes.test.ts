import { describe, expect, it } from 'vitest';
import { normalizeStateCode } from '../../etl/stateCodes.js';
import { congressSessionYear } from '../../etl/extractHouseVotes.js';

describe('normalizeStateCode', () => {
  it.each([
    ['California', 'CA'],
    [' new york ', 'NY'],
    ['dc', 'DC'],
    ['Northern Mariana Islands', 'MP'],
    ['U.S. Virgin Islands', 'VI'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeStateCode(input)).toBe(expected);
  });

  it('rejects unknown and missing values', () => {
    expect(normalizeStateCode('Atlantis')).toBeNull();
    expect(normalizeStateCode(null)).toBeNull();
  });
});

describe('congressSessionYear', () => {
  it.each([
    [118, 1, 2023],
    [118, 2, 2024],
    [119, 1, 2025],
    [119, 2, 2026],
  ] as const)('maps Congress %i session %i to %i', (congress, session, year) => {
    expect(congressSessionYear(congress, session)).toBe(year);
  });

  it('rejects invalid Congress numbers', () => {
    expect(() => congressSessionYear(0, 1)).toThrow(/positive integer/);
    expect(() => congressSessionYear(119, 3 as 1 | 2)).toThrow(/session must be 1 or 2/);
  });
});
