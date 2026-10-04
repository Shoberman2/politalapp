// The one list of at-large House jurisdictions. Every district lookup (the web
// app's ZIP and address flows, the Landing ZIP box, Tell Your Rep, and the
// server-side geocoder behind the MCP `find_representatives` tool) reads it
// from here so the states cannot drift apart again.
//
// Source: U.S. Census Bureau, "2020 Census Apportionment Results" (April 26,
// 2021), https://www.census.gov/library/stories/2021/04/2020-census-data-release.html
// — "Alaska, Delaware, North Dakota, South Dakota, Vermont, and Wyoming" are
// apportioned one representative each, and Montana gains a seat. Those
// apportionments apply from the 118th Congress (2023) and are unchanged for the
// 119th. Montana has two districts (MT-01, MT-02) and is NOT at-large: treating
// it as at-large sends every Montana ZIP to district "0", which matches no
// sitting member. Re-check this list after the 2030 apportionment.

/** Voting states with a single, statewide House district (119th Congress). */
export const AT_LARGE_STATES = Object.freeze(['AK', 'DE', 'ND', 'SD', 'VT', 'WY'])

/**
 * Non-voting House seats: the DC delegate, Puerto Rico's resident
 * commissioner, and the delegates for Guam, the U.S. Virgin Islands, American
 * Samoa, and the Northern Mariana Islands. Each is one territory-wide seat, but
 * none has senators, so the "1 Representative and 2 Senators" path does not
 * apply to them.
 */
export const NON_VOTING_DELEGATE_JURISDICTIONS = Object.freeze(['DC', 'PR', 'GU', 'VI', 'AS', 'MP'])

const AT_LARGE = new Set(AT_LARGE_STATES)
const DELEGATES = new Set(NON_VOTING_DELEGATE_JURISDICTIONS)

const norm = (state) => String(state || '').trim().toUpperCase()

/** True when a voting state has exactly one House district, so a ZIP alone fixes the district. */
export function isAtLargeState(state) {
  return AT_LARGE.has(norm(state))
}

/** True for DC and the territories (one non-voting House seat, no senators). */
export function isDelegateJurisdiction(state) {
  return DELEGATES.has(norm(state))
}

/**
 * Normalize a Census congressional-district code to the app's district string.
 * Census uses "00" for at-large seats and "98"/"99" for the non-voting
 * delegate / resident commissioner seats; the app stores all of those as "0".
 * Also accepts the Census BASENAME text for an at-large seat ("Congressional
 * District (at Large)"). Returns null for an empty or unrecognized code.
 */
export function normalizeCensusDistrict(raw) {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  if (/^(0+|98|99)$/.test(s) || /at[\s-]*large/i.test(s)) return '0'
  const n = parseInt(s, 10)
  return Number.isNaN(n) ? null : String(n)
}
