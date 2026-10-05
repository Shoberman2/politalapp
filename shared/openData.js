// The open-data catalog: one description of the bulk files BallotWatch
// publishes, shared by the exporter (etl/exportOpenData.ts), the datasets API
// (api/v1/datasets.js), the homepage Dataset JSON-LD (src/data/homeSeo.js),
// the /open page, and scripts/build-llms-full.mjs. Plain JS with no imports so
// Node, tsx and Vite can all load it. Change a field here and the CSV header,
// the NDJSON keys, the Frictionless schema and the docs all change together.

export const SITE_ORIGIN = 'https://www.ballotwatch.io'

// Public URLs under our domain. vercel.json rewrites these to the public
// Supabase Storage bucket below (see OPEN_DATA_STORAGE_BASE).
export const OPEN_DATA_PATH = '/data/full'
export const OPEN_DATA_BASE_URL = `${SITE_ORIGIN}${OPEN_DATA_PATH}`
export const OPEN_DATA_ARCHIVE_PATH = '/data/archive'
export const MANIFEST_URL = `${OPEN_DATA_BASE_URL}/manifest.json`
export const DATAPACKAGE_URL = `${OPEN_DATA_BASE_URL}/datapackage.json`
export const DATASETS_API_URL = `${SITE_ORIGIN}/api/v1/datasets`

// Supabase Storage. The project ref is not a secret (it is in every browser
// bundle as VITE_SUPABASE_URL). This is the ONE place the public object URL is
// written in code; vercel.json repeats it in two rewrites (JSON cannot import)
// and test/api/openDataRoutes.test.js asserts the two agree. If the Supabase
// project changes, update this constant and those rewrites together.
export const OPEN_DATA_BUCKET = 'open-data'
export const OPEN_DATA_STORAGE_BASE = 'https://dbtbmjjjcfwobhlicduk.supabase.co/storage/v1/object/public/open-data'
export const LATEST_PREFIX = 'latest'
export const KEEP_DATED_SNAPSHOTS = 14

export const DATA_LICENSE = {
  id: 'CC0-1.0',
  name: 'CC0-1.0',
  title: 'Creative Commons Zero v1.0 Universal (public domain dedication)',
  path: 'https://creativecommons.org/publicdomain/zero/1.0/',
  legalcode: 'https://creativecommons.org/publicdomain/zero/1.0/legalcode',
}

export const DATA_SOURCES = [
  { title: 'Congress.gov (Library of Congress)', path: 'https://www.congress.gov/', notes: 'Members, terms, bills, sponsors, cosponsors, policy areas, House roll calls via the /house-vote API.' },
  { title: 'Office of the Clerk, U.S. House of Representatives', path: 'https://clerk.house.gov/Votes', notes: 'House roll-call votes and member positions.' },
  { title: 'U.S. Senate (Legislative Information System)', path: 'https://www.senate.gov/legislative/votes_new.htm', notes: 'Senate roll-call votes and member positions.' },
]

export const ATTRIBUTION = 'BallotWatch (https://www.ballotwatch.io), from public records of Congress.gov, the Office of the Clerk of the U.S. House, and the U.S. Senate.'
export const CITATION = 'BallotWatch open data, snapshot {date}. https://www.ballotwatch.io/data/full/ (CC0 1.0). Source records: Congress.gov, Office of the Clerk of the U.S. House, U.S. Senate.'
export const UPDATE_CADENCE = 'Daily, about 07:30 UTC, after the 06:00 UTC ingest.'

// Frictionless field types: string, integer, number, boolean, date.
const f = (name, type, description, extra = {}) => ({ name, type, description, ...extra })

