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

// Comprehensive, consistent, high-resolution congressional headshots keyed by
// bioguide id. Far better than the tiny (~5KB) congress.gov thumbnails, and
// covers essentially every current and historical member.
export function congressImageUrl(bioguideId) {
  return bioguideId ? `https://unitedstates.github.io/images/congress/450x550/${bioguideId}.jpg` : null
}

// Predictable congress.gov thumbnail — used only as an onError fallback for the
// rare member not yet in the unitedstates collection.
export function congressGovImageUrl(bioguideId) {
  return bioguideId ? `https://www.congress.gov/img/member/${bioguideId.toLowerCase()}.jpg` : null
}

// Resolve the best photo URL for a member: hand-curated override first, then the
// high-res unitedstates portrait, then the API depiction URL.
export function resolveMemberImageUrl(bioguideId, apiUrl) {
  if (bioguideId && MEMBER_IMAGE_OVERRIDES[bioguideId]) {
    return MEMBER_IMAGE_OVERRIDES[bioguideId]
  }
  return congressImageUrl(bioguideId) || stripDoublePrefix(apiUrl)
}

// Shared <img onError> handler: fall back to the congress.gov thumbnail once,
// then hand off to the component's own placeholder via onFail(imgElement).
export function handleMemberPhotoError(e, bioguideId, onFail) {
  const el = e.currentTarget
  const fallback = congressGovImageUrl(bioguideId)
  if (fallback && el.dataset.imgFallback !== 'done') {
    el.dataset.imgFallback = 'done'
    el.src = fallback
    return
  }
  if (typeof onFail === 'function') onFail(el)
}

// Back-compat alias for callers that only have the URL.
export function normalizeMemberImageUrl(url) {
  return stripDoublePrefix(url)
}
