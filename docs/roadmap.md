# Public Roadmap

This roadmap is intentionally short. It lists public-facing work that makes
BallotWatch more useful, more citeable, and easier to contribute to.

## Shipped

- OpenAPI spec served at `/openapi.yaml`, with sample data shapes in
  `public/data` (v0.6.0.0).
- Keyless public API: GET requests need no key; a free key raises the
  per-minute limit (v0.6.0.0).
- Agent surfaces: `/llms.txt`, an MCP server at `/mcp`, and Markdown views of
  member, bill, and roll-call pages (v0.6.0.0).
- Server-rendered member, bill, and roll-call pages and a sitemap generated
  from the database (v0.6.0.0).
- A member's record in 60 seconds at `/politician/{id}/record`, server-rendered
  and shareable (v0.7.0.0).
- This week on the floor at `/this-week` and `GET /api/v1/floor/schedule`, plus
  the `get_floor_schedule` and `get_member_record` MCP tools (v0.7.0.0).
- Tell your rep: a drafted, editable message with the vote's facts and source,
  sent by you through the member's official contact page (v0.7.0.0).
- Congress.gov and FEC keys moved server-side behind an allow-listed proxy
  (v0.7.0.0).
- Versioned public data snapshots, CC0 1.0: every member, term, bill,
  cosponsorship, roll call, and vote as daily gzip CSV and NDJSON at
  `/data/full/`, with a manifest, a Frictionless data package,
  `GET /api/v1/datasets`, `/llms-full.txt`, and an MCP server card. Shipped,
  pending the first run of `.github/workflows/open-data-export.yml`.

## Now

- Open-source front door: README, license, contribution guide, conduct, security,
  issue templates, citation, and starter issues.
- Public `/open` hub on the website.
- README refresh to match the current product and `DESIGN.md`.

## Next

- Stable methodology pages for source-backed features.
- Data-source and freshness page.
- More API examples for newsroom, classroom, and civic hacking use cases.
- Public correction log.
- Sample notebooks using the public API and data samples.

## Later

- Journalist embeds and cite-this widgets.
- Educator kit for tracing bills and votes.
- "Built with BallotWatch" gallery.
- Contributor recognition page.

## Not Yet

- Redistribution of private or operational tables (accounts, API keys, usage,
  alert subscribers, AI caches). The public congressional tables are
  published daily.
- Community moderation of factual records without maintainer review.
- AI-generated claims without methodology, source grounding, and caveats.