// scopes: 'all' is the full archive; 'congress' is the current Congress only.
export const OPEN_DATA_TABLES = [
  {
    table: 'members',
    title: 'Members of Congress',
    description: 'Every member of the House and Senate in the BallotWatch database, with their seat and, when serving in the current Congress, the current term.',
    scopes: ['all'],
    primaryKey: ['bioguide_id'],
    foreignKeys: [],
    fields: [
      f('bioguide_id', 'string', 'Biographical Directory ID, e.g. P000197.', { constraints: { required: true } }),
      f('name', 'string', 'Full name as published by Congress.gov.'),
      f('chamber', 'string', 'house or senate (latest known seat).'),
      f('state', 'string', 'Two-letter state or territory code.'),
      f('district', 'string', 'House district number; 0 for at-large; empty for senators.'),
      f('party', 'string', 'Party as published by Congress.gov.'),
      f('caucus', 'string', 'Caucus override for independents in the current term (e.g. D), else empty.'),
      f('serving_current_congress', 'boolean', 'true when the member holds an open term in the current Congress.'),
      f('current_term_start', 'date', 'Start of the open term in the current Congress, else empty.'),
      f('photo_url', 'string', 'Official photo URL, when known.'),
      f('profile_url', 'string', 'BallotWatch member page.'),
      f('source_url', 'string', 'Congress.gov member page.'),
    ],
  },
  {
    table: 'member_terms',
    title: 'Member terms by Congress',
    description: 'One row per member per Congress per term start: chamber, state, district, party, and how the term ended.',
    scopes: ['all'],
    primaryKey: ['bioguide_id', 'congress', 'term_start'],
    foreignKeys: [],
    fields: [
      f('bioguide_id', 'string', 'Biographical Directory ID.', { constraints: { required: true } }),
      f('congress', 'integer', 'Congress number, e.g. 119.', { constraints: { required: true } }),
      f('term_start', 'date', 'First day of this term in this Congress.', { constraints: { required: true } }),
      f('term_end', 'date', 'Last day, when the term ended early or the Congress closed; empty while open.'),
      f('chamber', 'string', 'house or senate.'),
      f('state', 'string', 'Two-letter state or territory code.'),
      f('district', 'string', 'House district; empty for senators.'),
      f('party', 'string', 'Party during this term.'),
      f('caucus', 'string', 'Caucus override for independents, else empty.'),
      f('reason_for_end', 'string', 'Why the term ended early (resignation, death, ...), when known.'),
      f('source', 'string', 'Upstream the row came from (congress_gov, voteview, hand_curated, ...).'),
    ],
  },
  {
    table: 'bills',
    title: 'Bills and resolutions',
    description: 'Bills and resolutions BallotWatch tracks. Placeholder titles (a vote-feed stub like "H.R. 123") are never published: title is empty until the official title is ingested.',
    scopes: ['all', 'congress'],
    primaryKey: ['id'],
    foreignKeys: [],
    fields: [
      f('id', 'string', 'congress-type-number, e.g. 119-hr-1.', { constraints: { required: true } }),
      f('congress', 'integer', 'Congress number.'),
      f('type', 'string', 'hr, s, hjres, sjres, hconres, sconres, hres, or sres.'),
      f('number', 'integer', 'Bill number.'),
      f('title', 'string', 'Official title; empty when only a placeholder is known.'),
      f('introduced_at', 'date', 'Date introduced, when known.'),
      f('policy_area', 'string', 'Congressional Research Service policy area.'),
      f('legislative_stage', 'string', 'Latest stage BallotWatch derives from the bill\'s actions (introduced, committee, passed_house, ...). The latest action text itself is not stored.'),
      f('sponsor_bioguide_id', 'string', 'Primary sponsor\'s Bioguide ID.'),
      f('sponsor_name', 'string', 'Primary sponsor\'s name.'),
      f('sponsor_party', 'string', 'Primary sponsor\'s party.'),
      f('sponsor_state', 'string', 'Primary sponsor\'s state.'),
      f('page_url', 'string', 'BallotWatch bill page.'),
      f('source_url', 'string', 'Congress.gov bill page.'),
    ],
  },
  {
    table: 'bill_cosponsors',
    title: 'Bill cosponsors',
    description: 'Cosponsors of each bill, with the date they signed on and, if they withdrew, when.',
    scopes: ['all', 'congress'],
    primaryKey: ['bill_id', 'bioguide_id'],
    foreignKeys: [{ fields: 'bill_id', reference: { resource: 'bills', fields: 'id' } }],
    optional: true,
    fields: [
      f('bill_id', 'string', 'Bill id, e.g. 119-hr-1.', { constraints: { required: true } }),
      f('bioguide_id', 'string', 'Cosponsor\'s Bioguide ID.', { constraints: { required: true } }),
      f('cosponsored_at', 'date', 'Date the member cosponsored.'),
      f('withdrawn_at', 'date', 'Date the member withdrew, else empty.'),
    ],
  },
  {
    table: 'roll_calls',
    title: 'Roll-call votes',
    description: 'Every recorded roll call with the question, the bill, the yea/nay tally by party, and the result BallotWatch derives from the tally and the question. Tallies that fail the sanity check (empty, or more votes than seats) are left empty, and so is the result.',
    scopes: ['all', 'congress'],
    primaryKey: ['id'],
    foreignKeys: [{ fields: 'bill_id', reference: { resource: 'bills', fields: 'id' } }],
    fields: [
      f('id', 'string', 'chamber-congress-session-roll, e.g. house-119-2-295.', { constraints: { required: true } }),
      f('chamber', 'string', 'house or senate.'),
      f('congress', 'integer', 'Congress number.'),
      f('session', 'integer', 'Session (1 or 2).'),
      f('roll', 'integer', 'Roll-call number within the session.'),
      f('voted_at', 'date', 'Date of the vote.'),
      f('question', 'string', 'The question voted on, as recorded.'),
      f('description', 'string', 'Description of the measure, as recorded.'),
      f('bill_id', 'string', 'Bill voted on, when the vote is on a bill.'),
      f('yea', 'integer', 'Total yea votes (empty when the tally is not sane).'),
      f('nay', 'integer', 'Total nay votes (empty when the tally is not sane).'),
      f('dem_yea', 'integer', 'Democratic (and caucusing independents) yea.'),
      f('dem_nay', 'integer', 'Democratic (and caucusing independents) nay.'),
      f('rep_yea', 'integer', 'Republican yea.'),
      f('rep_nay', 'integer', 'Republican nay.'),
      f('ind_yea', 'integer', 'Other independents yea.'),
      f('ind_nay', 'integer', 'Other independents nay.'),
      f('result', 'string', 'Derived result (Passed, Failed, Cloture invoked, ...); empty when the tally is not sane or the threshold is unknown.'),
      f('page_url', 'string', 'BallotWatch roll-call page.'),
      f('source_url', 'string', 'Official record (clerk.house.gov or senate.gov).'),
    ],
  },
  {
    table: 'votes',
    title: 'Member votes',
    description: 'How each member voted on each roll call: Yea, Nay, Present, or Not Voting.',
    scopes: ['all', 'congress'],
    primaryKey: ['roll_call_id', 'bioguide_id'],
    foreignKeys: [
      { fields: 'roll_call_id', reference: { resource: 'roll_calls', fields: 'id' } },
      { fields: 'bioguide_id', reference: { resource: 'members', fields: 'bioguide_id' } },
    ],
    fields: [
      f('roll_call_id', 'string', 'Roll call id, e.g. house-119-2-295.', { constraints: { required: true } }),
      f('bioguide_id', 'string', 'Member\'s Bioguide ID.', { constraints: { required: true } }),
      f('position', 'string', 'Yea, Nay, Present, or Not Voting.', { constraints: { enum: ['Yea', 'Nay', 'Present', 'Not Voting'] } }),
      f('voted_at', 'date', 'Date of the vote.'),
    ],
  },
]

