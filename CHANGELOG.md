# Changelog

All notable changes to BallotWatch will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to a 4-digit version (`MAJOR.MINOR.PATCH.MICRO`) scheme.

## [0.8.0.0] - 2026-10-04

### Added

- A "How we get our data" page at `/data-sources`: every source (Congress.gov, the House Clerk, the U.S. Senate, docs.house.gov, the U.S. Census Bureau, the FEC), what we take from each, how often it refreshes, what we compute, and what AI does.
- The homepage and the info pages now arrive as real HTML for search engines and AI answer engines: the latest roll calls, the features, the FAQ, and structured data (Organization, WebSite, FAQPage, Dataset). AI agents can ask for the homepage as Markdown, the sitemap lists the info pages, and `llms.txt` says plainly what BallotWatch is and how to cite it.

### Changed

- New fonts across the site: Bricolage Grotesque for headlines and Hanken Grotesk for text, with Instrument Serif kept for italic accents.
- The front page is simpler: no small labels above each feature, clearer headlines, the record image shows the member's real profile, "How we use AI" is a dark Now / Next / Never section framed as what we're building toward, and the offices band and FAQ are larger and easier to read. The data-sources strip moved to its own page.
- How it works is now four short steps instead of seven paragraphs; Methodology is a clean list of topics; every explanatory page shares one layout.
- The "How we use AI" list matches what the site does: AI explains bills from the official summary and narrates voting patterns from numbers computed first; procedural terms come from a written glossary.

## [0.7.0.0] - 2026-10-04

### Added

