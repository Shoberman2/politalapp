// Congressional leadership titles for the 119th Congress, keyed by bioguideId.
// Used by the Members Register to (a) show a leadership label on a member card
// and (b) power the "Leadership" filter chip. There's no leadership flag in the
// Congress.gov member feed, so this small curated map fills the gap. Update it
// when leadership changes; an entry that no longer matches a loaded member is
// simply ignored.
const LEADERSHIP_TITLES = {
  J000299: 'Speaker of the House',        // Mike Johnson (LA-4)
  S001176: 'House Majority Leader',       // Steve Scalise (LA-1)
  E000294: 'House Majority Whip',         // Tom Emmer (MN-6)
  J000294: 'House Minority Leader',       // Hakeem Jeffries (NY-8)
  C001101: 'House Minority Whip',         // Katherine Clark (MA-5)
  T000250: 'Senate Majority Leader',      // John Thune (SD)
  B001261: 'Senate Majority Whip',        // John Barrasso (WY)
  S000148: 'Senate Minority Leader',      // Chuck Schumer (NY)
  D000563: 'Senate Minority Whip',        // Dick Durbin (IL)
  G000386: 'President pro tempore',       // Chuck Grassley (IA)
}

export function getLeadershipTitle(bioguideId) {
  return bioguideId ? LEADERSHIP_TITLES[bioguideId] || null : null
}

export function isLeadership(bioguideId) {
  return Boolean(getLeadershipTitle(bioguideId))
}

export default LEADERSHIP_TITLES
