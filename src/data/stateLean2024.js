/**
 * 2024 Presidential margins by state.
 *
 * Used for senators (who have no congressional district). All 50 states + DC.
 *
 * Source: 2024 presidential results by state (public record).
 * Values: object with { harrisMargin, trumpMargin } percentage points.
 *         Positive harrisMargin = Harris won; positive trumpMargin = Trump won.
 *
 * Verify exact margins before ship. These are reasonable approximations from
 * final 2024 certified results; substitute authoritative Daily Kos Elections
 * or AP values before the feature's methodology modal cites this data.
 */

export const STATE_LEAN_2024 = {
  AL: { harrisMargin: 0,  trumpMargin: 26 },
  AK: { harrisMargin: 0,  trumpMargin: 13 },
  AZ: { harrisMargin: 0,  trumpMargin: 6 },
  AR: { harrisMargin: 0,  trumpMargin: 21 },
  CA: { harrisMargin: 20, trumpMargin: 0 },
  CO: { harrisMargin: 11, trumpMargin: 0 },
  CT: { harrisMargin: 14, trumpMargin: 0 },
  DE: { harrisMargin: 15, trumpMargin: 0 },
  DC: { harrisMargin: 86, trumpMargin: 0 },
  FL: { harrisMargin: 0,  trumpMargin: 13 },
  GA: { harrisMargin: 0,  trumpMargin: 2 },
  HI: { harrisMargin: 23, trumpMargin: 0 },
  ID: { harrisMargin: 0,  trumpMargin: 37 },
  IL: { harrisMargin: 11, trumpMargin: 0 },
  IN: { harrisMargin: 0,  trumpMargin: 19 },
  IA: { harrisMargin: 0,  trumpMargin: 13 },
  KS: { harrisMargin: 0,  trumpMargin: 16 },
  KY: { harrisMargin: 0,  trumpMargin: 31 },
  LA: { harrisMargin: 0,  trumpMargin: 22 },
  ME: { harrisMargin: 7,  trumpMargin: 0 },
  MD: { harrisMargin: 30, trumpMargin: 0 },
  MA: { harrisMargin: 25, trumpMargin: 0 },
  MI: { harrisMargin: 0,  trumpMargin: 1 },
  MN: { harrisMargin: 4,  trumpMargin: 0 },
  MS: { harrisMargin: 0,  trumpMargin: 22 },
  MO: { harrisMargin: 0,  trumpMargin: 18 },
  MT: { harrisMargin: 0,  trumpMargin: 20 },
  NE: { harrisMargin: 0,  trumpMargin: 20 },
  NV: { harrisMargin: 0,  trumpMargin: 3 },
  NH: { harrisMargin: 3,  trumpMargin: 0 },
  NJ: { harrisMargin: 6,  trumpMargin: 0 },
  NM: { harrisMargin: 6,  trumpMargin: 0 },
  NY: { harrisMargin: 13, trumpMargin: 0 },
  NC: { harrisMargin: 0,  trumpMargin: 3 },
  ND: { harrisMargin: 0,  trumpMargin: 37 },
  OH: { harrisMargin: 0,  trumpMargin: 11 },
  OK: { harrisMargin: 0,  trumpMargin: 33 },
  OR: { harrisMargin: 14, trumpMargin: 0 },
  PA: { harrisMargin: 0,  trumpMargin: 2 },
  RI: { harrisMargin: 14, trumpMargin: 0 },
  SC: { harrisMargin: 0,  trumpMargin: 18 },
  SD: { harrisMargin: 0,  trumpMargin: 29 },
  TN: { harrisMargin: 0,  trumpMargin: 23 },
  TX: { harrisMargin: 0,  trumpMargin: 14 },
  UT: { harrisMargin: 0,  trumpMargin: 22 },
  VT: { harrisMargin: 32, trumpMargin: 0 },
  VA: { harrisMargin: 6,  trumpMargin: 0 },
  WA: { harrisMargin: 19, trumpMargin: 0 },
  WV: { harrisMargin: 0,  trumpMargin: 42 },
  WI: { harrisMargin: 0,  trumpMargin: 1 },
  WY: { harrisMargin: 0,  trumpMargin: 46 },
};

/**
 * Look up state lean.
 * @param {string} state - Two-letter state abbreviation.
 * @returns {{harrisMargin: number, trumpMargin: number} | null}
 */
export function getStateLean(state) {
  if (!state) return null;
  return STATE_LEAN_2024[state.toUpperCase()] ?? null;
}
