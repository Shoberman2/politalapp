// The public members index (/members), shared by the server loader and
// renderer (api/_lib/pages.js, api/_lib/renderMembers.js) and the React page,
// so the prerendered list and the client list are the same members, grouped
// and described the same way.

import { houseDistrict, houseSeatTitle } from './memberRecord.js'
import { isDelegateJurisdiction } from './atLargeStates.js'

export const MEMBERS_CONGRESS = 119

export const MEMBER_GROUPS = [
  ['senate', 'Senate'],
  ['house', 'House of Representatives'],
  ['delegates', 'Delegates and Resident Commissioner'],
  ['former', 'Left office or replaced during recorded votes'],
]

export function memberSeat(m) {
  if (m.chamber === 'senate') return 'Senator'
  return `${houseSeatTitle(m.state)}${m.district ? `, district ${m.district}` : ''}`
}

// Politicians with at least one recorded vote (the same gate as
// sitemap-members.xml and the member pages), each marked current or not.
//   politicians  rows: id, name, chamber, state, district, party
//   votedIds     Set of politician ids with total_votes > 0
//   openTerms    member_congress_terms rows with no term_end: bioguide_id, congress, district
export function shapeMembers({ politicians, votedIds, openTerms }) {
  const open = new Map()
  for (const t of openTerms || []) {
    const prev = open.get(t.bioguide_id)
    if (!prev || Number(t.congress) > Number(prev.congress)) open.set(t.bioguide_id, t)
  }
  // If the terms table gave us nothing, every member counts as current rather
  // than the whole list landing under "former".
  const termsKnown = open.size > 0
  return (politicians || []).filter((p) => votedIds.has(p.id)).map((p) => {
    const term = open.get(p.id)
    const district = p.chamber === 'house' ? houseDistrict(p.state, p.district ?? term?.district ?? null) : null
    return {
      id: p.id,
      name: p.name,
      chamber: p.chamber,
      state: p.state,
      district: district == null ? null : String(district),
      party: p.party,
      current: termsKnown ? open.has(p.id) : true,
    }
  })
}

export function groupMembers(members) {
  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''))
  const current = members.filter((m) => m.current)
  return {
    senate: current.filter((m) => m.chamber === 'senate').sort(byName),
    house: current.filter((m) => m.chamber === 'house' && !isDelegateJurisdiction(m.state)).sort(byName),
    delegates: current.filter((m) => m.chamber === 'house' && isDelegateJurisdiction(m.state)).sort(byName),
    former: members.filter((m) => !m.current).sort(byName),
  }
}
