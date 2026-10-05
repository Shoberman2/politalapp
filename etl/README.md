# ETL Pipeline Documentation

This document describes the Extract-Transform-Load (ETL) pipeline that syncs official U.S. congressional vote data from Congress.gov to Supabase.

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Congress.gov  │────▶│     Extract     │────▶│    Transform    │────▶│      Load       │
│       API       │     │                 │     │                 │     │    (Supabase)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
                                                                                │
                                                                                ▼
                                                                        ┌─────────────────┐
                                                                        │   AI Enrich     │
                                                                        │  (Summaries)    │
                                                                        └─────────────────┘
```

## Data Flow

### 1. Extract Phase (`extractHouseVotes.ts`)

**Source**: Congress.gov API v3

**Endpoints Used**:
| Endpoint | Purpose |
|----------|---------|
| `GET /v3/vote/house/{congress}/{year}` | List House roll call votes |
| `GET /v3/vote/senate/{congress}/{year}` | List Senate roll call votes |
| `GET /v3/vote/{chamber}/{congress}/{year}/{rollNumber}` | Vote details |
| `GET /v3/vote/{chamber}/{congress}/{year}/{rollNumber}/positions` | Member vote positions |
| `GET /v3/bill/{congress}/{type}/{number}` | Bill details |
| `GET /v3/member` | Current member list |

**What Gets Extracted**:
- Roll call vote metadata (date, question, result)
- Individual member vote positions
- Associated bill information
- Member details (name, party, state, district)

### 2. Transform Phase (`transform.ts`)

Normalizes raw API data to our database schema.

**Field Mappings**:

#### Politicians Table
| API Field | DB Field | Transformation |
|-----------|----------|----------------|
| `member.bioguideId` | `id` | Direct (primary key) |
| `member.name` | `name` | Direct |
| `chamber` | `chamber` | Lowercase: 'house' or 'senate' |
| `member.state` | `state` | Uppercase 2-letter code |
| `member.district` | `district` | String or null (senators) |
| `member.party` | `party` | Normalized: 'Democrat', 'Republican', 'Independent' |
| (computed) | `photo_url` | `https://bioguide.congress.gov/bioguide/photo/{letter}/{bioguideId}.jpg` |

#### Bills Table
| API Field | DB Field | Transformation |
|-----------|----------|----------------|
| (computed) | `id` | `{congress}-{type}-{number}` e.g., "118-hr-1234" |
| `bill.title` | `title` | Direct; a vote-derived record carries a stub like `HR 1` until the bill detail is fetched |
| `bill.introducedDate` | `introduced_at` | ISO date string, or null until the bill detail has been fetched (never guessed) |
| (AI generated) | `summary` | Plain-English summary |
| (computed) | `source_url` | Congress.gov bill URL |

#### Votes Table
| API Field | DB Field | Transformation |
|-----------|----------|----------------|
| (auto) | `id` | Auto-increment |
| `member.bioguideId` | `politician_id` | Foreign key to politicians |
| (computed) | `bill_id` | Foreign key to bills (nullable) |
| `votePosition` | `position` | Normalized to: 'Yea', 'Nay', 'Present', 'Not Voting' |
| `vote.date` | `voted_at` | ISO date string |
| (computed) | `source_url` | Official vote record URL |

**Vote Position Normalization**:
| Raw API Value | Normalized Value |
|---------------|------------------|
| "Yea", "Aye", "Yes" | "Yea" |
| "Nay", "No" | "Nay" |
| "Present", "P" | "Present" |
| "Not Voting", "NV", "Absent", "" | "Not Voting" |

### 3. Load Phase (`load.ts`)

**Order of Operations** (respects foreign key constraints):
1. Upsert politicians
2. Upsert bills
3. Upsert votes

**Key Behaviors**:
- **Idempotent**: Running multiple times produces the same result
- **Preserves Summaries**: Existing AI summaries are not overwritten
- **Preserves Real Titles and Dates**: A stub title (`HR 1`, `S 12`) from the vote feeds never overwrites a real title already stored, and a stored `introduced_at` is kept when the incoming record has none (`mergeBillRow` / `preferRealTitle`)
- **Batch Processing**: Records processed in batches of 100
- **Error Handling**: Partial failures don't abort the entire load
- **Fails Closed**: Existing bill rows are read per batch of 100. If that read fails, the batch is inserted with `ON CONFLICT DO NOTHING` (new ids only, so roll calls and votes can still land) and the error is reported; nothing already stored is overwritten blind

### 4. CRS Phase (`fetchCRS.ts`)

