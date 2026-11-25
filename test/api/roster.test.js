import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeSupabaseMock } from '../fixtures/supabaseChain.js'
import { makeRoster, filler, seedRosterTables } from '../fixtures/roster.js'

const db = makeSupabaseMock()
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: (t) => db.from(t) } }))

import { getRoster, _resetRosterCache, searchRoster, scoreName, nameTokens, parseMemberQuery, stateCode, partyName, currentCongress } from '../../api/_lib/roster.js'

const POLITICIANS = [
  { id: 'V000137', name: 'J. Vance', chamber: 'senate', state: 'OH', district: null, party: 'Republican' },
  { id: 'M001242', name: 'Bernie Moreno', chamber: 'senate', state: 'OH', district: null, party: 'Republican' },
  { id: 'H001104', name: 'Jon Husted', chamber: 'senate', state: 'OH', district: null, party: 'Republican' },
  { id: 'T000489', name: 'Sylvester Turner', chamber: 'house', state: 'TX', district: null, party: 'Democrat' },
  { id: 'M001245', name: 'Christian Menefee', chamber: 'house', state: 'TX', district: null, party: 'Democrat' },
  // Sworn in mid-Congress: votes, but no term row yet.
  { id: 'G000607', name: 'James Gallagher', chamber: 'house', state: 'CA', district: null, party: 'Republican' },
  { id: 'N000147', name: 'Eleanor Norton', chamber: 'house', state: 'DC', district: null, party: 'Democrat' },
]
const TERMS = [
  { bioguide_id: 'V000137', chamber: 'senate', state: 'OH', district: null, party: 'R' },
  { bioguide_id: 'M001242', chamber: 'senate', state: 'OH', district: null, party: 'R' },
  { bioguide_id: 'H001104', chamber: 'senate', state: 'OH', district: null, party: 'R' },
  { bioguide_id: 'T000489', chamber: 'house', state: 'TX', district: '18', party: 'D' },
  { bioguide_id: 'M001245', chamber: 'house', state: 'TX', district: '18', party: 'D' },
  { bioguide_id: 'N000147', chamber: 'house', state: 'DC', district: '0', party: 'D' },
  // A term with no politicians row.
  { bioguide_id: 'S001150', chamber: 'senate', state: 'CA', district: null, party: 'D' },
]
const SEATED = {
  senate: ['M001242', 'H001104', 'S001150', ...filler('S', 90)],
  house: ['M001245', 'G000607', ...filler('H', 400)],
}

