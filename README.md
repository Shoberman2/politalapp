# BallotWatch

Open-source congressional accountability tools for voters, journalists,
researchers, educators, and civic developers.

BallotWatch helps people answer plain questions about Congress:

- Who represents me?
- What bills are moving?
- How did a member vote?
- What source backs this number?
- How can I cite, reuse, or correct the data?

The app is a React 18 + Vite single-page application with Supabase-backed data,
Congress.gov ETL, public API routes, methodology docs, and sample civic datasets.

## What You Can Do

| Feature | Question it answers | Source | Next action |
| --- | --- | --- | --- |
| Representative lookup | Who represents this address or district? | Census and congressional member data | Open member profiles |
| Bill tracker | What does this bill do and where is it now? | Congress.gov bill records | Search, filter, cite, share |
| Vote records | How did a member vote? | House and Senate roll call data | Filter by member, bill, date, issue |
| Legislative path | Where does this bill go next? | Committee routing and BallotWatch methodology | Read route and caveats |
| Campaign finance context | What money context is visible? | FEC data and local industry mapping | Inspect donors and caveats |
| API and sample data | How can I build with this? | BallotWatch API, OpenAPI, sample exports | Use `/open` and `/developers/docs` |
| Methodology pages | How was this computed? | Public docs and code references | Audit, cite, or correct |

## Open-Source Surface

- Code license: MIT. See `LICENSE`.
- Contribution guide: `CONTRIBUTING.md`.
- Code of conduct: `CODE_OF_CONDUCT.md`.
- Security reporting: `SECURITY.md`.
- Governance: `GOVERNANCE.md`.
- Citation metadata: `CITATION.cff`.
- Public roadmap: `docs/roadmap.md`.
- Starter issue list: `docs/starter-issues.md`.
- OpenAPI spec: `docs/api/openapi.yaml`.
- Sample data package: `public/data/datapackage.json`.
- Open-source overview: `docs/open-source.md`.

## Product Direction

BallotWatch should feel like an editorial civic reference, not a campaign site
or a SaaS dashboard. The design system lives in `DESIGN.md` and is mandatory for
UI work:

- Warm paper background.
- Instrument Serif headings.
- General Sans body/UI text.
- Geist Mono for data.
- Thin rule lines.
- Restrained civic blue accent.
- Party colors as metadata, not page-dominating surfaces.
- AI explanations as typographic marginalia, not chatbot bubbles.

Read `DESIGN.md` before changing user-facing UI.

## Tech Stack

- React 18
- Vite
- React Router
- Supabase
- Vercel API routes
- Supabase Edge Functions
- Congress.gov ETL
- Vitest
- Playwright

## Local Setup

### Prerequisites

- Node.js 20 or newer
- npm
- Optional: Congress.gov API key for live ETL
- Optional: Supabase project for full data-backed behavior

### Install

```bash
npm install
cp .env.example .env
npm run dev
```

The local app starts at:

```text
http://localhost:5173
```

Most UI and docs work can be done without production credentials. Features that
read or write Supabase need configured environment variables.

## Environment

Copy `.env.example` to `.env` and fill in only the services you need.

Required for full app data access:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Required for ETL:

```env
CONGRESS_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Optional services include OpenAI, FEC, OpenSecrets, Stripe, and feature flags.
Never commit `.env`.

## Commands

```bash
npm run dev
npm run build
npm run preview
npm test
npm run test:e2e
npm run etl:dry-run
```

ETL commands:

```bash
npm run etl
npm run etl:verbose
npm run etl:backfill-sponsors
npm run etl:backfill-historical-routings
npm run etl:compute-survival
```

## Project Structure

```text
api/                  Vercel API routes and hosted API helpers
docs/                 Public project docs, roadmap, methodology, OpenAPI
etl/                  Congress.gov extraction, transforms, loaders, backfills
public/data/          Sample datasets and datapackage metadata
shared/               Shared utilities
src/components/       React views and UI components
src/data/             Static civic data and glossary maps
src/services/         Frontend data services
src/styles/           Component and page styles
supabase/             Schema, migrations, and Edge Functions
test/                 Unit, component, API, ETL, and e2e tests
```

## Public API

Hosted API docs live at `/developers/docs`. The OpenAPI source is
`docs/api/openapi.yaml`.

Main routes:

- `GET /api/v1/members`
- `GET /api/v1/members/:bioguideId`
- `GET /api/v1/members/:bioguideId/votes`
- `GET /api/v1/members/:bioguideId/stats`
- `GET /api/v1/bills`
- `GET /api/v1/bills/:id`
- `GET /api/v1/votes`
- `GET /api/v1/votes/:rollCallId`
- `GET /api/v1/stats`
- `GET /api/v1/search`

Hosted high-volume access uses API keys. Public sample data is available under
`public/data`.

## Data and Methodology

Methodology docs live in `docs/methodology` and on the website under
`/methodology`.

Current topics:

- Data sources
- AI explanations
- Committee survival
- Sponsor activity
- Campaign finance matching
- Corrections

Data corrections should use the source-backed correction issue template. A
correction needs a BallotWatch record, the field that appears wrong, the expected
value, and a public source URL.

## Feature Flags

The bills sponsor and routing features ship behind env-gated flags:

| Flag | Default | Enables |
| --- | --- | --- |
| `VITE_BILLS_SHOW_SPONSOR_FILTER` | `false` | Sponsor and cosponsor filters, sponsor activity badge |
| `VITE_BILLS_SHOW_ROUTING_PANEL` | `false` | Legislative routing panel, committee route, survival popover |
| `VITE_SHOW_CHAMBER` | `false` | Historical chamber visualization routes |

## Contributing

Start with `CONTRIBUTING.md`.

Good first areas:

- Documentation and examples.
- Methodology caveats.
- API examples.
- Accessibility QA.
- Data fixtures.
- ETL edge cases.
- Tests around public response shapes.

## Security

Do not report vulnerabilities in public issues. See `SECURITY.md`.

## License

Code is MIT licensed. See `LICENSE`.

Dataset samples and full future snapshots may have separate source and
redistribution notes because upstream source terms vary.
