# Open BallotWatch

BallotWatch is built as an open civic accountability platform. The goal is not
only to show congressional data, but to make the work inspectable, citeable, and
useful to people who want to build on it.

## What Is Open

- The React application and public API route code.
- ETL scripts that transform official congressional sources.
- Methodology documentation for AI summaries, committee survival, sponsor
  activity, campaign-finance matching, and corrections.
- Public sample datasets in `public/data`.
- API shape in `docs/api/openapi.yaml`.
- Design direction in `DESIGN.md`.

## What Requires Hosted Infrastructure

- Production Supabase data.
- Service-role ETL credentials.
- Stripe billing and subscription state.
- OpenAI-backed explanation generation.
- High-volume hosted API access.

The open-source repo should let someone inspect, run, and extend the project.
The hosted API exists for freshness, uptime, higher volume, support, and managed
infrastructure.

## Who It Helps

| Audience | What they can do |
| --- | --- |
| Voters | Understand who represents them, how members voted, and where bills stand. |
| Journalists | Cite stable pages, inspect methodology, and request source-backed corrections. |
| Researchers | Use sample datasets, API docs, schema notes, and provenance records. |
| Developers | Build against the API or fork the app for civic experiments. |
| Contributors | Improve docs, tests, data QA, accessibility, examples, ETL, and UI. |

## Feature Readability Standard

Every public feature should answer five questions:

1. What question does this help someone answer?
2. What source backs it?
3. How often does it update?
4. What caveat should the user know?
5. What can the user do next?

This keeps congressional data readable without hiding uncertainty.

## Data Snapshots

The files in `public/data` are schema samples, not full production exports. They
exist so developers and researchers can understand the shape of BallotWatch data
without needing a key.

Full public snapshots should be published as versioned releases only after each
source license and redistribution term is reviewed.

## Citation

Use `CITATION.cff` for software citation. When citing data or methodology, cite
the specific page, dataset version, source date, and methodology version.

Suggested text:

> BallotWatch contributors. BallotWatch congressional voting tracker. Accessed
> YYYY-MM-DD. https://www.ballotwatch.io

## Corrections

BallotWatch accepts source-backed correction reports. A correction should include
the page or record, expected value, public source URL, and short explanation.

Corrections are about factual records and methodology, not political agreement.

## Starter Contribution Ideas

- Add an API example in Python, Node, or SQL.
- Improve a methodology page with a missing caveat.
- Add a fixture for a known congressional edge case.
- Validate a committee code or historical member record.
- Fix an accessibility issue on a public page.
- Turn a confusing label into plain English.
