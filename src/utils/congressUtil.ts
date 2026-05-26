/**
 * Congress utility helpers — single source of truth for "what Congress is it".
 *
 * Replaces ~10 hardcoded `congress = 119` literals across the codebase that
 * the historical-chamber feature would otherwise have to track manually.
 *
 * The 20th Amendment (1933) fixed Congress start/end at January 3. Every
 * Congress runs January 3 of odd years through January 3 of the next odd
 * year. The 119th Congress is 2025-01-03 through 2027-01-03.
 *
 * Public exports:
 *   - getCurrentCongress(): number               — defaults to today's Congress
 *   - getCurrentCongressForDate(date): number    — maps any date to its Congress
 *   - parseCongressParam(value): number          — URL/query-param parsing with
 *                                                  validation
 *   - InvalidCongressError                       — thrown by parseCongressParam
 *   - CONGRESS_MIN / CONGRESS_MAX                — UI scrubber bounds
 */

/** Lowest Congress backfilled by the historical-chamber feature (E6 cherry-pick). */
export const CONGRESS_MIN = 93;

/** Earliest Congress shown in bill/history browse surfaces (107th = 2001-2003). */
export const BILL_CONGRESS_MIN = 107;

/** Start date for the 107th Congress, used to keep all-Congress bill search in range. */
export const BILL_ARCHIVE_START_DATE = '2001-01-03';

/**
 * Highest Congress the app knows about. Bump this when a new Congress begins.
 * `getCurrentCongress()` derives this dynamically from today's date too, but
 * the constant is useful for static UI bounds (e.g. scrubber max).
 *
 * Verified: as of 2026-05, the current Congress is 119.
 */
export const CONGRESS_MAX = 119;

/**
 * The 119th Congress began on January 3, 2025. Every Congress before/after
 * is +/- 2 years from this anchor.
 */
const ANCHOR_CONGRESS = 119;
const ANCHOR_START_YEAR = 2025;

export class InvalidCongressError extends Error {
  readonly param: unknown;
  constructor(param: unknown, message: string) {
    super(message);
    this.name = 'InvalidCongressError';
    this.param = param;
  }
}

/**
 * Maps any date to the Congress number that was in session on that date.
 *
 * Congress N runs from Jan 3 of (ANCHOR_START_YEAR + 2 * (N - ANCHOR_CONGRESS))
 * to Jan 3 of (ANCHOR_START_YEAR + 2 * (N - ANCHOR_CONGRESS + 1)).
 *
 * Example: getCurrentCongressForDate(new Date('2026-05-21')) → 119
 *          getCurrentCongressForDate(new Date('2001-02-15')) → 107
 *          getCurrentCongressForDate(new Date('1973-04-01')) → 93
 */
export function getCurrentCongressForDate(date: Date): number {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0-indexed: Jan=0
  const day = date.getUTCDate();

  // If we're past January 3, we're in the Congress that began this year (odd)
  // or last year (even). If we're on Jan 1-2 of an odd year, we're still in
  // the previous Congress.
  let referenceYear = year;
  if (year % 2 === 1 && (month === 0 && day < 3)) {
    // Odd year, before Jan 3: still in the previous Congress.
    referenceYear = year - 1;
  } else if (year % 2 === 0) {
    // Even year: we're in the Congress that began the previous odd year.
    referenceYear = year - 1;
  }

  const congressOffset = Math.floor((referenceYear - ANCHOR_START_YEAR) / 2);
  return ANCHOR_CONGRESS + congressOffset;
}

/**
 * Returns the Congress in session today.
 *
 * Accepts an optional `now` parameter for testability.
 */
export function getCurrentCongress(now: Date = new Date()): number {
  return getCurrentCongressForDate(now);
}

/**
 * Parses a Congress value from a URL param / user input / API arg.
 *
 * Accepts:
 *   - integers in [CONGRESS_MIN, CONGRESS_MAX]
 *   - numeric strings of the same
 *
 * Throws InvalidCongressError on:
 *   - null / undefined / empty string
 *   - non-numeric strings
 *   - floats / non-integers
 *   - out-of-range integers
 *
 * Use this at every entry point (route param, query string, public service
 * function) so the rest of the codebase can assume Congress is a valid int.
 */
export function parseCongressParam(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    throw new InvalidCongressError(value, 'Congress is required');
  }

  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string') {
    // Reject leading-zero strings and floats; accept "119" but not "119.0" / "119abc".
    if (!/^-?\d+$/.test(value)) {
      throw new InvalidCongressError(value, `Congress must be an integer; got "${value}"`);
    }
    n = parseInt(value, 10);
  } else {
    throw new InvalidCongressError(
      value,
      `Congress must be a number or numeric string; got ${typeof value}`
    );
  }

  if (!Number.isInteger(n)) {
    throw new InvalidCongressError(value, `Congress must be an integer; got ${n}`);
  }
  if (n < CONGRESS_MIN || n > CONGRESS_MAX) {
    throw new InvalidCongressError(
      value,
      `Congress ${n} is out of range; valid range is ${CONGRESS_MIN}-${CONGRESS_MAX}`
    );
  }
  return n;
}

/**
 * Returns the calendar start year of a Congress.
 * Example: getCongressStartYear(119) → 2025.
 */
export function getCongressStartYear(congress: number): number {
  return ANCHOR_START_YEAR + 2 * (congress - ANCHOR_CONGRESS);
}

/**
 * Returns the calendar end year of a Congress (the year the next Congress starts).
 * Example: getCongressEndYear(119) → 2027.
 */
export function getCongressEndYear(congress: number): number {
  return getCongressStartYear(congress) + 2;
}

/**
 * Human-readable Congress label.
 * Example: formatCongressLabel(119) → "119th Congress (2025-2027)"
 */
export function formatCongressLabel(congress: number): string {
  const start = getCongressStartYear(congress);
  const end = getCongressEndYear(congress);
  return `${formatOrdinal(congress)} Congress (${start}-${end})`;
}

function formatOrdinal(n: number): string {
  const lastTwo = n % 100;
  const lastOne = n % 10;
  // 11, 12, 13 → th; otherwise 1st/2nd/3rd
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  if (lastOne === 1) return `${n}st`;
  if (lastOne === 2) return `${n}nd`;
  if (lastOne === 3) return `${n}rd`;
  return `${n}th`;
}
