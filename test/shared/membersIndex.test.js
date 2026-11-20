import { describe, it, expect } from 'vitest'
import { shapeMembers, groupMembers, memberSeat } from '../../shared/membersIndex.js'

const pol = (id, name, chamber, state, district, party = 'Democratic') => ({ id, name, chamber, state, district, party })

describe('shared/membersIndex', () => {
  const politicians = [
    pol('S000148', 'Charles Schumer', 'senate', 'NY', null),
    pol('P000197', 'Nancy Pelosi', 'house', 'CA', null),
    pol('N000147', 'Eleanor Holmes Norton', 'house', 'DC', '0'),
    pol('Z000001', 'Never Voted', 'house', 'TX', '3'),
    pol('X000001', 'Old Member', 'house', 'TX', '2', 'Republican'),
  ]
  const votedIds = new Set(['S000148', 'P000197', 'N000147', 'X000001'])
  const openTerms = [
    { bioguide_id: 'S000148', congress: 119, district: null },
    { bioguide_id: 'P000197', congress: 119, district: '11' },
    { bioguide_id: 'N000147', congress: 119, district: '0' },
  ]

  it('keeps only members with a recorded vote and takes the district from the open term', () => {
    const members = shapeMembers({ politicians, votedIds, openTerms })
    expect(members.map((m) => m.id)).toEqual(['S000148', 'P000197', 'N000147', 'X000001'])
    expect(members.find((m) => m.id === 'P000197')).toMatchObject({ district: '11', current: true })
    expect(members.find((m) => m.id === 'N000147').district).toBeNull()   // delegate: never "district 0"
    expect(members.find((m) => m.id === 'X000001').current).toBe(false)
  })

  it('treats everyone as current when no open terms are known', () => {
    const members = shapeMembers({ politicians, votedIds, openTerms: [] })
    expect(members.every((m) => m.current)).toBe(true)
  })

  it('groups senators, representatives, delegates and former members, sorted by name', () => {
    const g = groupMembers(shapeMembers({ politicians, votedIds, openTerms }))
    expect(g.senate.map((m) => m.name)).toEqual(['Charles Schumer'])
    expect(g.house.map((m) => m.name)).toEqual(['Nancy Pelosi'])
    expect(g.delegates.map((m) => m.name)).toEqual(['Eleanor Holmes Norton'])
    expect(g.former.map((m) => m.name)).toEqual(['Old Member'])
  })

  it('describes the seat', () => {
    expect(memberSeat({ chamber: 'senate', state: 'NY' })).toBe('Senator')
    expect(memberSeat({ chamber: 'house', state: 'CA', district: '11' })).toBe('Representative, district 11')
    expect(memberSeat({ chamber: 'house', state: 'DC', district: null })).toBe('Delegate')
    expect(memberSeat({ chamber: 'house', state: 'PR', district: null })).toBe('Resident Commissioner')
  })
})
