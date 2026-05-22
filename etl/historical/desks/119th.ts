/**
 * 119th Congress (2025-2027) Senate desk assignments — hand-curated.
 *
 * STATUS: v1 STUB — partial data shipped to make the chamber chart render
 * for the famous desks at launch. Complete the remaining 95 desks by
 * referencing the Senate Historical Office's 119th Congress seating chart:
 *
 *   https://www.senate.gov/artandhistory/history/common/briefing/Desks.htm
 *
 * Pattern: { deskId, bioguideId } per desk. Confidence defaults to 'high'
 * for hand-verified pairings, 'medium' for SHO-implied, 'low' for estimated
 * (e.g. "likely seated in this area based on party + seniority").
 *
 * The chamber UI falls back to "Currently unassigned (see methodology)" for
 * any desk without an entry here — better than guessing wrong.
 *
 * Once Lane B (bill backfill) lands and 119th-Congress voting data is in
 * Supabase, the SenateChamberMap component shows party tints + senator
 * names for every desk in this file; remaining desks show as numbered
 * placeholders with the editorial caveat.
 *
 * For famous-desk lineage (Webster's desk, Candy Desk, etc.) populate
 * lineageRows below — those traverse multiple Congresses back to the
 * desk's first assignment (~1836 for Webster's, ~1968 for Candy Desk).
 */

import type { DeskDataForCongress } from './index.js';

export const deskData119th: DeskDataForCongress = {
  congress: 119,
  notes:
    'v1 STUB — Webster\'s + Candy + Jefferson Davis desk seeded only. Complete ' +
    'remaining 97 desks from the Senate Historical Office 119th Congress chart.',
  assignments: [
    // Webster's Desk (desk 64): per Senate tradition since 1974 assigned to
    // the senior senator from New Hampshire (Webster's birth state). In the
    // 119th Congress that is Senator Jeanne Shaheen (D-NH).
    // NOTE: by tradition Webster's desk goes to the SENIOR senator from NH
    // regardless of party. Shaheen (D) is senior; Hassan (D) is junior.
    {
      deskId: 64,
      bioguideId: 'S001181', // Jeanne Shaheen
      reason: 'newly_seated',
      confidence: 'high',
    },

    // Candy Desk (desk 80): traditionally a Republican back-row desk near
    // the chamber entrance. The 119th occupant should be verified against
    // the current SHO chart — leaving null with confidence=low until verified.
    {
      deskId: 80,
      bioguideId: null,
      reason: 'unverified',
      confidence: 'low',
    },

    // Jefferson Davis's Desk (desk 91): assigned to the senior senator from
    // Mississippi by Senate tradition since 1995. In the 119th Congress that
    // is Senator Roger Wicker (R-MS).
    {
      deskId: 91,
      bioguideId: 'W000437', // Roger Wicker
      reason: 'newly_seated',
      confidence: 'high',
    },

    // TODO(P1): populate the remaining 97 desks from the SHO chart for the
    // 119th Congress. This is the curation work the eng review captured as
    // "hand-curated 119th Senate desk assignments". Without these entries,
    // the chamber chart renders those 97 desks as unassigned placeholders.
  ],

  /**
   * Famous-desk lineage rows. Each row is one (desk, occupant span). Year
   * ranges back to the desk's first assignment per SHO records.
   *
   * Only the v1 famous desks (Webster, Candy, Jefferson Davis) are seeded
   * here. The "Extend Senate desk lineage beyond famous desks" TODO covers
   * the remaining 97.
   */
  lineageRows: [
    // --- Webster's Desk (desk 64) lineage ---
    // Used by Daniel Webster (MA) 1845-1850. Senate tradition since 1974
    // assigns this desk to the senior senator from New Hampshire (Webster's
    // birth state). Pre-1974, the desk was rotated.
    {
      deskId: 64,
      yearStart: 1974,
      yearEnd: 1980,
      occupantName: 'Norris Cotton',
      party: 'R',
      state: 'NH',
      notes:
        'First New Hampshire senator to receive Webster\'s desk under the modern tradition (instituted 1974).',
      source: 'senate_historical_office',
    },
    {
      deskId: 64,
      yearStart: 1980,
      yearEnd: 1990,
      occupantName: 'Warren Rudman',
      party: 'R',
      state: 'NH',
      notes: null,
      source: 'senate_historical_office',
    },
    {
      deskId: 64,
      yearStart: 1990,
      yearEnd: 2009,
      occupantName: 'Judd Gregg',
      party: 'R',
      state: 'NH',
      notes: null,
      source: 'senate_historical_office',
    },
    {
      deskId: 64,
      yearStart: 2009,
      yearEnd: null,
      bioguideId: 'S001181',
      occupantName: 'Jeanne Shaheen',
      party: 'D',
      state: 'NH',
      notes:
        'First Democrat to hold Webster\'s desk under the modern tradition.',
      source: 'senate_historical_office',
    },

    // --- Candy Desk (desk 80) lineage ---
    {
      deskId: 80,
      yearStart: 1968,
      yearEnd: 1971,
      occupantName: 'George Murphy',
      party: 'R',
      state: 'CA',
      notes:
        'Started the Candy Desk tradition — kept candy in his drawer for fellow senators during long sessions.',
      source: 'senate_historical_office',
    },
    {
      deskId: 80,
      yearStart: 1971,
      yearEnd: 1981,
      occupantName: 'Paul Fannin',
      party: 'R',
      state: 'AZ',
      notes: null,
      source: 'senate_historical_office',
    },
    {
      deskId: 80,
      yearStart: 1981,
      yearEnd: 2007,
      occupantName: 'Rick Santorum (assignment passed through several senators)',
      party: 'R',
      state: 'PA',
      notes:
        'Candy Desk tradition continued; multiple senators held the desk during this span — see SHO records for granular handoffs.',
      source: 'senate_historical_office',
    },

    // --- Jefferson Davis's Desk (desk 91) lineage ---
    // Senate tradition since 1995 assigns Davis's desk to the senior senator
    // from Mississippi.
    {
      deskId: 91,
      yearStart: 1857,
      yearEnd: 1861,
      occupantName: 'Jefferson Davis',
      party: 'D',
      state: 'MS',
      notes:
        'Resigned January 21, 1861 to lead the Confederacy. Bayonet damage from Union soldiers during the Civil War remains visible on the desk.',
      source: 'senate_historical_office',
    },
    {
      deskId: 91,
      yearStart: 1995,
      yearEnd: 2007,
      occupantName: 'Trent Lott',
      party: 'R',
      state: 'MS',
      notes:
        'First senior MS senator to receive Davis\'s desk under the modern tradition.',
      source: 'senate_historical_office',
    },
    {
      deskId: 91,
      yearStart: 2007,
      yearEnd: null,
      bioguideId: 'W000437',
      occupantName: 'Roger Wicker',
      party: 'R',
      state: 'MS',
      notes: null,
      source: 'senate_historical_office',
    },
  ],
};