Runs after the load inside `npm run etl`: up to 50 bills per run, 750ms between Congress.gov calls.

**Selection order** (`selectBillsToEnrich`): placeholder-titled bills first, newest Congress first, then rows missing `crs_summary`, `policy_area`, or `introduced_at`. A bill first seen through a roll call therefore gets its real title, introduced date, and policy area within a run or two instead of waiting behind the archive.

**Writes**: `crs_summary` from `/bill/{congress}/{type}/{number}/summaries` (most recent summary, HTML stripped); `title` (only when the stored one is a stub), `introduced_at`, and `policy_area` from `/bill/{congress}/{type}/{number}`.

### 5. Enrich Phase (`enrichBillsWithAI.ts`)

**Purpose**: Generate human-readable bill summaries using AI.

**Safety Rules**:
- ✅ Generates plain-English bill summaries
- ✅ Generates topic tags (optional)
- ❌ NEVER invents vote data
- ❌ NEVER modifies factual records

**AI Providers** (in order of preference):
1. Anthropic Claude (claude-3-haiku)
2. OpenAI (gpt-4o-mini)

## Running the Pipeline

### Prerequisites

1. **Node.js 20+** installed
2. **Environment variables** configured (see `.env.example`)
3. **Supabase tables** created (see schema below)

### Local Execution

```bash
# Install dependencies
npm install

# Run full pipeline
npm run etl

# Dry run (preview without writing)
npm run etl:dry-run

# Verbose logging
npm run etl:verbose

# Fetch more history
npm run etl -- --days 30

# Only run AI enrichment
npm run etl:enrich
```

### Operator Scripts

`etl/repairPlaceholderTitles.ts` restores the real title, introduced date, and
policy area for bills whose title is a vote-feed stub (`HR 1`, `S 1582`) from
the Congress.gov bill detail endpoint. Idempotent; safe to re-run.

```bash
npx tsx etl/repairPlaceholderTitles.ts --dry-run    # list what would change
npx tsx etl/repairPlaceholderTitles.ts              # voted-on bills only (the pages that matter)
npx tsx etl/repairPlaceholderTitles.ts --all        # every placeholder-titled bill
npx tsx etl/repairPlaceholderTitles.ts --limit 500  # cap Congress.gov calls this run
```

Needs `CONGRESS_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. A run
makes at most 2,000 Congress.gov calls by default (the API allows 5,000 per
hour), stops after 10 consecutive failures, and a later run continues from
wherever the last one stopped. A bill that returns no title from Congress.gov
is logged and left as is. Run against production on 2026-09-06: 476 bills
restored.

`etl/repairVoteSourceUrls.ts` fixes stored roll-call source URLs. Before
October 2026, `getVoteSourceUrl` built House Clerk URLs
(`clerk.house.gov/Votes/{year}{roll}`) from the year the ETL ran, so a 2025
vote (119th Congress, session 1) loaded in 2026 linked to the 2026 roll call
with the same number. The URL now comes from congress + session (session 1 of
Congress N is the year `1789 + 2*(N-1)`, session 2 the year after) through one
helper, `officialRollCallUrl` in `api/_lib/rollCallResult.js`, which the ETL,
the open-data exporter, the API, and the app all call; never derive a record's
year from the clock. Senate URLs already carried congress and session and were
correct.

The script scans `votes` (the only table that stores a roll-call URL;
`roll_calls` and `roll_call_stats` have none) in id order, derives the correct
URL from `roll_call_id`, and rewrites only rows that differ. Rows already
correct and rows without a parseable `roll_call_id` are never touched.

```bash
npx tsx --env-file=.env etl/repairVoteSourceUrls.ts            # dry run (default): counts by chamber and session year, 5 samples
npx tsx --env-file=.env etl/repairVoteSourceUrls.ts --apply    # write, 200 ids per UPDATE
npx tsx --env-file=.env etl/repairVoteSourceUrls.ts --apply --batch-size 100 --after 123456  # smaller batches, resume after an id
```

Needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Each UPDATE is guarded
with `source_url <> expected`, so re-running is a no-op once everything is
fixed; progress lines print the last scanned id, and a failed batch names the
`--after` value to resume from. Server pages, `/api/v1`, MCP and the app
and the open-data export already derive the URL from the roll-call id, so the
repair is for the raw table and anything reading Postgres directly (and for
`persist_historical_roll_call`, which refuses to merge when a stored
`source_url` differs from the one passed in).

`etl/exportOpenData.ts` writes the open-data snapshot (CC0 1.0): members,
member terms, bills, cosponsors, roll calls, and votes as gzip CSV and NDJSON,
full archive plus the current Congress, with `manifest.json` and a
Frictionless `datapackage.json`. Read-only against Postgres; `--upload` writes
to the public Storage bucket `open-data` (created if missing) under `latest/`
and `YYYY-MM-DD/`, keeping 14 dated snapshots.

```bash
npx tsx etl/exportOpenData.ts                  # write ./dist-data only
npx tsx etl/exportOpenData.ts --upload         # and publish to Storage
npx tsx etl/exportOpenData.ts --out /tmp/od --congress 119
```

Needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only.

### GitHub Actions (Automated)

The pipeline runs automatically:
- **Daily** at 6:00 AM UTC (7 days of history)
- **Weekly** on Sundays (30 days of history)
- **Open data** daily at 7:30 AM UTC (`open-data-export.yml`: export and publish
  the bulk files)

Manual trigger available in GitHub Actions with custom parameters.

## Database Schema

```sql
-- Politicians (members of Congress)
CREATE TABLE politicians (
  id TEXT PRIMARY KEY,          -- BioGuide ID (e.g., "A000360")
  name TEXT NOT NULL,
  chamber TEXT NOT NULL,        -- 'house' or 'senate'
  state TEXT NOT NULL,          -- Two-letter state code
  district TEXT,                -- Null for senators
  party TEXT NOT NULL,
  photo_url TEXT
);

