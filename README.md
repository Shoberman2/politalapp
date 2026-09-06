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
| Bill Watch alerts | When does a followed bill reach committee, the floor, or a recorded vote? | Congress.gov actions and committee meetings; House weekly floor schedule | Sign in, watch a bill, manage alerts at `/alerts` |
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
- Vote forecast design: `docs/designs/congressional-vote-forecast.md`.
- Forecast provenance gate: `docs/methodology/forecast-data-provenance.md`.
- OpenAPI spec: `docs/api/openapi.yaml`, served at `/openapi.yaml`.
- Agent map: `public/llms.txt`, served at `/llms.txt`.
- Agent front door design record: `docs/designs/agent-front-door-and-tell-your-rep.md`.
- Sample data package: `public/data/datapackage.json`.
- Open-source overview: `docs/open-source.md`.
- Changelog: `CHANGELOG.md`. Backlog: `TODOS.md`.
- ETL guide: `etl/README.md`. iOS app: `ios/README.md`.

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
- Official plain-English explanations as typographic marginalia, not chatbot bubbles.

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
- Vercel CLI (`npm install --global vercel`) for the full-stack local server
- Optional: Congress.gov API key for live ETL
- Optional: Supabase project for full data-backed behavior

### Install

```bash
npm install
cp .env.example .env
vercel link
npm run config:check
npm run dev:fullstack
```

The local app starts at:

```text
http://localhost:3000
```

`npm run dev:fullstack` runs the Vite SPA and Vercel API routes on one origin.
For frontend-only UI work, use `npm run dev` at `http://localhost:5173`;
serverless routes such as `/api/briefings/*`, the server-rendered record
pages, `/mcp`, and `/sitemap.xml` are not available in that mode.

Most UI and docs work can be done without production credentials. Features that
read or write Supabase need configured environment variables.

## Environment

Copy `.env.example` to `.env` and fill in only the services you need.

Required for full app data access:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_CONGRESS_API_KEY=...
```

Vite embeds every `VITE_` value in the browser bundle. The Congress.gov key is
therefore a public, quota-limited client credential in the current SPA
architecture; never reuse it as a private server credential. A server proxy is
required if that key must become private.

Required for ETL:

```env
CONGRESS_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Bill-watch delivery runs from GitHub Actions and reads these repository secrets
(never from `VITE_` variables):

```env
RESEND_API_KEY=...
BILL_ALERTS_FROM_EMAIL=BallotWatch Alerts <alerts@example.org>
```

The signed receipt endpoint runs on Vercel, so set `RESEND_WEBHOOK_SECRET` in
Vercel and register `https://your-site.example/api/webhooks/resend` in Resend.
Set `VITE_PUBLIC_ORIGIN` to the canonical site origin in Vercel and as a
non-secret GitHub Actions repository variable. Action dependencies are pinned to
immutable commits and Dependabot proposes reviewed updates.

The database runtime mode defaults to `off`. Apply the migration, configure the
signed Resend webhook at `/api/webhooks/resend`, validate an internal account,
then advance through `shadow` → `internal` → `public`. The authenticated in-app
watchlist ships by default; `VITE_BILL_ALERTS_ENABLED=false` remains an emergency
UI kill switch. Email controls require `VITE_BILL_ALERT_EMAIL_ENABLED=true` and a
configured delivery runtime. `off` disables ingestion and delivery, `shadow` ingests without sending,
`internal` sends only to allow-listed users, and `public` delivers to all active
follows. The workflow is scheduled every 10 minutes, although GitHub Actions may
delay scheduled runs.

Optional for the keyless public API, `/mcp`, and the generated sitemap (server
side only; `.env.example` lists the defaults):

```env
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
RATE_LIMIT_SALT=...
```

`API_ANON_PER_MINUTE`, `API_ANON_PER_DAY`, `API_FREE_KEY_PER_MINUTE`,
`PRERENDER_TIMEOUT_MS`, and `SITEMAP_PER_MINUTE` override the documented
limits. Set `RATE_LIMIT_SALT` in production; without it anonymous usage rows
omit the IP hash.

Optional services include OpenAI, FEC, OpenSecrets, Stripe, and feature flags.
Never commit `.env`.

## Commands

```bash
npm run dev
npm run dev:fullstack
npm run config:check
npm run config:check:full
npm run build
npm run preview
npm test
npm run test:e2e
npm run test:db
npm run etl:dry-run
npm run alerts:run
npm run forecast:provenance
```

