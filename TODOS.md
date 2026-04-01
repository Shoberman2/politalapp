# TODOs

## Add unit tests for voting dashboard
**Priority:** Medium
**Blocked by:** Nothing (schema fix shipped)
**Context:** The voting dashboard (`VoteDashboard.jsx`) has 5+ distinct rendering states (loading, Supabase data with stats, fallback API data, empty, error) and zero test coverage. `supabaseVotes.js` has 3 query paths that return different shapes depending on which tables have data. One existing test file (`test/computeStats.test.ts`) covers party loyalty math. Vitest is configured but React Testing Library is not installed.
**What to do:** Install `@testing-library/react` and `@testing-library/jest-dom`. Write tests for `supabaseVotes.js` (mock Supabase client, verify all return paths) and `VoteDashboard.jsx` (mock data, verify each rendering state). Match existing test patterns in `test/`.

## Create ETL GitHub Actions cron workflow
**Priority:** High
**Blocked by:** Schema migration must be applied to live Supabase first
**Context:** The ETL pipeline (`etl/run.ts`) populates Supabase with voting data but must be run manually. The design doc specifies daily cron at 6 AM ET. Without automation, voting data goes stale after 48 hours and users see a "stale data" banner. The ETL needs 3 secrets: `CONGRESS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Use a separate Congress.gov API key from the frontend to avoid rate limit contention.
**What to do:** Create `.github/workflows/etl.yml` with `schedule: cron: '0 11 * * *'` (6 AM ET = 11 AM UTC). Job: checkout, setup Node, install deps, run `npx ts-node etl/run.ts --days 7`. Add the 3 secrets to GitHub repo settings.
