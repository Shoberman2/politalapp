// Kept apart from shared/billExplainer.js (server only) so the browser
// bundle gets the byline without the explainer.

// The byline every surface prints under an explanation: what the model read.
// "Written by AI from the bill’s official text (Introduced in House, Jan 20, 2026)."
export function explanationSourceLine(src) {
  if (!src?.kind) return 'Written by AI from official records. Nothing is guessed from the title.'
  if (src.kind === 'crs-summary') return 'Written by AI from the official Congressional Research Service summary. Nothing is guessed from the title.'
  const date = src.date ? new Date(src.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null
  const version = [src.label, date].filter(Boolean).join(', ')
  const what = src.kind === 'bill-text-partial' ? 'the outline and opening of the bill’s official text' : 'the bill’s official text'
  return `Written by AI from ${what}${version ? ` (${version})` : ''}. Nothing is guessed from the title.`
}