Local end-to-end tests target the full-stack origin on port 3000. Start
`npm run dev:fullstack` in another terminal before running `npm run test:e2e`.
`npm run test:db` runs the local Supabase/Postgres contract suite. The forecast
provenance command deliberately exits nonzero while the documented source gate
is `NO_GO`; it does not enable model training or public forecasts.

`npm run config:check` validates the core browser/server settings, identifies
browser-exposed credential names without printing values, and checks the
connected Supabase Auth provider. Use
`npm run config:check:full` when OpenAI, Stripe, Gmail, and Bill Watch delivery
should all be configured; optional integration gaps are errors in that stricter
mode.

`npm run build` first runs `scripts/sync-openapi.mjs`, which copies
`docs/api/openapi.yaml` to `public/openapi.yaml`. Edit the `docs/` copy only;
`test/api/openapiParity.test.js` fails when the two differ.

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
api/                  Vercel functions: public API (v1), prerender, sitemap, MCP, share cards, briefings
docs/                 Public project docs, roadmap, methodology, OpenAPI
etl/                  Congress.gov extraction, transforms, loaders, backfills
ios/                  Native SwiftUI client on the same Supabase data
public/data/          Sample datasets and datapackage metadata
scripts/              Config check, OpenAPI sync (prebuild), data refresh scripts
server/alerts/        Bill Watch source ingestion, event fan-out, and email delivery
shared/               Shared utilities
src/components/       React views and UI components
src/data/             Static civic data and glossary maps
src/services/         Frontend data services
src/styles/           Component and page styles
supabase/             Schema, migrations, and Edge Functions
test/                 Unit, component, API, ETL, and e2e tests
```

## Public API, llms.txt, and MCP

Hosted API docs live at `/developers/docs`. The OpenAPI source is
`docs/api/openapi.yaml`, served at `/openapi.yaml`.

GET requests need no key: 60 per minute and 5,000 per day per IP. A free key
(sign in at `/developers/keys`, no payment) raises that to 600 per minute. Paid
keys keep their monthly quota. Every response carries `meta.data_updated_at`;
single records carry a `Link: <official source>; rel="canonical"` header.
Keyless 200 responses are CDN-cacheable for five minutes (`Cache-Control:
public, s-maxage=300, stale-while-revalidate=3600`, `Vary: Authorization`);
keyed responses are not cached.

Agent surfaces:

- `/llms.txt` is the machine-readable map of the site, URL patterns, and limits.
- `/mcp` is a stateless Streamable HTTP MCP server with `find_representatives`,
  `get_member`, `get_member_votes`, `get_roll_call`, `search_bills`, `get_bill`,
  and `explain_bill` (cached explanations only).
- Member, bill, and roll-call pages return full HTML without JavaScript and
  answer `Accept: text/markdown` with a compact Markdown record.
- `/sitemap.xml` is generated from the database and lists every member with
  votes, every roll call with a sane tally, and every bill with a recorded vote.

Per-IP limits use Upstash Redis when `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` are set; otherwise an in-memory counter applies per
function instance.

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

Public sample data is available under `public/data`.

### Server-rendered record pages

`api/prerender.js` renders `/politician/:id`, `/bill/:congress/:type/:number`,
and `/vote/:congress/:chamber/:session/:roll` into the built `index.html` shell
so crawlers and agents receive the record and React still takes over in the
browser. Pages that fail the data-quality gate in `api/_lib/indexGate.js`
(placeholder titles, tallies that disagree with member votes, members with no
votes) are served with `noindex` and left out of the sitemap.

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
- Forecast data provenance and release gating

Data corrections should use the source-backed correction issue template. A
correction needs a BallotWatch record, the field that appears wrong, the expected
value, and a public source URL.

## Feature Flags

User-facing features that require staged rollout ship behind env-gated flags:

| Flag | Default | Enables |
| --- | --- | --- |
| `VITE_BILLS_SHOW_SPONSOR_FILTER` | `false` | Sponsor and cosponsor filters, sponsor activity badge |
| `VITE_BILLS_SHOW_ROUTING_PANEL` | `false` | Legislative routing panel, committee route, survival popover |
| `VITE_SHOW_CHAMBER` | `true` | Historical chamber visualization routes; set to `false` as an emergency kill switch |
| `VITE_BILL_ALERTS_ENABLED` | `true` | `/alerts`, the navigation link, and bill-page watch controls; set false only as an emergency kill switch |
| `VITE_BILL_ALERT_EMAIL_ENABLED` | `false` | Shows email controls only after Resend and the public delivery runtime are configured |

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
