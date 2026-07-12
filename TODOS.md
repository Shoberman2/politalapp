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

## ~~Move client-side OpenAI calls behind an Edge Function~~
**Completed:** 2026-05-19 — all three browser-side OpenAI callers now route through Supabase Edge Functions: federal bill explanation via `explain-bill` (already done before this session), voting-pattern narration via `narrate-votes` (new), state-bill explainer via `explain-state-bill` (new). `VITE_OPENAI_API_KEY` is no longer read anywhere in `src/`. Per-IP rate limiting and origin checks were NOT implemented — that's a separate hardening pass once abuse signal appears. The interim safety net (a hard monthly spend cap on the OpenAI account) is still recommended.

## Committee votes coverage (phase-2 accountability surface)
**Priority:** Medium (after "go-to place" wedge ships)
**Blocked by:** (a) Wave 1-3 of the go-to-place plan shipping successfully, (b) research spike on committee-report PDF parsing feasibility
**Context:** Most bills die in committee, and committee votes are where real accountability lives — but they're invisible on every current tracker (GovTrack, Congress.gov surface them poorly). Deferred from the 2026-04-20 CEO review (`~/.gstack/projects/Shoberman2-politalapp/ceo-plans/2026-04-20-go-to-place-accountability.md`) because of real data-availability risk: Congress.gov committee data is inconsistent, many committee votes are voice votes with no individual record, and several sources are locked in committee-report PDFs. Strong journalist appeal when it works, but XL effort (human: ~6 weeks / CC+gstack: ~1-2 weeks) with meaningful schedule risk.
**What to do:** Phase 0: research spike — pick 3 committees, sample 1 month of activity, catalogue how many votes are roll calls vs voice vs unavailable. Phase 1: if signal is strong, build ETL for structured committee roll calls (easier subset). Phase 2: PDF parsing for committee reports + voice-vote annotation. Surface committee-level accountability ("Rep voted against bill in committee but for it on floor") as a differentiated editorial feature.

## Cross-rep procedural pattern stat
**Priority:** P2 (Medium)
**Blocked by:** "Explain procedural votes" plan shipping (creates the `roll_calls` table this depends on)
**Context:** Deferred cherry-pick from 2026-05-03 CEO review (`~/.gstack/projects/Shoberman2-politalapp/ceo-plans/2026-05-03-explain-procedural-votes.md`). Once procedural votes are classified and stored in `roll_calls`, compute per-rep procedural-vote behavior diffs vs. party median: e.g., "Senator X votes Yea on cloture 3% above party median" or "Rep Y votes to recommit 18% more than the House median." Reuses the voting-pattern analysis ranking pattern (deterministic computation, AI narration on top). Held out of the explain-procedural-votes scope because it's a standalone feature that overlaps the voting-pattern analysis surface — better as its own focused PR.
**What to do:** After `roll_calls` ships: (1) compute per-rep procedural vote stats grouped by `procedural_action` (cloture, motion-to-recommit, motion-to-table). (2) Compute party-median baseline. (3) Surface notable diffs (e.g., >2 std-dev) in the existing voting-pattern analysis section on PoliticianDetail, or as a new "Procedural behavior" stat block. (4) AI narration uses the same prompt safety guardrails as the procedural-vote narration. Effort: M (human ~1 week / CC ~2 hrs).

## Periodically re-narrate procedural votes after prompt improvements
**Priority:** P3 (Low)
**Blocked by:** "Explain procedural votes" plan shipping AND first meaningful prompt v2 iteration
**Context:** From 2026-05-03 CEO review L2 (operational debt). The `roll_calls.ai_explanation` is generated once per row with `generated_at` tracking. When the procedural narration prompt is improved meaningfully, older rows have stale narration. Without an explicit re-narrate path, only new roll calls benefit from prompt improvements.
**What to do:** Add a CLI flag to `etl/run.ts` or a separate `etl/renarrate.ts` script: `npm run etl:renarrate -- --since=YYYY-MM-DD` re-narrates all significant roll calls with `generated_at < since`, honoring the same per-run budget cap (3000 calls). Cheap to add (~50 lines) once the underlying enrichRollCalls.ts exists.

