/**
 * Resolve a human-readable title for a bill, with a fallback chain.
 * Never returns an empty string.
 *
 * Order:
 *   1. bill.title (most common)
 *   2. bill.titles[] short or official title (only on detail endpoint)
 *   3. bill.shortTitle / bill.short_title
 *   4. Latest action text (truncated)
 *   5. policyArea + bill ID
 *   6. Bare bill ID, e.g. "H.R. 1234"
 *
 * Also runs the same prefix cleanup as the legacy simplifyTitle: drops
 * "A bill to", "To ...", "An act to ...", and trailing ", and for other
 * purposes." Truncates to 200 chars max.
 *
 * @param {object} bill        Bill object from Congress.gov / search response.
 * @param {string} [billType]  Fallback type (e.g. "hr") if bill.type is absent.
 * @param {string|number} [number] Fallback number if bill.number is absent.
 * @returns {string} Always a non-empty title.
 */
export function getBillDisplayTitle(bill, billType, number) {
  if (!bill && !billType && !number) return 'Untitled bill'

  const raw =
    pickTitle(bill?.title) ||
    pickFromTitlesArray(bill?.titles) ||
    pickTitle(bill?.shortTitle) ||
    pickTitle(bill?.short_title) ||
    pickTitle(bill?.officialTitle)

  if (raw) return tidy(raw)

  // Step 4 — latest action describes WHAT is being voted on for simple/concurrent
  // resolutions that have no title body.
  const action = bill?.latestAction?.text
  if (action && action.length > 8) {
    return tidy(action).slice(0, 180)
  }

  // Step 5/6 — synthesize from identifiers.
  const id = formatBillId(bill, billType, number)
  const policy = bill?.policyArea?.name
  if (policy) return `${policy} bill ${id}`
  return id || 'Untitled bill'
}

/**
 * Compact bill identifier like "H.R. 1234". Falls back gracefully when
 * either piece is missing.
 */
export function formatBillId(bill, billType, number) {
  const t = (bill?.type || billType || '').toString().toUpperCase()
  const n = bill?.number || number || ''
  if (!t && !n) return 'Untitled bill'
  if (!t) return `Bill ${n}`
  if (!n) return t
  return `${t}. ${n}`
}

function pickTitle(s) {
  if (!s) return ''
  const trimmed = String(s).trim()
  if (trimmed.length < 4) return ''
  return trimmed
}

function pickFromTitlesArray(titles) {
  if (!Array.isArray(titles) || titles.length === 0) return ''
  // Prefer "short title" (popular name), then "official title".
  const short = titles.find(t => (t?.titleType || '').toLowerCase().includes('short'))
  if (short?.title) return short.title
  const official = titles.find(t => (t?.titleType || '').toLowerCase().includes('official'))
  if (official?.title) return official.title
  // Last resort: first entry with a title.
  const first = titles.find(t => t?.title)
  return first?.title || ''
}

function tidy(title) {
  let s = title
    .replace(/^A bill to /i, '')
    .replace(/^To /i, '')
    .replace(/^An act to /i, '')
    .replace(/^Providing for /i, '')
    .replace(/^Expressing the sense of (the )?Congress /i, 'Congress Resolution: ')
    .replace(/^Expressing the sense of (the )?House /i, 'House Resolution: ')
    .replace(/^Expressing the sense of (the )?Senate /i, 'Senate Resolution: ')
    .replace(/, and for other purposes\.?$/i, '')
    .replace(/\.$/i, '')
    .trim()
  if (!s) return ''
  s = s.charAt(0).toUpperCase() + s.slice(1)
  if (s.length > 200) s = s.slice(0, 197) + '...'
  return s
}