-- Bills (legislation)
CREATE TABLE bills (
  id TEXT PRIMARY KEY,          -- e.g., "118-hr-1234"
  title TEXT NOT NULL,
  introduced_at DATE,
  summary TEXT,                 -- AI-generated
  source_url TEXT NOT NULL
);

-- Votes (immutable facts)
CREATE TABLE votes (
  id BIGSERIAL PRIMARY KEY,
  politician_id TEXT NOT NULL REFERENCES politicians(id),
  bill_id TEXT REFERENCES bills(id),
  position TEXT NOT NULL,       -- 'Yea', 'Nay', 'Present', 'Not Voting'
  voted_at DATE NOT NULL,
  source_url TEXT NOT NULL,
  UNIQUE(politician_id, bill_id, voted_at)
);

-- Indexes for common queries
CREATE INDEX idx_votes_politician ON votes(politician_id);
CREATE INDEX idx_votes_bill ON votes(bill_id);
CREATE INDEX idx_votes_date ON votes(voted_at DESC);
CREATE INDEX idx_politicians_state ON politicians(state);
CREATE INDEX idx_politicians_chamber ON politicians(chamber);
```

## Frontend Queries

The ETL output supports these common frontend queries:

### Home Dashboard (User's Representatives)
```sql
-- Get user's House representative
SELECT * FROM politicians
WHERE chamber = 'house' AND state = $state AND district = $district;

-- Get user's Senators
SELECT * FROM politicians
WHERE chamber = 'senate' AND state = $state;
```

### Politician Profile (Recent Votes)
```sql
SELECT v.*, b.title, b.summary
FROM votes v
LEFT JOIN bills b ON v.bill_id = b.id
WHERE v.politician_id = $politicianId
ORDER BY v.voted_at DESC
LIMIT 20;
```

### Search Politicians
```sql
SELECT * FROM politicians
WHERE name ILIKE $searchTerm
   OR state = $state
ORDER BY name;
```

## Troubleshooting

### Common Issues

**"No votes extracted"**
- Congress may not be in session
- Check the date range (default: 7 days)
- Verify CONGRESS_API_KEY is valid

**"Foreign key violation"**
- Ensure politicians/bills are loaded before votes
- Check for missing BioGuide IDs

**"Rate limit exceeded"**
- Congress.gov API has a 5 req/sec limit
- The ETL includes automatic rate limiting

### Logs

Enable verbose logging:
```bash
npm run etl -- --verbose
```

Or set environment:
```bash
export DEBUG=true
npm run etl
```

## API Rate Limits

| API | Limit | Handling |
|-----|-------|----------|
| Congress.gov | 5 req/sec | Built-in 200ms delay |
| OpenAI | Varies | Exponential backoff |
| Anthropic | Varies | Exponential backoff |
| Supabase | 1000 req/sec | Batch processing |

## Security Considerations

1. **Service Role Key**: Only used server-side, never exposed to frontend
2. **AI Prompts**: Designed to prevent vote fabrication
3. **Source URLs**: Every vote links to official government source
4. **No Data Inference**: Missing data is skipped, never guessed