## Migrate touched JS service files to TypeScript
**Priority:** P3 (Low)
**Blocked by:** Nothing
**Context:** Surfaced in 2026-05-03 plan-eng-review of the procedural votes plan. The new `src/services/rollCalls.js` and the modified `src/services/supabaseVotes.js` carry implicit type contracts (the joined roll_call shape, the `significance_signals` JSONB shape, the glossary entry shape with `category` field) that would benefit from TypeScript types. Existing project convention is JS + JSDoc, so this is a deliberate deferred decision, not an oversight.
**What to do:** Convert `src/services/rollCalls.js`, `src/services/supabaseVotes.js`, and `src/data/proceduralGlossary.js` to `.ts`. Define shared `RollCall`, `SignificanceSignals`, `GlossaryEntry` types in `src/types/`. No runtime change. Effort: M (human ~6 hrs / CC ~30 min). Trigger: when adding new files to these services or after a roll_call-shape-related bug.

## Configure gstack design binary OPENAI_API_KEY
**Priority:** P3 (Low)
**Blocked by:** Nothing
**Context:** Surfaced in 2026-05-03 plan-design-review. The gstack `design` binary at `~/.claude/skills/gstack/design/dist/design` returned 401 when generating procedural-vote-card mockups. Without a working API key, /plan-design-review and /design-shotgun fall back to text-only review and lose the highest-leverage design tool (visual mockup generation, comparison boards, vision quality checks).
**What to do:** Run `~/.claude/skills/gstack/design/dist/design setup` to configure the OPENAI_API_KEY (or wherever the gstack designer reads its credentials). Verify with `~/.claude/skills/gstack/design/dist/design generate --brief "test card with red button" --output /tmp/test.png`. Effort: human ~5 min / CC ~2 min.

## Refresh district-lean data yearly
**Priority:** Low
**Blocked by:** Daily Kos Elections publishing new data (typically December of election years) AND the static data becoming stale enough to cause wrong "district mismatch" flags
**Context:** `src/data/districtLean2024.js` and `src/data/stateLean2024.js` were imported from Daily Kos Elections 2024 presidential-by-CD data. The "district-lean mismatch" dimension of the voting-pattern analysis (shipped 2026-04-17) uses these to detect when a rep voted against their district's partisan lean. Redistricting, special elections, and partisan drift will slowly decay accuracy starting around 2027. Likely fine until 2028 elections publish fresh data.
**What to do:** When 2028 or 2030 data is available: download the latest Daily Kos spreadsheet (CC BY-SA 4.0), regenerate the two JS files, bump the classifier's cache `schemaVersion` so in-flight caches recompute. Update attribution in UI methodology modal.

## Quarterly committee glossary review
**Priority:** P3 (Low)
**Blocked by:** First quarter after the bills-sponsor-and-routing PR ships
**Context:** From 2026-05-16 CEO review of the sponsor-search + legislative-path explainer. The new `etl/data/committees.ts` glossary is a hand-curated ~160-entry map of committees + subcommittees to one-sentence "what they do" glosses. Subcommittees rename, reorganize, and split every Congress. The runtime `unknown_committee_codes` table catches new codes encountered in the wild — but only quarterly review keeps the existing entries accurate.
**What to do:** Once per quarter: (1) `SELECT * FROM unknown_committee_codes ORDER BY occurrence_count DESC` — add the top entries to `committees.ts`. (2) Diff `committees.ts` against current House Rule X and Senate Rule XXV jurisdictions; update glosses that no longer match. (3) Confirm subcommittee codes are still valid; mark renamed ones. (4) Bump `methodology_version` on `committee_survival_stats` if the primary-committee attribution rules changed. Effort: human ~1 hour / CC ~10 min.

