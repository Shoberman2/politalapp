# Committee Survival

Committee survival rate estimates how often bills assigned to a primary
committee advance beyond that committee.

## What It Answers

"How often do bills like this make it out of this committee?"

## Method

- Each bill is counted toward one primary committee.
- The primary committee is the earliest referral. Ties are broken by committee
  code.
- A bill is counted as advanced when routing or legislative-stage data shows
  reported, discharged, markup activity, floor consideration, or a later stage.
- Percentages display only when the committee has enough history for the number
  to be meaningful.

## Caveats

- This is descriptive history, not a prediction.
- Committee referrals can be complex.
- A low survival rate does not mean a bill is unimportant.
- Methodology version changes should be visible in the UI.

## Code References

- `etl/computeCommitteeSurvival.ts`
- `supabase/functions/explain-bill-path/index.ts`
- `src/components/BillRoutingPanel.jsx`
- `src/components/MethodologyModal.jsx`
