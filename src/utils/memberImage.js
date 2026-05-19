// Normalize Congress.gov depiction.imageUrl values.
// Some records (e.g. M001244 Ashley Moody as of 2026) come back as
// "https://www.congress.gov/img/member/https://bioguide.congress.gov/photo/<hash>.jpg"
// — the bioguide URL got concatenated into the congress.gov prefix. Strip back to
// the embedded https:// URL.
export function normalizeMemberImageUrl(url) {
  if (!url) return null
  const second = url.indexOf('https://', 8)
  return second > 0 ? url.slice(second) : url
}