## Sponsor leaderboard page
**Priority:** P3 (Low)
**Blocked by:** Bills-sponsor-and-routing PR shipping (creates the `bills.sponsor_bioguide_id` data this depends on)
**Context:** Deferred from 2026-05-16 CEO review. Once sponsor data is persisted, a "top 10 most active sponsors on healthcare / defense / etc." page becomes possible. Helps non-expert users discover whose voices matter most on a topic they care about. Aggregates the per-rep sponsor counts (already on PoliticianDetail via D6) into a topic-pivoted leaderboard. Methodology disclosure required (bill count is a notoriously gamed metric — see [[sponsor-count-attackability]]).
**What to do:** New `/sponsors` page or extension to `/all`. Group `bills` by `policy_area` + `sponsor_bioguide_id`; rank by count. Include the same "median + methodology disclosure" framing from the sponsor activity badge (no percentile, no "effectiveness" implication). Effort: human ~3 days / CC ~30 min.

## Subscribe-to-sponsor notifications
**Priority:** P3 (Low)
**Blocked by:** Bills-sponsor-and-routing PR shipping AND any auth-tied notification primitive
**Context:** Deferred from 2026-05-16 CEO review. Users who care about a specific rep would value "notify me when Senator X introduces a new bill." Reuses the daily ETL detection of new bills + the sponsor data. Needs: an email-send primitive (Resend or Supabase Edge Function), a `sponsor_subscriptions(user_id, bioguide_id)` table, daily diff of new bills per subscribed sponsor. RSS feed alternative for users who don't want email.
**What to do:** Pick channel (email vs RSS vs both). Build the subscription table + UI on PoliticianDetail. Hook the daily ETL to emit notifications for new sponsored bills per subscriber. Effort: human ~1 week / CC ~2 hours.

## Phase 2 — full fate predictor (Approach C)
**Priority:** P2 (Medium)
**Blocked by:** Bills-sponsor-and-routing PR shipping AND enough live engagement data to know whether the survival-stat pill resonates (track via `feature_metrics.survival_pill_opened`)
**Context:** Deferred from 2026-05-16 CEO review per outside-voice tension D14. The bills-sponsor-and-routing PR ships a "taste" of fate prediction via the per-primary-committee survival stat on the status pill hover. Approach C is the full version: combine committee survival × sponsor track record × cosponsor breadth × amendment activity × time-since-referral into a single calibrated "% chance of advancing" forecast. The most attackable feature in the whole product if done badly. Needs methodology paper.
**What to do:** (1) Wait for engagement data on the survival pill (Q3 2026 likely). (2) If signal is strong, write a methodology white paper before code: feature engineering, train/test split (predict 119th from 117th+118th), calibration plot, comparison vs GovTrack prognosis. (3) Build the predictor as a periodically-recomputed score in a new `bill_predictions(bill_id, p_advance, model_version, computed_at)` table. (4) UI: replace the single-stat pill hover with a full "Forecast" subsection on BillDetail. Effort: human ~4-6 weeks / CC ~4-6 hours. Strong eval suite + bias audit mandatory.

## Senate desk drawer inscriptions (E2)
**Priority:** P3 (Low)
**Blocked by:** Historical Congress Chamber feature (2026-05-21 CEO plan) Phase 5 shipping AND engagement signal on the chamber chart
**Context:** Deferred during 2026-05-21 CEO review cherry-pick ceremony. Senators inscribe their names inside the desk drawer when they leave; Webster's desk has signatures going back nearly two centuries. Surfacing these — even just modern, photographable ones — turns the chamber chart from a civic-tech-novelty into an editorial artifact with a real "wow" moment. Sourcing risk: photo permissions, transcription accuracy, Senate Historical Office cooperation.
**What to do:** (1) Contact Senate Historical Office about permissions for desk-drawer photography. (2) Identify ~15 famous-desk photos already in public-domain Senate archives. (3) Build a `senate_desk_inscriptions(desk_id, bioguide_id, photo_url, transcription, year)` table. (4) Add inscription gallery to lineage panel. Effort: human ~1 week / CC ~45 min. High differentiation, real sourcing risk.

