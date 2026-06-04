# AI Explanations

BallotWatch uses AI to make dense legislative records easier to read. AI is not
used as a source of factual truth.

## Inputs

AI explanation functions receive structured data such as:

- Bill title and number.
- Official summary or CRS summary when available.
- Current bill stage.
- Committee routing.
- Roll call question text.
- Deterministic statistics computed by BallotWatch.

## Guardrails

- AI output cannot invent vote counts or percentages.
- Generated explanations are cached with a prompt version.
- Some flows use forbidden-word filters to avoid politically loaded phrasing.
- If generation fails, the app should fall back to deterministic copy.

## Display Standard

AI text should be signaled typographically as editorial marginalia or section-level
disclosure. Do not add per-sentence AI badges.

## Caveats

AI explanations can simplify or omit nuance. Users should be able to open the
source record or methodology page from any AI-assisted section.

## Code References

- `supabase/functions/explain-bill/index.ts`
- `supabase/functions/explain-state-bill/index.ts`
- `supabase/functions/explain-bill-path/index.ts`
- `supabase/functions/narrate-votes/index.ts`
- `src/services/votingPatternNarration.js`
