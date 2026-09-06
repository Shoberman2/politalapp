// Normalized page data as produced by api/_lib/pages.js.
export const member = {
  kind: 'member',
  id: 'P000197',
  name: 'Nancy Pelosi',
  chamber: 'house',
  state: 'CA',
  district: '11',
  party: 'Democratic',
  photo_url: 'https://bioguide.congress.gov/bioguide/photo/P/P000197.jpg',
  terms: [{ congress: 119, chamber: 'house', state: 'CA', district: '11', party: 'D', term_start: '2025-01-03', term_end: null }],
  stats: { congress: 119, total_votes: 890, yea_count: 400, nay_count: 380, present_count: 0, not_voting_count: 110, party_loyalty_pct: 94 },
  voteCount: 890,
  votes: [
    { roll_call_id: 'house-119-2-295', position: 'Nay', voted_at: '2026-09-03', source_url: 'https://clerk.house.gov/Votes/2026295', bill: { id: '119-hr-4795', title: 'Water Resources Development Act of 2026' }, question: 'On Passage' },
    { roll_call_id: 'house-119-2-294', position: 'Yea', voted_at: '2026-09-03', source_url: 'https://clerk.house.gov/Votes/2026294', bill: null, question: 'On Motion to Adjourn' },
  ],
  source_url: 'https://bioguide.congress.gov/search/bio/P000197',
  congress_gov_url: 'https://www.congress.gov/member/P000197',
  indexable: true,
  noindexReason: null,
  updatedAt: '2026-09-05T10:25:32.028Z',
}

export const rollCall = {
  kind: 'vote',
  id: 'house-119-2-295',
  chamberKey: 'house',
  chamber: 'House',
  congress: 119,
  session: 2,
  roll: 295,
  question: 'On Passage',
  description: null,
  voted_at: '2026-09-03',
  bill: { id: '119-hr-4795', title: 'Water Resources Development Act of 2026', source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/4795', policy_area: 'Water Resources Development' },
  tally: { yea: 380, nay: 40, present: 0, notVoting: 15 },
  party: { dem: { yea: 200, nay: 10 }, rep: { yea: 180, nay: 30 }, ind: { yea: 0, nay: 0 } },
  result: 'Passed',
  resultKind: 'passed',
  votes: [
    { position: 'Yea', member: { id: 'A000055', name: 'Robert Aderholt', party: 'Republican', state: 'AL', district: '4', chamber: 'house' } },
    { position: 'Nay', member: { id: 'P000197', name: 'Nancy Pelosi', party: 'Democratic', state: 'CA', district: '11', chamber: 'house' } },
  ],
  source_url: 'https://clerk.house.gov/Votes/2026295',
  indexable: true,
  noindexReason: null,
  updatedAt: '2026-09-05T10:25:32.028Z',
}

export const bill = {
  kind: 'bill',
  id: '119-hr-1',
  congress: '119',
  billType: 'hr',
  number: '1',
  label: 'H.R. 1',
  title: 'An act to provide for reconciliation pursuant to title II of H. Con. Res. 14.',
  introduced_at: '2025-07-04',
  policy_area: null,
  legislative_stage: 'enacted',
  sponsor: null,
  crs_summary: null,
  summary: null,
  oneLiner: null,
  explanationDiscarded: true,
  source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/1',
  rollCalls: [{ id: 'house-119-1-190', chamber: 'House', question: 'On Passage', voted_at: '2025-07-03', tally: { yea: 218, nay: 214 }, result: 'Passed', resultKind: 'passed' }],
  indexable: true,
  noindexReason: null,
  updatedAt: '2026-09-05T10:25:32.028Z',
}

export const shell = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>BallotWatch - Congressional Voting Records</title>
    <meta name="description" content="Default description." />
    <link rel="canonical" href="https://www.ballotwatch.io/" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://www.ballotwatch.io/" />
    <meta property="og:title" content="BallotWatch" />
    <meta property="og:description" content="Default description." />
    <meta name="twitter:title" content="BallotWatch" />
    <meta name="twitter:description" content="Default description." />
    <meta name="robots" content="index, follow" />
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebApplication"}</script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/index-abc123.js"></script>
  </body>
</html>`