## Career arcs on PoliticianDetail (E5 — auto-follow-up from historical archive)
**Priority:** P2 (Medium)
**Blocked by:** Historical Congress Chamber Phase 1 (member backfill) landing in production
**Context:** Auto-follow-up from 2026-05-21 CEO review. Once `member_congress_terms` is populated, "plot every desk this senator sat in across their career, or for House: every term + party block, on a single chamber view" becomes a near-trivial extension. Sits naturally as a new section on `PoliticianDetail.jsx` between voting-pattern analysis and campaign finance. Strong editorial moment for senior members (Schumer, McConnell, Sanders, Leahy).
**What to do:** New `CareerArc` component reading from `member_congress_terms` + `senate_desk_assignments`. Render as a small chamber-shaped sparkline showing desks held across Congresses. Click any era to deep-link to that Congress's chamber view. Effort: human ~3 days / CC ~30 min.

## AI explanations for top-traffic historical bills (E7)
**Priority:** P2 (Medium)
**Blocked by:** Historical Congress Chamber Phase 2 (bill backfill) shipping AND 6-12 weeks of engagement signal showing which historical bills get traffic
**Context:** Deferred during 2026-05-21 CEO review cherry-pick ceremony. Approach B explicitly out-of-scoped AI explanations on all 280K-350K historical bills (~$500-$2000 OpenAI cost on bills with Pareto-distribution traffic). Selective approach: traffic-driven backfill of explanations for the top ~500 most-viewed historical bills after live signal exists. Reuses existing `bill_explanations` server-side cache pattern.
**What to do:** (1) Instrument `BillDetail.jsx` to record pageview counts per (bill, time-period) in a `bill_pageviews` rollup table. (2) Wait 6-12 weeks post-Phase-2 launch. (3) Run a one-shot `etl/backfillHistoricalExplanations.ts` that explains top-500 by traffic. Bounded cost: ~$15-50. (4) Optional: monthly cron to extend coverage as new bills accumulate traffic. Effort: human ~3 days / CC ~1 hr + ~$15-50 OpenAI.

## Extend Senate desk lineage beyond famous desks (full 100)
**Priority:** P3 (Low)
**Blocked by:** Historical Congress Chamber Phase 5 shipping AND Senate Historical Office data acquisition for non-famous desks
**Context:** Deferred during 2026-05-21 CEO review. The v1 lineage covers ~15 famous desks tracked by Senate Historical Office (Webster, Clay, candy desk, etc.). Extending to all 100 is purely additive but requires sourcing the historical occupant chain for the other 85 desks — typically requires per-Congress assignment-chart cross-referencing. With CC, this is mechanical but tedious.
**What to do:** (1) Cross-reference `senate_desk_assignments` rows by `desk_id` ordered by `congress` ASC. (2) Validate the lineage chain has no gaps where data exists. (3) Hand-curate gaps using public Senate Historical Office data. (4) Populate `senate_desk_lineage` for all 100 desks, not just the famous 15. Effort: human ~1 week / CC ~2 hrs (most work is data validation, not code).

## Photo coverage stretch for historical members
**Priority:** P3 (Low)
**Blocked by:** Historical Congress Chamber Phase 1 (member backfill) shipping AND engagement signal showing historical-member profiles get traffic worth the photo-sourcing effort
**Context:** Deferred during 2026-05-21 CEO review. Phase 1 of the historical archive ships with silhouette placeholders for the ~5-15% of historical members where Congress.gov returns no photo. This is the same problem recently addressed for current members (commits e0b5592, d1fbe3d), but historical coverage will be thinner. Stretch enhancement: scrape Wikipedia + Library of Congress Bioguide photos to fill gaps.
**What to do:** (1) Query for members with `photo_url IS NULL` in `members` after Phase 1. (2) For each, attempt: Library of Congress Bioguide API → Wikipedia (etiquette: low rate, attribution) → state-archive sources. (3) Validate license + add attribution metadata to a new `member_photo_source` column. (4) Surface attribution in the `MethodologyModal`. Effort: human ~1 week / CC ~3 hrs (most work is license validation + per-source rate-limit handling).

