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
The ETL is designed to update records idempotently.

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
