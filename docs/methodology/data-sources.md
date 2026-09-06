# Data Sources

BallotWatch uses public civic data sources and records the source behind each
major feature. This page explains the current source map.

## Federal Legislation and Votes

Source: Congress.gov, House and Senate roll call feeds, and related official
legislative records.

Used for:

- Bills.
- Bill actions.
- Member sponsorship.
- Roll call votes.
- Vote positions.
- Committee routing where available.

Caveat: Official sources can change or correct records after initial publication.
The ETL is designed to update records idempotently. Every API response reports
`meta.data_updated_at` (the last successful ETL run), and single records carry
the official `source_url`.

Caveat: The roll-call feeds carry a bill's number but rarely its title or
introduced date. A bill first seen through a vote is stored under a stub title
(`HR 1`) with no `introduced_at` until the Congress.gov bill detail has been
fetched; the ETL never writes a stub over a real title, never guesses a date,
and its daily CRS pass fetches placeholder-titled bills first. Until then the
bill is left out of the sitemap, and it sorts last in the API's bill list and
search.

## Derived Fields

BallotWatch stores the record as ingested. One field is computed rather than
stored: a roll call's result. `api/_lib/rollCallResult.js` (mirrored by
`src/services/floorVotes.js`) derives it from the question text and the tally
using the real thresholds:

- Cloture on a nomination: simple majority. Cloture on legislation: 60 votes.
- Veto overrides and treaty ratification: two-thirds of those voting.
- Suspension of the rules: two-thirds.
- Senate budget-rule waivers: 60 votes.
- Everything else: simple majority; a tie fails.

When the record does not say which threshold applies (for example a cloture
motion with a majority under 60 whose subject is unknown), no result is
asserted. The API and MCP tools label this field `result_derived`.

Caveat: The official result string in the House and Senate XML is not yet
persisted; see the roll-call result item in `TODOS.md`.

## District Lookup

Source: U.S. Census Bureau district geocoding and congressional district data.

Used for:

- Address-to-district lookup.
- Representative matching.

Caveat: Redistricting, vacancies, and special elections can create temporary
ambiguity. BallotWatch should show source freshness where that matters.

## Campaign Finance

Source: Federal Election Commission data.

Used for:

- Campaign finance summaries.
- Donor and industry context.
- Money-vote comparison features.

Caveat: Finance records are not proof of causation. They provide context only.

## State Legislation

Source: LegiScan where configured.

Used for:

- State bill search and summaries.

Caveat: Coverage depends on API availability and project configuration.

## AI Summaries

Source: Structured bill and vote records, plus OpenAI-backed summarization where
enabled.

Used for:

- Plain-English bill explanations.
- Legislative-path narration.
- Voting-pattern narration.

Caveat: AI summaries are explanatory text. They do not replace source records.
