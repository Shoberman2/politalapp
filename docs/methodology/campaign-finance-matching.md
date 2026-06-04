# Campaign Finance Matching

BallotWatch links campaign finance context to member profiles and selected vote
analysis. The goal is context, not causation.

## What It Answers

"What campaign finance context might help a reader understand this member or
issue area?"

## Sources

- Federal Election Commission records.
- BallotWatch industry mapping in `src/data/industryMap.js`.

## Method

- Match member names and states to candidate records.
- Aggregate donation records where a candidate match is available.
- Map industries to policy areas through a curated local mapping.
- Present money-vote relationships as context, not proof.

## Caveats

- FEC names and committee structures can be messy.
- Industry mapping is curated and should be reviewed over time.
- Donations do not prove why a member voted a certain way.

## Code References

- `src/services/donations.js`
- `src/data/industryMap.js`
- `src/components/DonationComparison.jsx`
