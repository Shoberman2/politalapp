/**
 * Curated historic moments — the moments overlay seed data.
 *
 * Each moment is a notable Senate roll-call vote that the chamber UI can
 * "freeze on" and re-tint desks by vote outcome (Yea / Nay / Not voting)
 * instead of party.
 *
 * Per /plan-ceo-review 4.A (manually curated + visible methodology page).
 * Per /plan-design-review D6 (vote outcome REPLACES party tint).
 * Per /plan-eng-review D1 re-sequencing: P3 ships with a small set of
 * current-Congress moments only; historical moments unlock as P5 vote
 * backfill completes.
 *
 * Curation criteria (also surfaced in /chamber/methodology):
 *   1. Nationally discussed within 90 days of the vote
 *   2. AP/NYT front-page coverage at the time
 *   3. Lasting policy impact (measured 12+ months after the vote)
 *   4. Cross-decade balance (Bush / Obama / Trump / Biden eras represented
 *      once P5 backfill lands the older votes)
 *
 * Schema:
 *   slug         — URL-safe stable ID
 *   title        — Short display title
 *   date         — ISO date string of the vote
 *   congress     — Congress number when the vote occurred
 *   tally        — Plain-text vote tally (e.g. "60-39 · Senate Yea"). NOT
 *                  a gauge per [editorial-popover-anti-gauge] learning.
 *   blurb        — One-paragraph editorial context (<= 60ch line wraps fine)
 *   votes        — { [bioguideId]: 'Yea' | 'Nay' | 'NotVoting' }
 *                  For v1 we ship empty {} for moments where the votes data
 *                  isn't loaded yet. The overlay still renders the heading +
 *                  tally + blurb, and the chamber stays in party-tint mode
 *                  (no per-desk re-tint happens with empty votes map).
 *
 * STATUS: v1 STUB with 3 moments. Populate `votes` objects after P5 backfill
 * loads roll-call votes into the votes table; until then, the overlay
 * displays the moment heading + tally + blurb, which still tells the
 * editorial story even without per-desk re-tinting.
 */

export const historicMoments = [
  {
    slug: 'inflation-reduction-act-2022',
    title: 'Inflation Reduction Act',
    date: '2022-08-07',
    congress: 117,
    tally: '51-50 · Vice President breaks tie',
    blurb:
      'Climate, healthcare, and tax legislation that became a defining ' +
      'achievement of the 117th Congress. Passed via budget reconciliation ' +
      'on a strict party-line vote, with Vice President Harris casting the ' +
      'tie-breaking vote.',
    votes: {}, // P5 backfill populates this map from the votes table
  },
  {
    slug: 'aca-passage-2009',
    title: 'Affordable Care Act',
    date: '2009-12-24',
    congress: 111,
    tally: '60-39 · Senate Yea',
    blurb:
      'Christmas Eve passage of the Patient Protection and Affordable Care ' +
      'Act, the most consequential healthcare legislation in a generation. ' +
      'Required all 60 members of the Democratic caucus to overcome a ' +
      'Republican filibuster.',
    votes: {},
  },
  {
    slug: 'iraq-war-authorization-2002',
    title: 'Iraq War Authorization',
    date: '2002-10-11',
    congress: 107,
    tally: '77-23 · Senate Yea',
    blurb:
      'The Authorization for Use of Military Force Against Iraq passed the ' +
      'Senate with strong bipartisan support 13 months after 9/11. The ' +
      'vote shaped the next two decades of American foreign policy and ' +
      'haunted multiple presidential campaigns.',
    votes: {},
  },
]

/**
 * Returns moments applicable to a given Congress. v1: returns all moments
 * (the chamber UI auto-scrubs to the moment's Congress when selected).
 */
export function getMomentsForCongress(_congress) {
  return historicMoments
}

/**
 * Returns the moment with the given slug, or null.
 */
export function getMomentBySlug(slug) {
  return historicMoments.find((m) => m.slug === slug) ?? null
}
