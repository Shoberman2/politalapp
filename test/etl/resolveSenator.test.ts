import { describe, it, expect } from 'vitest';
import { resolveSenator, type SenatorCandidate } from '../../etl/extractHouseVotes';

// Regression cover for the surname-collision bug found 2026-08-06.
//
// The Senate voter lookup keyed on surname+state and resolved against
// Congress.gov's *current* members only. When Darline Graham succeeded Lindsey
// Graham in South Carolina, "graham-sc" resolved to Darline for every vote in
// the Congress — including the 823 cast before she took office. That also put
// two SC senators on 327 roll calls, pushing them to 101 voters in a 100-seat
// chamber, where the tally sanity check suppressed them entirely.

const LINDSEY: SenatorCandidate = {
  bioguideId: 'G000359',
  firstName: 'lindsey',
  startYear: 2003,
  endYear: 2026,
};

const DARLINE: SenatorCandidate = {
  bioguideId: 'G000608',
  firstName: 'darline',
  startYear: 2026,
  endYear: null,
};

// Both Grahams held the SC seat during the 119th Congress.
const SC_SEAT = [DARLINE, LINDSEY];

describe('resolveSenator', () => {
  it('credits a 2025 Graham vote to Lindsey, not his successor', () => {
    // The exact failure: before the fix this returned G000608.
    expect(resolveSenator(SC_SEAT, 'lindsey', '2025-03-14')).toBe('G000359');
  });

  it('credits a post-succession Graham vote to Darline', () => {
    expect(resolveSenator(SC_SEAT, 'darline', '2026-08-05')).toBe('G000608');
  });

  it('uses the first name even when both terms touch the same year', () => {
    // 2026 falls inside Lindsey's term (ends 2026) and Darline's (starts 2026),
    // so the term window alone cannot separate them.
    expect(resolveSenator(SC_SEAT, 'lindsey', '2026-01-20')).toBe('G000359');
    expect(resolveSenator(SC_SEAT, 'darline', '2026-01-20')).toBe('G000608');
  });

  it('resolves an unambiguous seat without needing a first name', () => {
    const seat = [{ bioguideId: 'S001184', firstName: 'tim', startYear: 2013, endYear: null }];
    expect(resolveSenator(seat, '', '2025-06-01')).toBe('S001184');
    expect(resolveSenator(seat, 'whoever', '2025-06-01')).toBe('S001184');
  });

  it('falls back to the term window when the first name does not match', () => {
    // Senate XML spells a name differently than Congress.gov (nickname,
    // middle name). Only one Graham was serving in 2024, so the window decides.
    expect(resolveSenator(SC_SEAT, 'linds', '2024-05-02')).toBe('G000359');
  });

  it('returns empty rather than guessing when the seat is unknown', () => {
    expect(resolveSenator(undefined, 'lindsey', '2025-03-14')).toBe('');
    expect(resolveSenator([], 'lindsey', '2025-03-14')).toBe('');
  });

  it('returns empty rather than guessing when genuinely ambiguous', () => {
    // Two overlapping terms and no usable first name: dropping the position is
    // correct. A vote attributed to the wrong senator is worse than one we
    // admit we cannot place.
    const ambiguous = [
      { bioguideId: 'X000001', firstName: 'sam', startYear: 2020, endYear: null },
      { bioguideId: 'X000002', firstName: 'sam', startYear: 2020, endYear: null },
    ];
    expect(resolveSenator(ambiguous, 'sam', '2025-06-01')).toBe('');
  });

  it('survives a missing or malformed vote date', () => {
    // Falls through to the first-name match rather than throwing.
    expect(resolveSenator(SC_SEAT, 'lindsey', '')).toBe('G000359');
    expect(resolveSenator(SC_SEAT, 'lindsey', 'not-a-date')).toBe('G000359');
    expect(resolveSenator(SC_SEAT, '', '')).toBe('');
  });

  it('places the Mullin/Armstrong succession without the old hardcoded patch', () => {
    // Different surnames, so each seat key holds one candidate. This case used
    // to need a literal `senatorBioguideMap.set('mullin-ok', 'M001190')`.
    const mullin = [{ bioguideId: 'M001190', firstName: 'markwayne', startYear: 2023, endYear: 2026 }];
    const armstrong = [{ bioguideId: 'A000383', firstName: 'alan', startYear: 2026, endYear: null }];
    expect(resolveSenator(mullin, 'markwayne', '2025-11-04')).toBe('M001190');
    expect(resolveSenator(armstrong, 'alan', '2026-07-01')).toBe('A000383');
  });
});
