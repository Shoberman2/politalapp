// Which Census geocoder vintage names the districts members sit for today.
//
// In 2026 the Census "Current_Current" vintage switched to the 120th
// Congressional Districts, the maps for the November 2026 election. Several
// states redrew mid-decade (Texas, California and others), so those districts
// name the wrong sitting member: downtown Austin is TX-37 today but TX-10 on
// the new map. Until the 120th Congress is sworn in, ask for ACS2025_Current,
// which still carries the 119th districts. Its rows have GEOID but no CD119
// field, so parsers read the district from GEOID.
//
// The iOS app keeps the same rule in DistrictLookup.swift.

export const NEXT_CONGRESS_SEATED = new Date('2027-01-03T17:00:00Z')

export function censusVintage(now = new Date()) {
  return now < NEXT_CONGRESS_SEATED ? 'ACS2025_Current' : 'Current_Current'
}
