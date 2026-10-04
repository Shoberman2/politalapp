// Copy shared by the explanatory pages (/how-it-works, /data-sources).
// Plain text only.

// Where AI is used and where it never is. Same wording as the landing page's
// "How we use AI" section (src/components/Landing.jsx); change both together.
export const AI_USES = [
  'Explain bills from the official summary, with the source beside it',
  'Narrate a member’s voting patterns from numbers we computed first',
  'Answer your AI assistant with cited records through our MCP server',
]
export const AI_NEVER = [
  'Write in your representative’s voice or guess their positions',
  'Send anything you haven’t read and approved',
  'Choose a side for you, or rank and score constituents',
]

// Every upstream source, written from what the code does (checked 2026-10-04):
// - etl/run.ts + .github/workflows/etl-daily.yml: daily at 06:00 UTC, the last
//   30 days of votes, bill details and CRS summaries; etl-procedural-backfill
//   re-checks the whole Congress weekly (Sunday 08:00 UTC).
// - etl/extractHouseVotes.ts: House roll calls through Congress.gov's
//   /house-vote endpoint (the Clerk's record, linked to clerk.house.gov);
//   Senate roll calls straight from senate.gov LIS XML.
// - api/_lib/floorSchedule.js: docs.house.gov fetched on request, memoized 5 min.
// - src/services/district.js: Census geocoder called from the browser (JSONP);
//   Zippopotam.us maps a bare ZIP code to its state.
// - api/_lib/upstreamProxy.js + src/services/donations.js: OpenFEC on request
//   through our proxy (key server-side), cached in the browser for 24 hours.
// Update this list when any of those change.
export const DATA_SOURCES = [
  {
    name: 'Congress.gov API',
    publisher: 'Library of Congress',
    takes: 'Members of Congress, bills, their actions and sponsors, and the official summaries written by the Congressional Research Service.',
    cadence: 'Daily',
    cadenceNote: 'Plus a weekly full re-check. Some bill details load live.',
    url: 'https://api.congress.gov/',
    linkLabel: 'api.congress.gov',
  },
  {
    name: 'Office of the Clerk, U.S. House',
    publisher: 'U.S. House of Representatives',
    takes: 'Every House roll-call vote: the question, the tally, and how each member voted. We read it through the Congress.gov API and link each vote to the Clerk’s page.',
    cadence: 'Daily',
    url: 'https://clerk.house.gov/Votes',
    linkLabel: 'clerk.house.gov',
  },
  {
    name: 'U.S. Senate',
    publisher: 'Senate Legislative Information System',
    takes: 'Every Senate roll-call vote, read from the Senate’s own published vote files.',
    cadence: 'Daily',
    url: 'https://www.senate.gov/legislative/votes_new.htm',
    linkLabel: 'senate.gov',
  },
  {
    name: 'docs.house.gov',
    publisher: 'House Majority Leader',
    takes: 'The House weekly floor schedule, this week and next. The Senate publishes no equivalent.',
    cadence: 'Live',
    cadenceNote: 'Fetched when you open the page, kept for 5 minutes.',
    url: 'https://docs.house.gov/floor/',
    linkLabel: 'docs.house.gov',
  },
  {
    name: 'U.S. Census Bureau geocoder',
    publisher: 'U.S. Census Bureau',
    takes: 'Your street address to its congressional district. A ZIP code alone is matched to its state with Zippopotam.us.',
    cadence: 'On request',
    cadenceNote: 'Sent straight from your browser to the Census Bureau.',
    url: 'https://geocoding.geo.census.gov/geocoder/',
    linkLabel: 'geocoding.geo.census.gov',
  },
  {
    name: 'Federal Election Commission',
    publisher: 'OpenFEC API',
    takes: 'Campaign finance context: candidate committees, totals, and itemized contributions.',
    cadence: 'On request',
    cadenceNote: 'Cached in your browser for 24 hours.',
    url: 'https://api.open.fec.gov/developers/',
    linkLabel: 'api.open.fec.gov',
  },
]