describe('getRoster: who is serving comes from the newest complete roll call', () => {
  beforeEach(() => {
    db.reset()
    _resetRosterCache()
    vi.stubEnv('CONGRESS_API_KEY', 'test-key')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ member: { terms: [{ chamber: 'House of Representatives', congress: 119, district: 1 }] } }))))
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('drops members who left, keeps their replacements, and places a member who has no term row yet', async () => {
    seedRosterTables(db, { politicians: POLITICIANS, terms: TERMS, seated: SEATED })
    const roster = await getRoster(119)
    const m = (id) => roster.byId.get(id)

    // Vance and Turner hold a 119th term row with no term_end, but the newest roll calls do not list them.
    expect(m('V000137')).toMatchObject({ serving: false, chamber: 'senate', state: 'OH', party: 'Republican' })
    expect(m('T000489').serving).toBe(false)
    expect(m('M001242').serving).toBe(true)
    expect(m('H001104').serving).toBe(true)
    expect(m('M001245')).toMatchObject({ serving: true, district: '18', party: 'Democrat' })

    // No term row: seated by the roll call, district asked of Congress.gov once.
    expect(m('G000607')).toMatchObject({ serving: true, district: '1' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(fetch.mock.calls[0][0])).toContain('https://api.congress.gov/v3/member/G000607?')

    // Delegates do not vote on the floor: a term in this Congress is the test.
    expect(m('N000147')).toMatchObject({ serving: true, district: '0' })
    // A term without a politicians row is still a citable stub.
    expect(m('S001150')).toMatchObject({ name: 'S001150', serving: true, party: 'Democrat' })
    expect(roster.servingAsOf).toEqual({ house: '2026-11-19', senate: '2026-11-19' })
    // The newest roll call is the highest roll number on the newest day.
    expect(db.ops('votes', 'eq').map((o) => o[2])).toEqual(expect.arrayContaining(['house-119-2-12', 'senate-119-2-12']))
    expect(db.ops('votes', 'eq').map((o) => o[2])).not.toContain('house-119-2-4')
  })

  it('skips a roll call that is still being ingested', async () => {
    seedRosterTables(db, { politicians: POLITICIANS, terms: TERMS, seated: SEATED, newestRows: 12 })
    const roster = await getRoster(119)
    expect(roster.byId.get('M001245').serving).toBe(true)
    expect(roster.byId.get('V000137').serving).toBe(false)
    expect(db.ops('votes', 'eq').map((o) => o[2])).toEqual(expect.arrayContaining(['house-119-2-12', 'house-119-2-5']))
  })

  it('falls back to holding a term when no roll call can say', async () => {
    seedRosterTables(db, { politicians: POLITICIANS, terms: TERMS, seated: SEATED, noRollCalls: true })
    const roster = await getRoster(119)
    expect(roster.byId.get('V000137').serving).toBe(true)
    expect(roster.byId.get('G000607').serving).toBe(false)
    expect(roster.servingAsOf).toEqual({ house: null, senate: null })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reads the outgoing Congress in the first days of a new one, and says which', async () => {
    seedRosterTables(db, { politicians: POLITICIANS, terms: TERMS, seated: SEATED })
    const terms = db.responses.member_congress_terms
    const rollCalls = db.responses.roll_calls
    // Congress 120 has no terms and no roll calls yet; 119 has both.
    db.responses.member_congress_terms = (call) => (call.ops.some((o) => o[0] === 'eq' && o[2] === 120) ? { data: [] } : terms)
    db.responses.roll_calls = (call) => (call.ops.some((o) => o[0] === 'like' && String(o[2]).includes('-120-')) ? { data: [] } : rollCalls(call))
    const roster = await getRoster(120)
    expect(roster.congress).toBe(119)
    expect(roster.byId.get('M001245').serving).toBe(true)
    expect(roster.byId.get('V000137').serving).toBe(false)
  })

  it('leaves the district unknown when Congress.gov does not answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    seedRosterTables(db, { politicians: POLITICIANS, terms: TERMS, seated: SEATED })
    const roster = await getRoster(119)
    expect(roster.byId.get('G000607')).toMatchObject({ serving: true, district: null })
  })

  it('caches a good load and does not cache a failed one', async () => {
    db.responses.politicians = { data: null, error: { message: 'down' } }
    await expect(getRoster(119)).rejects.toThrow(/politicians: down/)
    seedRosterTables(db, { politicians: POLITICIANS, terms: TERMS, seated: SEATED })
    const first = await getRoster(119)
    const calls = db.calls.length
    expect(await getRoster(119)).toBe(first)
    expect(db.calls.length).toBe(calls)
  })
})