- A new front page that answers "How did your representative vote this week?" with the latest real roll call, a ZIP lookup, and one short section per feature (your representatives, votes, bills in plain English, a member's record in 60 seconds, Tell your rep, bill alerts), each with a small image built from live records, plus how AI is and isn't used, an FAQ, and a band for congressional offices.
- A member's record in 60 seconds at `/politician/{id}/record`: the same one-screen card for every member (votes cast, votes missed, the latest recorded votes), server-rendered for search and link previews, with copy/X/Bluesky/Facebook/email sharing. Linked from the ZIP lookup, member pages, and member cards.
- This week on the floor at `/this-week` and on the front page: the House weekly floor schedule beside the latest recorded votes, also available as `GET /api/v1/floor/schedule` (no key needed).
- Tell your rep on every roll-call, bill, and member page: a message that starts with the facts of the vote and the official source, which you edit, copy, and send through your representative's official contact page. BallotWatch never sends it and never stores the text.
- "You wrote; they voted": mark a message as sent and later see, on the bill and member pages and on My Representatives, every vote that member cast on that bill from the day you wrote. Saved on your device only.
- Two MCP tools for AI assistants: `get_floor_schedule` and `get_member_record`.
- A shared site footer on every page, and new How it works, About, Contact, Privacy, Terms, and For offices pages.

### Changed

- The front page no longer opens with a video; all landing videos are removed.
- One button style across the site: sentence case, softer corners, and arrow text links instead of boxed secondary buttons.
- Congress.gov and FEC requests now go through BallotWatch's server, so the API keys are no longer shipped in the website's code. The proxy accepts only the paths and parameters the site uses and is rate-limited per visitor.
- Bill explanations say plainly that they are written with AI from the official summary.

### Fixed

- Montana is treated as two districts everywhere, including My Representatives, which still had it as at-large; at-large states are defined in one place.
- At-large House members are no longer labeled "Delegate", and no page shows "district 0".
- A temporary database error no longer renders a real member as having no recorded votes; the page falls back instead of caching the wrong record.

## [0.6.1.0] - 2026-09-06

### Fixed

- Bill titles no longer vanish after an ETL run. The vote feeds rarely carry a title, so the loader filled in a stub like "HR 1" and wrote it over the real title an earlier run had fetched from Congress.gov; the weekly 30-day re-run on 2026-09-06 did this to 283 voted-on bills, which then dropped out of the sitemap and lost their titles on member and roll-call pages. The loader now keeps an existing real title when the incoming one is a stub, the introduced-bills feed's title wins over a stub, and vote-derived records no longer claim today as their introduced date.
- The loader's read of existing rows was one request for every bill in the run (8,000+ ids); the server dropped the oversized request, the failure was ignored, and each daily run then wrote NULL over `crs_summary` and `policy_area` for every bill it touched. Production held 51 CRS summaries across 182,646 bills when this was found. The read is now per batch of 100, and if it fails the loader inserts only genuinely new bills (ON CONFLICT DO NOTHING) and reports the error instead of overwriting anything.
- The introduced-bills feed no longer passes a bill's latest action date off as its introduced date for the thousands of bills outside the per-run detail budget, so a real introduced date, once stored, is kept. Undated bills sort last in the public bills list and search rather than first.
- The daily CRS pass now picks placeholder-titled bills first (newest Congress first) instead of 50 arbitrary rows from the archive, and writes the introduced date from the bill detail it already fetches, so a bill first seen through a vote heals on its own.
- A repair script (`etl/repairPlaceholderTitles.ts`) restores title, introduced date, and policy area for affected bills from the Congress.gov bill detail endpoint. It was run against production for every voted-on bill: 476 bills restored, none left with a placeholder title.

## [0.6.0.0] - 2026-09-05

### Added

- Every member, bill, and roll-call page now arrives as real HTML. Search engines, link unfurlers, and AI agents that do not run JavaScript get the record (title, tally, every member's vote, JSON-LD, canonical URL) instead of an empty shell; the app still takes over in the browser. Bills with no recorded vote and no official summary keep the app shell.
- A page for every roll call at `/vote/{congress}/{house|senate}/{session}/{roll}`: the question, the bill, the tally and party split, the derived result, an official-record link, and a filterable table of how each member voted. The landing page's floor feed links to it.
- The API answers GET requests without a key: 60 per minute and 5,000 per day per IP, with `Retry-After` and `X-RateLimit-*` headers when the limit is hit. A free key (sign in, no payment) raises that to 600 per minute with no monthly cap. Every response carries `meta.data_updated_at`; single records carry a `Link: <official source>; rel="canonical"` header and a `source_url`.
- An MCP server at `/mcp` (stateless Streamable HTTP) with `find_representatives`, `get_member`, `get_member_votes`, `get_roll_call`, `search_bills`, `get_bill`, and `explain_bill` (cached explanations only), rate-limited like the API.
- Member, bill, and roll-call URLs answer `Accept: text/markdown` with a compact Markdown record for agents.
- `/llms.txt` (a machine-readable map of the site, URL patterns, limits, and citation format), `/openapi.yaml` at a public URL, and a sitemap generated from the database that lists every member with votes, every roll call with a sane tally, and every bill with a recorded vote. `robots.txt` names the AI crawlers that are welcome.
- A "For developers and AI agents" section on `/developers`, a "Get a free key" action on `/developers/keys`, and API docs that describe the keyless tier.

### Changed

- The old Vercel hostname now redirects permanently to `www.ballotwatch.io`, so there is one indexable copy of the site.
- Social share cards for bills point their canonical URL at the bill page and are marked `noindex`, so a bill has exactly one canonical.
- A roll call's derived result now respects the real thresholds: nomination cloture is a simple majority, legislative cloture needs 60, veto overrides and treaties need two-thirds, and Senate budget waivers need 60. When the threshold cannot be told from the record, no result is asserted.
- Pages that fail a data-quality check (placeholder bill titles, tallies that disagree with member votes, members with no votes) are served with `noindex` and left out of the sitemap.

### Fixed

- The H.R. 1 share card no longer describes the wrong bill. A cached explanation is used only when it was generated for the bill as it is titled now.
- Montana is no longer treated as an at-large state in the district lookup; it has had two districts since 2023.
- House members' districts, missing from the roster table, now come from their current term, so titles read "D-CA-11" rather than "D-CA".
- Delegate and resident-commissioner districts (Census codes 98 and 99) resolve to the state's single seat.

### Security

- The B2B API tables (`organizations`, `api_keys`, `api_usage`) had never existed in production, so no API key could ever have validated. They are created by migration, with column-level grants so a signed-in user cannot set their own plan, subscription status, or monthly limit from the browser, and one organization per owner.
- Anonymous usage rows record an HMAC of the caller's IP (`RATE_LIMIT_SALT`), not the address. Rate limits use Upstash Redis when configured and a bounded in-memory counter otherwise.
- The prerender function inserts record text literally (no `$`-pattern expansion), allows only http(s) URLs into links, and never derives its origin from a client-supplied host in production.

## [0.5.0.0] - 2026-09-02

### Added

- Added the fail-closed data foundation for future congressional vote forecasts: versioned vote-target parsing, deterministic pre-vote feature snapshots, source-revision provenance, and an executable 118th-Congress readiness audit.
- Added a dedicated historical roll-call persistence boundary that verifies member identity, effective terms, source tallies, lease fencing, and checkpoint order in one database transaction.
- Added a 63-assertion PostgreSQL verification suite covering atomic writes, idempotent retries, stale workers, append-only evidence, private access controls, cross-runtime hashes, and snapshot integrity.

### Security

- Forecast training evidence is private by default, append-only even under `TRUNCATE`, and writable only through reviewed service-role paths.
- Forecasting remains disabled while the provenance audit is `NO_GO`; no model, prediction endpoint, market recommendation, or public forecast UI is included in this release.

### Migration

- Added `supabase/migrations/20260901214646_forecast_foundation.sql` with target-parse evidence, atomic feature snapshots, completeness markers, compare-and-swap checkpoints, restrictive RLS, and service-only RPCs.

## [0.4.0.0] - 2026-08-17

### Added

- Signed-in users can watch a bill and review its official committee, floor, and recorded-vote activity in BallotWatch. In-app history has its own durable delivery ledger, so it works independently from email and preserves pause/resume behavior.
- Member profiles now pair current-cycle FEC fundraising with record-based voting analysis and Voteview ideology context. The same finance and voting views are available in the native iOS app.

### Changed

- Bill explanations now use only the official Congress.gov CRS summary. BallotWatch no longer guesses provisions from a title or requires model credits to explain legislation.
- Voting-pattern narration is deterministic and sourced from the recorded vote data, so the analysis remains available when external model services are unavailable.
- The iOS app now includes release privacy metadata, safer secret configuration, stronger authenticated-data handling, and a My Representative lookup aligned with the web experience.

### Fixed

- Campaign-finance totals come from the FEC candidate totals endpoint for the active election cycle. A failed FEC request now reads “Unavailable” instead of making a false `$0` claim, and transient failures are not cached.
- Congress.gov requests no longer log credential-bearing parameters, bill-summary fetching uses the dedicated official endpoint, and search/ZIP controls have accessible names on desktop and mobile.
- Bill alerts no longer disappear behind an unset build flag, and their source polling no longer depends on whether email delivery is enabled.

## [0.3.0.0] - 2026-08-06

### Added

- **BallotWatch for iOS** (`ios/`) — a native SwiftUI app reading the same Supabase data as the web app, so both show the same numbers. Find your representative by ZIP or street address, browse every roll call, search 180,000+ bills, and read any member's record. Ships the web design system natively: Instrument Serif, General Sans and Geist Mono are embedded rather than loaded from a CDN, with the full warm-paper and dark palettes. Watching bills and following members work without an account; signing in only syncs them. 43 tests, including smoke tests that drive the real app against the live backend, because the likeliest breakage is a query shape drifting from the schema.

### Fixed

- Senate votes are attributed to the senator who actually cast them. The voter lookup keyed on surname and state, built only from Congress.gov's *current* members, so when a senator was succeeded by someone sharing their surname the predecessor's whole record collapsed onto the successor. Lindsey Graham's votes were being recorded as Darline Graham's: 823 rows on the wrong senator, and 327 roll calls showing two South Carolina senators at once. Those roll calls then failed the 100-seat sanity check, so their tallies were suppressed and the site showed no vote count at all for 37 Senate votes. The lookup now holds every senator who served a seat during the Congress and picks between them by first name and term dates. This also retires a hardcoded patch that existed for the identical bug on the Mullin/Armstrong succession.
- Vote counts are back on the 37 Senate roll calls that had been showing none, including several cloture votes where the outcome now reads correctly.

### Changed

- The methodology page no longer claims Senate roll calls are missing member-level data. Both chambers are at 100% coverage (881/881 Senate, 645/645 House); the claim was a stale note carried over from an earlier ingest gap. Replaced with an explanation of how seat successions are attributed.

## [0.2.1.0] - 2026-07-25

### Fixed

- Senate votes are recorded again. The senator lookup read only the first page of Congress.gov's member list, and that page happens to be entirely House members, so every Senate member position was discarded before it reached the database. Senate roll calls had been landing with no votes attached.
- Vote tallies stay current. The nightly job ran its statistics step last, behind an open-ended step that consumed the remaining time, so on any slow day the job was cut off before tallies were computed and the site kept showing older numbers.
- "See every vote, with the receipts." on the front page shows real bills and real yea-nay counts instead of grey placeholder bars. Tallies now fall back to counting the recorded votes directly when the summary table is behind.
- The "On the floor" feed no longer drops judicial and executive nominations, which were being filtered out before they could be displayed.
- The opening film starts playing on arrival rather than resting on a still frame, and no longer keeps playing in the background after it hands off to the next shot.
- Aggregation steps that read the database in pages now read in a guaranteed order, so rows can no longer be skipped or counted twice.

### Changed

- The opening film is roughly half as long (about four seconds) and a quarter of the download size, so the page is usable sooner.
- The closing section now looks up your representatives where you are, instead of a button that scrolled back to the top. Results appear beside whichever search box you used.
- Buttons across the site have a softer, rounder shape that reads as pressable, while labels and panels stay square.
- The closing bill clip starts when it scrolls into view rather than playing unseen from page load.

### Removed

- The unfinished state-legislature bill browser, which was unreachable from the site.

## [0.2.0.0] - 2026-07-20

### Added

- Private Bill Watch follows with per-bill committee, floor, and recorded-vote preferences, authenticated management at `/alerts`, pause/resume/stop controls, and a 30-day activity history.
- Official-source alert ingestion for Congress.gov bill actions and committee meetings plus the House weekly floor schedule.
- Lease-fenced, crash-resumable event fan-out; frozen email outbox payloads; retry-safe Resend delivery; signed webhook receipts; correction eligibility; suppression handling; and staged `off`, `shadow`, `internal`, and `public` runtime modes.
- Pinned Bill Watch GitHub Actions scheduling, Dependabot, CODEOWNERS, open-source security guidance, configuration validation, and alert-specific regression coverage.

### Changed

- Hardened existing GitHub Actions by pinning third-party actions to immutable commit SHAs.
- Improved chamber deep links, historical labels, delegate counts, clipboard fallback, photo attribution, public-asset routing, dark-mode documentation contrast, and bill-list request efficiency.
- Aligned local full-stack configuration and Vercel request adapters while making browser-exposed credentials explicit.

### Fixed

- Preserved raw Stripe webhook request bodies for signature verification and added signed-request regression coverage.
- Removed hardcoded frontend API fallbacks and documented provider-owned configuration that must remain outside the open-source repository.

### Migration

- Added `supabase/migrations/20260720203000_add_bill_watch_alerts.sql` with private follows and preferences, immutable evidence and events, fenced source runs, resumable fan-out, delivery queues and receipts, RLS, service-only RPCs, and retention controls.

## [0.1.2.0] - 2026-06-10

### Changed

- Simplified the landing page from nine sections to five: a full-bleed Capitol hero with a word-by-word animated Jefferson quote, a centered ZIP-code representative lookup, a live "On the floor" ticker, a closing call to action, and a one-line colophon footer.
- The ZIP lookup now resolves your state (and district, for at-large states) inline and hands off to the representative page with your location prefilled — no account needed.
- The stats line now shows live counts of members tracked, bills indexed, and roll calls from the database instead of static numbers.
- The floor ticker now streams the latest congressional actions from Congress.gov instead of sample copy.

### Removed

- The landing page's dateline strip, stats ribbon, workbench, data-sources ledger, features matrix, correction desk, and articles sections.

## [0.1.1.1] - 2026-06-04

### Added

- Shared broadsheet chrome with a route-aware masthead, dark-mode toggle, and open-source footer for the redesigned public pages.
- Member Register composition bars, leadership filter, member photo cards, sticky search, quick chips, and load-more paging.
- Bills Desk facets for status, policy area, chamber, and sorting, with clearer source/date/status metadata for each bill row.

### Changed

- Reworked the landing page into a civic front page with a dateline, floor rail, source ledger, readable feature matrix, correction workflow, and open-source calls to action.
- Restyled the Bills and Members indexes around the editorial design system instead of generic card grids and SaaS-style navigation.
- Normalized the redesigned typography to fixed editorial type steps with responsive breakpoints instead of viewport-scaled font sizes.
- Updated the open-source pages to use the same type discipline as the redesigned app surfaces.

### Fixed

- Replaced clickable anchor elements without destinations in redesigned rows, cards, and footer links with semantic buttons or router links.
- Updated sponsor-filter e2e selectors to match the new Bills Desk result list and filter count classes.

## [0.1.1.0] - 2026-06-03

### Added

- **Open-source public hub** at `/open` with contribution paths, public sample data links, methodology links, GitHub entry points, and source-backed correction guidance.
- **Methodology library** at `/methodology` and `/methodology/:slug` covering data sources, AI explanations, committee survival, sponsor activity, campaign-finance matching, and corrections.
- **Open-source repository front door**: MIT license, contribution guide, code of conduct, security policy, governance notes, citation metadata, issue templates, PR template, and OpenSSF Scorecard workflow.
- **Open data artifacts**: OpenAPI 3.1 spec, public Data Package metadata, sample member/bill/roll-call/committee CSVs, and sample vote JSON for no-key prototyping.
- **Public roadmap and starter issues** for docs, data QA, frontend, API, accessibility, and test contributions.

### Changed

- Reframed the landing page around BallotWatch as open-source congressional accountability infrastructure, while preserving the voter-first representative lookup path.
- Updated navigation, footer, API docs, developer portal, and methodology modal so open source, sample data, and methodology are first-class paths through the site.
- Rewrote README to match the current product, design system, API surface, methodology docs, and contribution model.
- Removed stale client-side OpenAI key guidance from `.env.example`; OpenAI keys are server-side only.

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
