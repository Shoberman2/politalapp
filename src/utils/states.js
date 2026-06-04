// State name <-> USPS abbreviation helpers. The Congress.gov member feed
// returns full state names; the Members Register shows abbreviated district
// labels ("NY-14") for House members and full state names for Senators.

export const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  AS: 'American Samoa', GU: 'Guam', MP: 'Northern Mariana Islands',
  PR: 'Puerto Rico', VI: 'U.S. Virgin Islands',
}

const NAME_TO_ABBR = Object.fromEntries(
  Object.entries(STATE_NAMES).map(([abbr, name]) => [name.toLowerCase(), abbr])
)

// Accepts a full state name or an abbreviation; returns the USPS abbreviation.
export function toStateAbbr(state) {
  if (!state) return ''
  const s = String(state).trim()
  if (s.length === 2 && STATE_NAMES[s.toUpperCase()]) return s.toUpperCase()
  return NAME_TO_ABBR[s.toLowerCase()] || s
}

// Accepts a full state name or an abbreviation; returns the full state name.
export function toStateName(state) {
  if (!state) return ''
  const s = String(state).trim()
  if (s.length === 2 && STATE_NAMES[s.toUpperCase()]) return STATE_NAMES[s.toUpperCase()]
  return s
}