describe('member name search', () => {
  const roster = makeRoster([
    { id: 'S000148', name: 'Charles Schumer', chamber: 'senate', state: 'NY', party: 'Democrat' },
    { id: 'S000033', name: 'Bernie Sanders', chamber: 'senate', state: 'VT', party: 'Independent' },
    { id: 'O000172', name: 'Alexandria Ocasio-Cortez', chamber: 'house', state: 'NY', district: '14', party: 'Democrat' },
    { id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', state: 'CA', district: '11', party: 'Democrat' },
    { id: 'M000087', name: 'Nancy Mace', chamber: 'house', state: 'SC', district: '1', party: 'Republican' },
    { id: 'J000299', name: 'Mike Johnson', chamber: 'house', state: 'LA', district: '4', party: 'Republican' },
    { id: 'J000301', name: 'Dusty Johnson', chamber: 'house', state: 'SD', district: '0', party: 'Republican' },
    { id: 'J000293', name: 'Ron Johnson', chamber: 'senate', state: 'WI', party: 'Republican' },
    { id: 'N000147', name: 'Eleanor Norton', chamber: 'house', state: 'DC', district: '0', party: 'Democrat' },
    { id: 'D000594', name: 'Monica De La Cruz', chamber: 'house', state: 'TX', district: '15', party: 'Republican' },
    { id: 'C001098', name: 'Ted Cruz', chamber: 'senate', state: 'TX', party: 'Republican' },
    { id: 'M001242', name: 'Bernie Moreno', chamber: 'senate', state: 'OH', party: 'Republican' },
    { id: 'H001104', name: 'Jon Husted', chamber: 'senate', state: 'OH', party: 'Republican' },
    { id: 'V000137', name: 'J. Vance', chamber: 'senate', state: 'OH', party: 'Republican', serving: false },
  ])
  const find = (args) => searchRoster(roster, args).map((r) => r.member.id)

  it('accepts nicknames, titles, initials, middle names and close spellings', () => {
    expect(find({ query: 'Chuck Schumer' })).toEqual(['S000148'])
    expect(find({ query: 'Sen. Bernard Sanders' })).toEqual(['S000033'])
    expect(find({ query: 'AOC' })).toEqual(['O000172'])
    expect(find({ query: 'ocasio cortez' })).toEqual(['O000172'])
    expect(find({ query: 'Eleanor Holmes Norton' })).toEqual(['N000147'])
    expect(find({ query: 'pelosy' })).toEqual(['P000197'])
    expect(find({ query: 'Congresswoman Pelosi' })).toEqual(['P000197'])
    expect(find({ query: 'p000197' })).toEqual(['P000197'])
  })

  it('returns only the best tier, so a full name does not drag in everyone sharing a family name', () => {
    expect(find({ query: 'Mike Johnson' })).toEqual(['J000299'])
    expect(find({ query: 'Johnson' }).sort()).toEqual(['J000293', 'J000299', 'J000301'])
    // A given name alone lists everyone with it; a wrong family name matches nobody.
    expect(find({ query: 'Nancy' }).sort()).toEqual(['M000087', 'P000197'])
    expect(find({ query: 'Nancy Smith' })).toEqual([])
    // "Cruz" is the whole family name of one member and part of another's.
    expect(find({ query: 'Ted Cruz' })).toEqual(['C001098'])
    expect(find({ query: 'zzzz' })).toEqual([])
  })

  it('reads a seat hint and applies filters', () => {
    expect(parseMemberQuery('Sen. Ted Cruz (R-TX)')).toEqual({ tokens: ['ted', 'cruz'], party: 'Republican', state: 'TX' })
    expect(find({ query: 'Johnson (R-WI)' })).toEqual(['J000293'])
    expect(find({ query: 'Johnson', chamber: 'house', state: 'South Dakota' })).toEqual(['J000301'])
    expect(find({ query: 'Cruz', party: 'D' })).toEqual([])
  })

  it('lists sitting members in seat order without a name, and former ones only on request', () => {
    expect(find({ state: 'OH', chamber: 'senate' })).toEqual(['M001242', 'H001104'])
    expect(find({ state: 'Ohio', chamber: 'senate', includeFormer: true })).toEqual(['M001242', 'V000137', 'H001104'])
    // A name search still finds a member who left, marked as not serving.
    const vance = searchRoster(roster, { query: 'Vance' })
    expect(vance).toHaveLength(1)
    expect(vance[0].member.serving).toBe(false)
  })

  it('normalizes names, states and parties', () => {
    expect(nameTokens('André O’Rourke-Smith Jr.')).toEqual(['andre', 'orourke', 'smith', 'jr'])
    expect(scoreName(['chuck', 'schumer'], 'Charles Schumer')).toBe(100)
    expect(scoreName(['schumer'], 'Charles Schumer')).toBe(100)
    expect(scoreName(['shumer'], 'Charles Schumer')).toBeLessThan(40)
    expect(scoreName(['shumer'], 'Charles Schumer')).toBeGreaterThan(0)
    expect(scoreName(['smith'], 'Charles Schumer')).toBe(0)
    expect(stateCode('california')).toBe('CA')
    expect(stateCode('dc')).toBe('DC')
    expect(stateCode('Atlantis')).toBeNull()
    expect(partyName('D')).toBe('Democrat')
    expect(partyName('Republican')).toBe('Republican')
    expect(partyName('I')).toBe('Independent')
    expect(currentCongress(new Date('2026-11-25T00:00:00Z'))).toBe(119)
  })
})
