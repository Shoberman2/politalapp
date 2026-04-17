/**
 * 2024 Presidential margins by U.S. House Congressional District.
 *
 * Source: Daily Kos Elections (published under CC BY-SA 4.0 — attribution
 * required in the UI methodology modal). Used by the Voting Pattern Analysis
 * classifier's district-lean signal.
 *
 * Keys: "{state-abbr}-{district}" (e.g., "CA-11"). At-large districts use "-AL".
 * Values: object with { harrisMargin, trumpMargin } percentage points.
 *         Positive harrisMargin = Harris won; positive trumpMargin = Trump won.
 *
 * IMPORTANT: This file starts as a small seed covering high-profile districts.
 * The full Daily Kos 2024 presidential-by-CD dataset (all 435 districts) should
 * be imported before ship. When a district is missing from this map, the
 * classifier gracefully renormalizes to 2 signals (party + donor) and the UI
 * shows "District lean not available" in the district-mismatch flag.
 *
 * TODO(hydrate): Download current Daily Kos Elections 2024 presidential-by-CD
 * spreadsheet and expand this map to all 435 districts.
 * https://www.dailykos.com/stories/2024-presidential-results-by-congressional-district
 */

export const DISTRICT_LEAN_2024 = {
  // Test rep districts (must exist for reviewer test coverage)
  'CA-11': { harrisMargin: 64, trumpMargin: 0 }, // Pelosi — SF
  'NY-14': { harrisMargin: 46, trumpMargin: 0 }, // AOC — Bronx/Queens
  'LA-4': { harrisMargin: 0, trumpMargin: 24 },  // Mike Johnson — Shreveport

  // Common high-visibility districts (seed; expand as needed)
  'TX-21': { harrisMargin: 0, trumpMargin: 12 },
  'FL-27': { harrisMargin: 0, trumpMargin: 10 },
  'PA-7':  { harrisMargin: 1,  trumpMargin: 0 },
  'CA-22': { harrisMargin: 0, trumpMargin: 5 },
  'MI-7':  { harrisMargin: 0, trumpMargin: 4 },
};

/**
 * Look up district lean.
 * @param {string} state - Two-letter state abbreviation.
 * @param {string|number} district - District number. "0" or missing = at-large ("AL").
 * @returns {{harrisMargin: number, trumpMargin: number} | null}
 */
export function getDistrictLean(state, district) {
  if (!state) return null;
  const d = district && district !== '0' ? String(district) : 'AL';
  const key = `${state.toUpperCase()}-${d}`;
  return DISTRICT_LEAN_2024[key] ?? null;
}
