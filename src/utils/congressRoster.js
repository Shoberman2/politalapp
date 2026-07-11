import { toStateAbbr } from './states'

export const NON_VOTING_JURISDICTIONS = new Set(['AS', 'DC', 'GU', 'MP', 'PR', 'VI'])

function partyCode(member) {
  const party = String(member.party || member.partyName || '').toLowerCase()
  if (party.startsWith('d')) return 'D'
  if (party.startsWith('r')) return 'R'
  if (party.startsWith('i')) return 'I'
  return null
}

export function isNonVotingDelegate(member) {
  if (String(member.chamber || '').toLowerCase() === 'senate') return false
  return NON_VOTING_JURISDICTIONS.has(toStateAbbr(member.state))
}

export function getRosterComposition(members, { houseSeats = 435, senateSeats = 100 } = {}) {
  const blank = () => ({ R: 0, D: 0, I: 0 })
  const house = blank()
  const senate = blank()
  const delegates = blank()

  for (const member of members) {
    const party = partyCode(member)
    if (!party) continue

    if (String(member.chamber || '').toLowerCase() === 'senate') {
      senate[party] += 1
    } else if (isNonVotingDelegate(member)) {
      delegates[party] += 1
    } else {
      house[party] += 1
    }
  }

  const houseOccupied = house.R + house.D + house.I
  const senateOccupied = senate.R + senate.D + senate.I
  const delegateTotal = delegates.R + delegates.D + delegates.I

  return {
    house: { ...house, occupied: houseOccupied, vacant: Math.max(0, houseSeats - houseOccupied) },
    senate: { ...senate, occupied: senateOccupied, vacant: Math.max(0, senateSeats - senateOccupied) },
    delegates: { ...delegates, total: delegateTotal },
    rosterTotal: members.length,
  }
}
