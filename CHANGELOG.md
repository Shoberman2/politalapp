# Changelog

All notable changes to BallotWatch will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to a 4-digit version (`MAJOR.MINOR.PATCH.MICRO`) scheme.

## [0.1.0.0] - 2026-05-21

### Added

- **Historical Senate chamber visualization** — interactive 100-desk hemicycle showing every senator at their actual desk, scrubble across Congresses 93rd-119th (1973-now). Click any desk to read its history. Famous-desk lineage (Webster's Desk, Candy Desk, Jefferson Davis's Desk) traces senators back to 1836. Routes: `/chamber`, `/chamber/:congress`, `/chamber/:congress/house`, `/chamber/moment/:slug`, `/chamber/methodology`. Gated behind `VITE_SHOW_CHAMBER=true` until visual QA completes.
- **Honest House composition view** — the U.S. House does not have assigned individual seats, so the chamber renders a hemicycle of 435 party-tinted dots with an explicit editorial disclosure rather than fabricating per-seat data.
- **Historic moments overlay** — curated v1 set (Inflation Reduction Act 2022, Affordable Care Act 2009, Iraq War Authorization 2002) re-tints desks by senator vote outcome (Yea / Nay / Not voting) instead of party tint. Full vote data hydrates when the P5 vote backfill completes.
- **Year/Congress scrubber** — drag or click-to-jump across 27 Congresses. Per-Congress fidelity tier ("full record" / "partial record" / "composition only") surfaces as a subtle colored dot below the track. Editorial hint auto-dismisses after first successful scrub.
- **Mobile chamber rendering** — compact hemicycle scaled for 375px viewports with tap-to-reveal senator names and ≥44px invisible touch hit-area expansion. Preserves the spatial story on every viewport.
- **Methodology page** at `/chamber/methodology` — public disclosure of data sources, fidelity-tier semantics, historic-moments curation criteria, and what the chart explicitly does not show.
- **Voteview ICPSR ↔ bioguide crosswalk ingester** (`etl/sources/voteview.ts`) — pulls the UCSD-maintained CSV and seeds `member_id_aliases` so pre-1993 records resolve to canonical bioguide IDs.
- **Historical-backfill ETL orchestrator** (`etl/backfillHistorical.ts`) — resumable long-running CLI for member backfill across 27 Congresses. Sentinel-locks against the daily ETL. Halts after 3 consecutive Congress 5xx errors. Tier-downgrades a Congress to `partial` or `composition_only` per-source.
- **Bill + vote backfill scaffolds** (`etl/backfillBills.ts`, `etl/backfillVotes.ts`) — runnable with `--dry-run` to preview scope and wall-clock estimates. Full implementations wire into the existing `extractIntroducedBills.ts` / `extractHouseVotes.ts` patterns.
- **Hand-curated 119th Senate desk seed data** for Webster's Desk (Sen. Shaheen, D-NH), Jefferson Davis's Desk (Sen. Wicker, R-MS), and Candy Desk. Lineage rows trace each famous desk back to its first modern-tradition assignment.
- **Test infrastructure for the chamber feature** — 4 new test files (16+ tests): CRITICAL regression test for the politicians-terms sync trigger (1000 random inserts, party-switcher, mid-Congress vacancy + appointment, tiebreaker), `congressUtil` Jan 3 boundary handling + ordinal formatting, `fidelity` tier enum coverage, Voteview CSV parser edge cases. 288/288 tests passing.

### Changed

- **`politicians` table is now a "current snapshot" view of `member_congress_terms`** — a Postgres trigger keeps `politicians.party/state/district/chamber` in sync with the most-recent row for each member. Existing single-Congress queries continue to work unchanged; historical queries route through the new join table. The trigger is the safety invariant for the hybrid SOT pattern; the CRITICAL regression test prevents drift after future schema changes.
- **`backfill_state` extended** with `last_completed_congress` and `current_source` nullable columns to support resumable multi-source historical backfills. The daily ETL ignores these columns; only the historical orchestrator writes them.
- **Editorial visual exception for chamber pages** — party-tinted desk fills (10% opacity blue/red over white + saturated 1px border) are introduced as a chamber-specific override of the DESIGN.md "party is metadata, not identity" principle, on the rationale that the Senate floor itself is spatially divided by party. Documented as a Phase 5 DESIGN.md update.

### Migration

- Added `supabase/migrations/008_historical_chamber_schema.sql` — 9 new tables (`member_congress_terms`, `member_id_aliases`, `senate_desks`, `senate_desk_assignments`, `senate_desk_lineage`, `congress_metadata`, `backfill_errors`, `member_reconciliation_log`) with composite PKs (time-ranged where appropriate), 13 supporting indexes, RLS policies for all public-read tables, and seed data: 27 Congresses' worth of `congress_metadata` rows, 100 `senate_desks` rows with arc/side/position structural layout, 3 famous-desk annotations.
- Added `supabase/migrations/009_politicians_terms_sync_trigger.sql` — the hybrid SOT sync trigger plus a one-time backfill seeding `member_congress_terms` from the existing `politicians` rows as 119th-Congress terms (source `p0_seed_from_politicians`).
- Both migrations applied to live Supabase. Verified: 27 congress_metadata rows, 100 senate_desks rows, 550 member_congress_terms rows, 119th congress shows `fidelity_tier='full'`.
