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
| `bill.title` | `title` | Direct |
| `bill.introducedDate` | `introduced_at` | ISO date string |
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
- **Batch Processing**: Records processed in batches of 100
- **Error Handling**: Partial failures don't abort the entire load

### 4. Enrich Phase (`enrichBillsWithAI.ts`)

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

### GitHub Actions (Automated)

The pipeline runs automatically:
- **Daily** at 6:00 AM UTC (7 days of history)
- **Weekly** on Sundays (30 days of history)

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
