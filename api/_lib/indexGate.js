// Data-quality gate for indexing. A page that fails a rule is still served,
// but with <meta name="robots" content="noindex"> and out of the sitemap, so a
// placeholder title or a corrupt tally never reaches Google or an agent as if
// it were the record. Every rule here is pure so it can be reused by the
// prerender function, the sitemap, and the ETL.

// Bill *titles* in the table are sometimes stubs like "HR 915" or "S. 12".
// Keep in step with PLACEHOLDER_TITLE_RE in etl/utils.ts (a test asserts parity).
export const PLACEHOLDER_TITLE_RE =
  /^(H\.?R\.?|S\.?|H\.?J\.?Res\.?|S\.?J\.?Res\.?|H\.?Con\.?Res\.?|S\.?Con\.?Res\.?|H\.?Res\.?|S\.?Res\.?)\s*\d+$/i

export function isPlaceholderTitle(title) {
  const t = String(title || '').trim()
  if (!t) return true
  return PLACEHOLDER_TITLE_RE.test(t)
}

// First named act in a piece of prose, e.g. "For the People Act of 2025".
// The negative lookahead keeps "This Act amends..." from counting as a name.
export const ACT_NAME_RE =
  /\b(?!(?:This|The|That|An|Such)\s+Act\b)([A-Z][\w'’]+(?:\s+[A-Za-z][\w'’]+){0,7}\s+Act(?:\s+of\s+\d{4})?)/

export function extractActName(text) {
  const m = ACT_NAME_RE.exec(String(text || ''))
  // Drop a leading article so "The For the People Act" compares as the act name.
  return m ? m[1].replace(/^(?:The|A|An)\s+/i, '') : null
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// An AI explanation is only usable when it was generated for the bill as it is
// titled now, and when any act it names appears in the official text. The
// H.R. 1 share card served "For the People Act" prose for the reconciliation
// act because the cached explanation predated a title correction.
export function explanationMatchesBill({ explanationTitle, oneLiner }, bill) {
  if (!bill) return false
  // The title the explanation was generated for is decisive when we have it.
  if (explanationTitle && bill.title) return norm(explanationTitle) === norm(bill.title)
  // Otherwise fall back to the act-name heuristic. A one-liner can legitimately
  // cite another act ("...under the Affordable Care Act"), so this only runs
  // when there is no stored title to compare.
  const act = extractActName(oneLiner)
  if (!act) return true
  const haystack = norm([bill.title, bill.crs_summary, bill.summary, bill.canonical_summary].filter(Boolean).join(' \n '))
  return haystack.includes(norm(act))
}

export function memberGate({ voteCount }) {
  if (!voteCount) return { indexable: false, reason: 'no_votes' }
  return { indexable: true, reason: null }
}

// `countedYeaNay` is the number of member-level Yea/Nay rows for the roll call.
// When it is known and disagrees with the stats tally, the record is
// inconsistent and stays out of the index until the ETL repairs it.
export function rollCallGate({ yea, nay, countedYeaNay, sane }) {
  if (yea == null || nay == null || yea + nay === 0) return { indexable: false, reason: 'no_tally' }
  if (sane === false) return { indexable: false, reason: 'tally_out_of_range' }
  if (countedYeaNay != null && countedYeaNay !== yea + nay) return { indexable: false, reason: 'tally_mismatch' }
  return { indexable: true, reason: null }
}

export function billGate({ title, hasVote, hasSummary }) {
  if (isPlaceholderTitle(title)) return { indexable: false, reason: 'placeholder_title' }
  if (!hasVote && !hasSummary) return { indexable: false, reason: 'no_vote_or_summary' }
  return { indexable: true, reason: null }
}
