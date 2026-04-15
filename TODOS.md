# TODOs

## Add unit tests for voting dashboard
**Priority:** Medium
**Blocked by:** Nothing (schema fix shipped)
**Context:** The voting dashboard (`VoteDashboard.jsx`) has 5+ distinct rendering states (loading, Supabase data with stats, fallback API data, empty, error) and zero test coverage. `supabaseVotes.js` has 3 query paths that return different shapes depending on which tables have data. One existing test file (`test/computeStats.test.ts`) covers party loyalty math. Vitest is configured but React Testing Library is not installed.
**What to do:** Install `@testing-library/react` and `@testing-library/jest-dom`. Write tests for `supabaseVotes.js` (mock Supabase client, verify all return paths) and `VoteDashboard.jsx` (mock data, verify each rendering state). Match existing test patterns in `test/`.

## ~~Create ETL GitHub Actions cron workflow~~
**Status:** Done — `.github/workflows/etl-daily.yml` exists with daily + weekly schedule.

## Monthly API rate limit counter reset
**Priority:** Low
**Blocked by:** Nothing (api_keys table must exist in live Supabase)
**Context:** API keys track `monthly_count` for rate limiting. The auth middleware resets the count on first request of a new month (by checking `last_reset_at`), so this is not strictly blocking. But a pg_cron job or Supabase scheduled function would keep counts clean for the usage dashboard even when keys aren't actively used.
**What to do:** Add a pg_cron job: `UPDATE api_keys SET monthly_count = 0, last_reset_at = date_trunc('month', NOW()) WHERE last_reset_at < date_trunc('month', NOW())`. Schedule for 1st of each month at 00:00 UTC.

## API usage table partitioning
**Priority:** Low
**Blocked by:** Scale (not needed until 500K+ rows)
**Context:** The `api_usage` table grows with every API request. At scale (100K+ rows/month across all customers), the usage dashboard queries and the `idx_api_usage_key_date` index will slow down. Monthly partitioning keeps each partition small and allows easy cleanup of old data.
**What to do:** When table exceeds ~500K rows, convert to monthly range partitioning on `created_at`. Drop partitions older than 12 months unless customer contracts require longer retention.

## Automate AI Congress simulation via cron
**Priority:** Medium
**Blocked by:** First successful manual simulation run (validate output quality)
**Context:** The AI Congress simulation at `/api/simulation/run` currently requires manual triggering via `curl`. Once output quality is validated (interesting reasoning, credible vote tallies, not just "AI passes everything"), it should run automatically. The existing ETL pipeline in `.github/workflows/etl-daily.yml` is the pattern to follow.
**What to do:** Create `.github/workflows/ai-congress.yml` with a daily cron schedule (8 AM ET). The workflow calls `curl -X POST $VERCEL_URL/api/simulation/run -H "Authorization: Bearer $SIMULATION_API_KEY"`. Store `SIMULATION_API_KEY` in GitHub Actions secrets. Consider adding a weekly schedule initially instead of daily to limit cost.

## Add API endpoint tests
**Priority:** High
**Blocked by:** Nothing
**Context:** The B2B API (api/v1/*) has 12 endpoints and auth middleware with zero test coverage. B2B customers depend on stable API contracts. ~40 test cases needed covering auth middleware (valid/invalid/revoked/rate-limited keys), all endpoint filters, pagination, 404s, and error responses. Vitest is configured.
**What to do:** Create test/api/ directory with auth.test.js, members.test.js, bills.test.js, votes.test.js, stats.test.js. Mock the Supabase admin client. Verify response shapes, status codes, and error handling for every endpoint.
