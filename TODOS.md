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

## Move client-side OpenAI calls behind an Edge Function
**Priority:** Medium
**Blocked by:** Nothing (but increases in OpenAI spend from abuse are the trigger)
**Context:** `VITE_OPENAI_API_KEY` is browser-exposed by design of Vite's `VITE_` prefix — anyone viewing page source or devtools can copy it. Today used by `explainBillWithAI` in VoteDashboard and the new voting-pattern narration feature (added 2026-04-17). A scraper can drain the OpenAI account with arbitrary completions. Set a hard monthly spend cap on the OpenAI account as an interim safety net. When worth addressing properly: route all OpenAI calls through a Vercel Edge Function (`/api/ai/narrate`, `/api/ai/explain-bill`) with a per-IP rate limit (e.g., 20 calls/hour) and origin check, then drop the `VITE_` key and use a server-only `OPENAI_API_KEY`.
**What to do:** 1) Add per-IP rate-limit middleware (use Vercel's KV or Upstash). 2) Create `/api/ai/narrate.js` and `/api/ai/explain-bill.js` Edge Functions that proxy OpenAI. 3) Move `votingPatternNarration.js` and `explainBillWithAI` to call these endpoints. 4) Rename env var to `OPENAI_API_KEY` (server-only). 5) Remove `VITE_OPENAI_API_KEY` from `.env.example`.

## Committee votes coverage (phase-2 accountability surface)
**Priority:** Medium (after "go-to place" wedge ships)
**Blocked by:** (a) Wave 1-3 of the go-to-place plan shipping successfully, (b) research spike on committee-report PDF parsing feasibility
**Context:** Most bills die in committee, and committee votes are where real accountability lives — but they're invisible on every current tracker (GovTrack, Congress.gov surface them poorly). Deferred from the 2026-04-20 CEO review (`~/.gstack/projects/Shoberman2-politalapp/ceo-plans/2026-04-20-go-to-place-accountability.md`) because of real data-availability risk: Congress.gov committee data is inconsistent, many committee votes are voice votes with no individual record, and several sources are locked in committee-report PDFs. Strong journalist appeal when it works, but XL effort (human: ~6 weeks / CC+gstack: ~1-2 weeks) with meaningful schedule risk.
**What to do:** Phase 0: research spike — pick 3 committees, sample 1 month of activity, catalogue how many votes are roll calls vs voice vs unavailable. Phase 1: if signal is strong, build ETL for structured committee roll calls (easier subset). Phase 2: PDF parsing for committee reports + voice-vote annotation. Surface committee-level accountability ("Rep voted against bill in committee but for it on floor") as a differentiated editorial feature.

## Refresh district-lean data yearly
**Priority:** Low
**Blocked by:** Daily Kos Elections publishing new data (typically December of election years) AND the static data becoming stale enough to cause wrong "district mismatch" flags
**Context:** `src/data/districtLean2024.js` and `src/data/stateLean2024.js` were imported from Daily Kos Elections 2024 presidential-by-CD data. The "district-lean mismatch" dimension of the voting-pattern analysis (shipped 2026-04-17) uses these to detect when a rep voted against their district's partisan lean. Redistricting, special elections, and partisan drift will slowly decay accuracy starting around 2027. Likely fine until 2028 elections publish fresh data.
**What to do:** When 2028 or 2030 data is available: download the latest Daily Kos spreadsheet (CC BY-SA 4.0), regenerate the two JS files, bump the classifier's cache `schemaVersion` so in-flight caches recompute. Update attribution in UI methodology modal.