## Quarterly identity-reconciliation review (operational)
**Priority:** P3 (Low)
**Blocked by:** Historical Congress Chamber Phase 1 shipping
**Context:** From 2026-05-21 CEO review operational debt (Section 8 observability). The `member_reconciliation_log` table accumulates rows whenever the multi-source ETL hits a conflict between Congress.gov + GovInfo + Senate Historical Office data. Without quarterly review, conflicts pile up and silent data-drift sets in. Pattern matches the existing "Quarterly committee glossary review" TODO.
**What to do:** Once per quarter: (1) `SELECT * FROM member_reconciliation_log WHERE resolved = false ORDER BY occurrence_count DESC` — review top conflicts. (2) For each, decide: (a) update precedence rule, (b) hand-curate the canonical record, (c) escalate to feature-flag-off for that Congress's chart if structural. (3) Mark resolved with reason. Effort: human ~1 hour / CC ~10 min.

## Enable Google sign-in in Supabase
**Priority:** High
**Category:** Functional / configuration
**Blocked by:** A user-owned Google OAuth web client ID and client secret
**Context:** QA ISSUE-010 reproduced `400 Unsupported provider` from `/auth?next=/briefings`. The linked Supabase project is healthy, but its auth settings report `external.google=false`; no Google OAuth credentials are present locally or in Vercel.
**Repro:** Start the full stack with `npm run dev:fullstack`, open `/briefings`, choose `Send to Gmail`, and click `Continue with Google`.
**What to do:** Create or select a Google OAuth web client, authorize `https://dbtbmjjjcfwobhlicduk.supabase.co/auth/v1/callback`, add the local and production web origins, configure the client ID and secret in Supabase Auth, then enable Google. Confirm `npm run config:check` no longer warns and complete the browser sign-in flow.

## Configure Gmail briefing delivery
**Priority:** High
**Category:** Functional / configuration
**Blocked by:** User-owned Google OAuth credentials and production secret values
**Context:** `npm run config:check:full` reports Gmail delivery as incomplete. Core app configuration passes, but briefing authorization and scheduled delivery cannot work without the server-only Gmail credentials.
**Repro:** Run `npm run config:check:full`.
**What to do:** Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_REDIRECT_URI`, `GMAIL_TOKEN_ENCRYPTION_KEY`, and `CRON_SECRET` in the appropriate local and Vercel environments. Register the exact callback URI, then verify connect, callback, encrypted token persistence, and a delivery run end to end.

## Configure Stripe subscriptions
**Priority:** High
**Category:** Functional / configuration
**Blocked by:** User-owned Stripe account keys, a Price, and a webhook endpoint
**Context:** `npm run config:check:full` reports subscriptions as incomplete. The webhook now handles the Vercel Node runtime correctly, but checkout and subscription lifecycle events cannot work without Stripe configuration.
**Repro:** Run `npm run config:check:full`.
**What to do:** Configure `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_ID`; register the production webhook endpoint; then verify checkout, signature validation, renewal, cancellation, and entitlement updates in Stripe test mode.

## Rotate the historically committed Congress.gov browser key
**Priority:** High
**Category:** Security / configuration
**Blocked by:** Access to the Congress.gov API account that owns the key
**Context:** QA removed checked-in Congress.gov fallback values from frontend and server code, and runtime configuration now requires environment-owned values. Because a key existed in repository history, removing the fallback does not revoke the historical credential. The current SPA calls Congress.gov directly, so `VITE_CONGRESS_API_KEY` is intentionally embedded in the browser and must be treated as public and quota-limited rather than as a server secret.
**Repro:** Inspect repository history for the removed non-empty Congress.gov fallback; do not print or reuse the value.
**What to do:** Revoke or rotate the key with Congress.gov, update the server and browser environment values, and confirm `npm run config:check`, build, and bill-loading smoke tests pass. Monitor the 5,000-request/hour quota. If the replacement must remain private, first proxy Congress.gov calls through a server route and remove `VITE_CONGRESS_API_KEY` from the frontend architecture.
