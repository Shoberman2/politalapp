# BallotWatch

Congressional voting tracker — React 18 + Vite SPA.

The vote-forecast code is currently a fail-closed data foundation only. Do not
add model training, prediction APIs, market recommendations, or public forecast
UI until `docs/methodology/forecast-data-provenance.md` reports `GO`.

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review

## Public API and agent surfaces

- `docs/api/openapi.yaml` is the OpenAPI source. `public/openapi.yaml` is a
  generated copy (`scripts/sync-openapi.mjs`, run on `prebuild`); never edit it
  by hand. `test/api/openapiParity.test.js` fails when they differ.
- `/politician/:id`, `/politician/:id/record`, `/bill/:congress/:type/:number`,
  and `/vote/:congress/:chamber/:session/:roll` are server-rendered by
  `api/prerender.js` through `vercel.json` rewrites. A new record route needs
  the React route, the rewrite, the sitemap (`api/sitemap.js`), and
  `public/llms.txt`.
- `GET /api/v1/*` and `/mcp` must keep working without a key. Limits live in
  `api/_lib/auth.js` and `api/_lib/rateLimit.js`.
- The browser never holds the Congress.gov or OpenFEC key. It calls
  `/api/proxy/congress/*` and `/api/proxy/fec/*` (`api/proxy/`,
  `api/_lib/upstreamProxy.js`), which allow-list the upstream paths and
  parameters the app uses and rate limit per IP (`api/_lib/proxyRoute.js`).
  A new upstream call needs an allow-list entry. Never give these keys a
  `VITE_` prefix.
- `PLACEHOLDER_TITLE_RE` in `api/_lib/indexGate.js` and `etl/utils.ts` must
  stay identical: the index gate, the sitemap, the ETL loader, and
  `etl/repairPlaceholderTitles.ts` all decide "stub or real title" with it.
  `test/etl/billTitlePreservation.test.ts` asserts parity.
