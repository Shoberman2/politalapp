# E2E tests (Playwright)

Per eng-review D9 — runs against Vercel preview URL on every PR.

## Setup (one-time)

```sh
npm i -D @playwright/test
npx playwright install chromium
```

## Run locally

```sh
# In one terminal:
npm run dev

# In another:
npx playwright test --base-url=http://localhost:5173
```

## Run against a Vercel preview

```sh
PLAYWRIGHT_BASE_URL=https://politicalapp-pr-123.vercel.app npx playwright test
```

## Specs

Per the plan (eng-review D9):

- `sponsor-filter.spec.ts` — full flow: pick sponsor → bills filter → click result → BillDetail loads
- `narrative-cold-start.spec.ts` — visit a fresh bill, assert spinner → narrative appears within 8s budget
- `narrative-degraded.spec.ts` — mock Edge Function failure path, assert structured routing still renders
- `committee-navigation.spec.ts` — click committee name in BillDetail → /committee/:code loads with gloss + bills
- `sponsor-badge.spec.ts` — visit a politician page, assert sponsor count + median copy renders
- `regression-bills-search.spec.ts` — existing title/bill-ID search alongside new sponsor filter
- `regression-bill-detail.spec.ts` — existing AI explanation + tally + actions sections still render

Two skeleton specs (`sponsor-filter.spec.ts` and `regression-bill-detail.spec.ts`)
ship to prove the wiring. The other 5 are TODO — same shape, different selectors.

## Feature flag gating

The sponsor + routing features ship behind `VITE_BILLS_SHOW_SPONSOR_FILTER`
and `VITE_BILLS_SHOW_ROUTING_PANEL`. The Vercel preview deploy needs both
set to `true` for the relevant specs to pass; otherwise the gated UI never
renders and the assertions miss elements.
