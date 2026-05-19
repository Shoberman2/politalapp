// Per-member photo overrides for cases where Congress.gov hasn't published a
// photo yet (e.g. brand-new members sworn in via special election). Keyed by
// bioguideId. Remove an entry once Congress.gov catches up.
const MEMBER_IMAGE_OVERRIDES = {
  // Alan Armstrong (OK-3, special election 2026) — Wikimedia Commons,
  // sourced from his Senate swearing-in ceremony photo.
  A000383: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Senator_Alan_Armstrong_swearing_in_ceremony%2C_2026.jpg/330px-Senator_Alan_Armstrong_swearing_in_ceremony%2C_2026.jpg',
}

// Strip a malformed double-prefix from Congress.gov depiction URLs.
// Some records (e.g. M001244 Ashley Moody as of 2026) come back as
// "https://www.congress.gov/img/member/https://bioguide.congress.gov/photo/<hash>.jpg"
// — the bioguide URL got concatenated into the congress.gov prefix.
function stripDoublePrefix(url) {
  if (!url) return null
  const second = url.indexOf('https://', 8)
  return second > 0 ? url.slice(second) : url
}

// Resolve the best photo URL for a member: hand-curated override first, then
// the (normalized) URL from Congress.gov, else null. Callers should still
// chain a fallback to the predictable congress.gov/img/member/{bioguide}.jpg
// pattern and an onError-driven placeholder for true unknowns.
export function resolveMemberImageUrl(bioguideId, apiUrl) {
  if (bioguideId && MEMBER_IMAGE_OVERRIDES[bioguideId]) {
    return MEMBER_IMAGE_OVERRIDES[bioguideId]
  }
  return stripDoublePrefix(apiUrl)
}

// Back-compat alias for callers that only have the URL.
export function normalizeMemberImageUrl(url) {
  return stripDoublePrefix(url)
}
