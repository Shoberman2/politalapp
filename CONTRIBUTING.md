# Contributing to BallotWatch

BallotWatch is an open-source congressional accountability project. Contributions
can be code, documentation, data QA, accessibility testing, API examples,
methodology review, or source-backed corrections.

## Start Here

1. Read `DESIGN.md` before changing any user-facing UI.
2. Read `docs/open-source.md` to understand what is open, what is paid hosted
   infrastructure, and how the public data layer works.
3. Pick an issue labeled `good first issue`, `docs`, `data-qa`, `examples`,
   `accessibility`, `frontend`, `etl`, or `tests`.
4. Keep pull requests focused. One feature or fix per PR is easier to review.

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

For most UI and docs work, placeholder environment values are enough. ETL,
Supabase-backed pages, and hosted API tests need real keys.

## Useful Commands

```bash
npm run dev
npm run build
npm test
npm run test:e2e
npm run etl:dry-run
```

Run the smallest useful verification for your change. If a command needs
private credentials, say so in the PR.

## Contribution Tracks

### Documentation

- Clarify README setup steps.
- Add examples to `docs/api/openapi.yaml`.
- Improve `docs/methodology/*`.
- Add glossary entries for congressional terms.

### Data QA

- Verify source URLs for a bill, vote, committee, or member.
- Add fixtures for known edge cases: party switchers, vacancies, special
  elections, redistricting, or missing photos.
- Report data corrections with a public source URL.

### Frontend

- Match `DESIGN.md`: editorial typography, warm paper background, thin rules,
  restrained accent color, no gradient/blob decoration.
- Keep feature descriptions plain: question answered, source, cadence, caveat,
  next action.
- Test mobile and desktop layouts.

### ETL and API

- Keep loaders idempotent.
- Preserve source-backed facts.
- Never let AI output overwrite factual records.
- Add tests for new schema transforms and public response shapes.

## Pull Request Checklist

- [ ] The change is scoped and described clearly.
- [ ] UI work follows `DESIGN.md`.
- [ ] Public-facing text is readable without congressional jargon.
- [ ] Data or methodology changes cite their source.
- [ ] Tests, build, or a reason they could not be run are included.
- [ ] No secrets, private keys, or raw service-role credentials are committed.

## Data Corrections

Corrections must include:

- The BallotWatch page or record affected.
- The field that appears wrong.
- A public source URL.
- The expected value.
- Any caveat about ambiguity.

Opinion, interpretation, or partisan framing is not a data correction. The
maintainer will close correction requests that do not include source evidence.

## License

Code contributions are licensed under the same license as the repository. See
`LICENSE`. Data snapshots and generated content may have separate source and
redistribution notes in `docs/open-source.md` and `public/data/datapackage.json`.
