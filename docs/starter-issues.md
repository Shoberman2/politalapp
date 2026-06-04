# Starter Issues

Use these as GitHub issues or local backlog items. Each one is scoped for a first
or second contribution.

## Documentation

1. Add a Python example that fetches recent Senate votes from `/api/v1/votes`.
2. Add a Node example that finds bills by policy area and writes a CSV.
3. Expand `docs/methodology/ai-explanations.md` with one concrete failure mode.
4. Add a glossary entry for "cloture" and link it from procedural-vote docs.

## Data QA

5. Add a fixture for a member who switched parties mid-term.
6. Verify three committee codes in `etl/data/committees.ts` against public committee pages.
7. Add a test case for an at-large House district.
8. Find one historical member with a missing photo and document a public source candidate.

## Frontend

9. Audit `/open` on mobile and fix any text wrapping issues.
10. Add keyboard-focus tests or manual QA notes for the API docs sidebar.
11. Replace one unclear feature label with the Feature Readability Standard.
12. Add an empty state to a data-heavy page that explains what source is missing.

## API and Tests

13. Add a response-shape test for `/api/v1/search`.
14. Add an auth error test for revoked API keys.
15. Add an OpenAPI example response for `/api/v1/bills/:id`.