export const OPEN_DATA_FORMATS = [
  { format: 'csv', ext: 'csv.gz', mediatype: 'text/csv', label: 'CSV (gzip)' },
  { format: 'ndjson', ext: 'ndjson.gz', mediatype: 'application/x-ndjson', label: 'NDJSON (gzip)' },
]

// Stem for a table in a scope: "votes" (full archive) or "votes-119".
export function fileStem(table, scope, congress) {
  return scope === 'congress' ? `${table}-${congress}` : table
}

export function fileName(table, scope, congress, format) {
  const fmt = OPEN_DATA_FORMATS.find((x) => x.format === format)
  if (!fmt) throw new Error(`unknown format ${format}`)
  return `${fileStem(table, scope, congress)}.${fmt.ext}`
}

// Frictionless resource names must be lowercase [a-z0-9._-].
export function resourceName(table, scope, congress) {
  return fileStem(table, scope, congress).replace(/_/g, '-')
}

// Every file a snapshot contains, for a given current Congress. The exporter
// writes exactly these; docs list them; the manifest adds counts and hashes.
export function openDataFiles(congress) {
  const out = []
  for (const t of OPEN_DATA_TABLES) {
    for (const scope of t.scopes) {
      for (const fmt of OPEN_DATA_FORMATS) {
        const path = fileName(t.table, scope, congress, fmt.format)
        out.push({
          path,
          table: t.table,
          scope,
          congress: scope === 'congress' ? congress : null,
          format: fmt.format,
          mediatype: fmt.mediatype,
          encoding: 'gzip',
          url: `${OPEN_DATA_BASE_URL}/${path}`,
        })
      }
    }
  }
  return out
}

export function currentCongress(date = new Date()) {
  return Math.floor((date.getUTCFullYear() - 1789) / 2) + 1
}
