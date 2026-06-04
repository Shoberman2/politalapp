# Sponsor Activity

Sponsor activity counts bills where a member is the primary sponsor.

## What It Answers

"How active is this member as a primary bill sponsor in the current Congress?"

## Method

- Count bills where the member is the primary sponsor.
- Use the current Congress unless the UI says otherwise.
- Compare against chamber medians where available.
- Exclude freshmen and very recent replacements from median pools when needed to
  avoid misleading denominators.

## Caveats

- Bill count is not legislative effectiveness.
- One major bill and ten symbolic resolutions are counted differently by impact
  but similarly by simple volume.
- Cosponsorship is a separate behavior and should not be collapsed into primary
  sponsorship.

## Code References

- `src/components/SponsorActivityBadge.jsx`
- `src/components/SponsorFilterPill.jsx`
- `etl/backfillSponsorAndRoutings.ts`
