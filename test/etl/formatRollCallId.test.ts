import { describe, it, expect } from 'vitest';
import { formatRollCallId, generateVoteKey } from '../../etl/utils.js';

describe('formatRollCallId', () => {
  it('produces the canonical format for House votes', () => {
    expect(formatRollCallId('house', 119, 1, 247)).toBe('house-119-1-247');
  });

  it('produces the canonical format for Senate votes', () => {
    expect(formatRollCallId('senate', 119, 2, 18)).toBe('senate-119-2-18');
  });

  it('lowercases the chamber to enforce one canonical form', () => {
    expect(formatRollCallId('HOUSE', 119, 1, 247)).toBe('house-119-1-247');
    expect(formatRollCallId('Senate', 119, 1, 1)).toBe('senate-119-1-1');
  });

  it('does not zero-pad the roll number (matches schema comment)', () => {
    expect(formatRollCallId('house', 119, 1, 7)).toBe('house-119-1-7');
    expect(formatRollCallId('house', 119, 1, 1247)).toBe('house-119-1-1247');
  });

  it('handles single-digit congress and session', () => {
    expect(formatRollCallId('house', 1, 1, 1)).toBe('house-1-1-1');
  });

  it('exports a generateVoteKey alias for backward compatibility', () => {
    expect(generateVoteKey('house', 119, 1, 247)).toBe('house-119-1-247');
    // Same function reference
    expect(generateVoteKey).toBe(formatRollCallId);
  });
});
