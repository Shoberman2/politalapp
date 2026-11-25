import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '../fixtures/supabaseChain.js'
import { makeRoster } from '../fixtures/roster.js'

const db = makeSupabaseMock()
const mocks = vi.hoisted(() => ({ getRoster: vi.fn() }))
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: (t) => db.from(t) } }))
vi.mock('../../api/_lib/roster.js', async (original) => ({ ...(await original()), getRoster: mocks.getRoster }))

import {
  searchMembers, getMemberVotes, getMemberBills, compareMembers, getRecentVotes, getRollCall, searchBills,
  search, fetchDocument, parseDocumentId,
  currentCongress, _resetRollCallSearchCache,
} from '../../api/_lib/mcpTools.js'
import { _resetEtlMetaCache } from '../../api/_lib/etlMeta.js'

const C = currentCongress()
const SITE = 'https://www.ballotwatch.io'
const hasOp = (call, name, ...args) => call.ops.some((o) => o[0] === name && args.every((a, i) => o[i + 1] === a))

const ROSTER = makeRoster([
  { id: 'S000148', name: 'Charles Schumer', chamber: 'senate', state: 'NY', party: 'Democrat' },
  { id: 'G000555', name: 'Kirsten Gillibrand', chamber: 'senate', state: 'NY', party: 'Democrat' },
  { id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', state: 'CA', district: '11', party: 'Democrat' },
  { id: 'J000299', name: 'Mike Johnson', chamber: 'house', state: 'LA', district: '4', party: 'Republican' },
  { id: 'V000137', name: 'J. Vance', chamber: 'senate', state: 'OH', party: 'Republican', serving: false },
], C)

beforeEach(() => {
  db.reset()
  _resetEtlMetaCache()
  _resetRollCallSearchCache()
  mocks.getRoster.mockReset()
  mocks.getRoster.mockResolvedValue(ROSTER)
  db.responses.etl_metadata = { data: { value: '2026-11-24T06:51:34Z' } }
})

describe('search_members', () => {
  it('turns a name into a citable member with a Bioguide ID and a serving flag', async () => {
    const out = await searchMembers({ query: 'Chuck Schumer' })
    expect(out).toEqual({
      query: 'Chuck Schumer',
      congress: C,
      total: 1,
      members: [{
        bioguide_id: 'S000148', name: 'Charles Schumer', chamber: 'senate', party: 'Democrat', state: 'NY', district: null,
        canonical: `${SITE}/politician/S000148-charles-schumer`, source_url: 'https://www.congress.gov/member/S000148', serving: true,
      }],
      data_updated_at: '2026-11-24T06:51:34Z',
    })
    expect((await searchMembers({ query: 'Vance' })).members[0]).toMatchObject({ bioguide_id: 'V000137', serving: false })
  })

  it('lists by filter, caps the list, and explains an empty answer', async () => {
    const ny = await searchMembers({ state: 'New York', chamber: 'senate', limit: 1 })
    expect(ny.total).toBe(2)
    expect(ny.members.map((m) => m.name)).toEqual(['Charles Schumer'])
    expect(ny.note).toBe('Showing 1 of 2. Narrow with state, chamber or party, or raise limit (max 60).')
    // Sitting members only unless asked.
    expect((await searchMembers({ state: 'OH' })).total).toBe(0)
    expect((await searchMembers({ state: 'OH', include_former: true })).members.map((m) => m.name)).toEqual(['J. Vance'])
    const none = await searchMembers({ query: 'Nobody Here' })
    expect(none.members).toEqual([])
    expect(none.note).toMatch(/No member of the \d+th Congress matches/)
  })

  it('rejects an empty search and an unknown state before reading anything', async () => {
    expect((await searchMembers({})).error).toBe('Give a name, or filter by state, chamber or party.')
    expect((await searchMembers({ state: 'Atlantis' })).error).toMatch(/"Atlantis" is not a state or territory/)
    expect(mocks.getRoster).not.toHaveBeenCalled()
  })
})

describe('get_member_votes', () => {
  function seed() {
    db.responses.politicians = { data: { id: 'P000197', name: 'Nancy Pelosi', chamber: 'house' } }
    db.responses.votes = { data: [
      // votes.bill_id is empty; the roll call names the bill.
      { roll_call_id: `house-${C}-2-327`, position: 'Aye', voted_at: '2026-11-19', source_url: 'https://clerk.house.gov/Votes/1999327', bill_id: null, bills: null },
      { roll_call_id: `house-${C}-2-326`, position: 'Not Voting', voted_at: '2026-11-18', source_url: null, bill_id: null, bills: null },
    ], count: 689 }
    db.responses.roll_calls = (call) => {
      if (hasOp(call, 'eq', 'bill_id')) return { data: [{ id: `house-${C}-1-145` }, { id: `house-${C}-1-190` }] }
      return { data: [
        { id: `house-${C}-2-327`, question: 'On Motion to Suspend the Rules and Pass', description: null, bill_id: `${C}-hr-4464`, bills: { id: `${C}-hr-4464`, title: 'Preventive Health Savings Act' } },
        // A stub title is never shown as if it were the bill's name.
        { id: `house-${C}-2-326`, question: 'On Passage', description: 'A description', bill_id: `${C}-hr-915`, bills: { id: `${C}-hr-915`, title: 'HR 915' } },
      ] }
    }
  }

  it('names the bill from the roll call, normalizes the position and cites the official record', async () => {
    seed()
    const out = await getMemberVotes({ bioguide_id: 'p000197' })
    expect(out).toMatchObject({ bioguide_id: 'P000197', name: 'Nancy Pelosi', total: 689, offset: 0, canonical: `${SITE}/politician/P000197-nancy-pelosi`, data_updated_at: '2026-11-24T06:51:34Z' })
    expect(out.votes[0]).toEqual({
      roll_call_id: `house-${C}-2-327`,
      voted_at: '2026-11-19',
      question: 'On Motion to Suspend the Rules and Pass',
      description: null,
      bill: { id: `${C}-hr-4464`, label: 'H.R. 4464', title: 'Preventive Health Savings Act', canonical: `${SITE}/bill/${C}/hr/4464` },
      position: 'Yea',
      // Derived from the roll-call id, not the stored URL with the wrong year.
      source_url: `https://clerk.house.gov/Votes/${1789 + 2 * (C - 1) + 1}327`,
      canonical: `${SITE}/vote/${C}/house/2/327`,
    })
    expect(out.votes[1]).toMatchObject({ description: 'A description', position: 'Not Voting', bill: { id: `${C}-hr-915`, label: 'H.R. 915', title: null } })
    expect(out.note).toBe('Showing 2 of 689. Pass offset 2 for the next page.')
    expect(db.ops('votes', 'range')[0]).toEqual(['range', 0, 49])
  })

  it('filters by bill, position and dates, and pages with offset', async () => {
    seed()
    const out = await getMemberVotes({ bioguide_id: 'P000197', bill: 'H.R. 1', position: 'nay', since: '2025-05-01', until: '2025-07-31', limit: 10, offset: 20 })
    expect(out.error).toBeUndefined()
    expect(db.ops('roll_calls', 'eq')[0]).toEqual(['eq', 'bill_id', `${C}-hr-1`])
    expect(db.ops('votes', 'in')).toEqual(expect.arrayContaining([
      ['in', 'position', ['Nay', 'No']],
      ['in', 'roll_call_id', [`house-${C}-1-145`, `house-${C}-1-190`]],
    ]))
    expect(db.ops('votes', 'gte')[0]).toEqual(['gte', 'voted_at', '2025-05-01'])
    expect(db.ops('votes', 'lte')[0]).toEqual(['lte', 'voted_at', '2025-07-31'])
    expect(db.ops('votes', 'range')[0]).toEqual(['range', 20, 29])
  })

  it('says plainly when the bill never had a recorded vote, without querying votes', async () => {
    seed()
    db.responses.roll_calls = { data: [] }
    const out = await getMemberVotes({ bioguide_id: 'P000197', bill: `${C}-hr-9999` })
    expect(out.total).toBe(0)
    expect(out.votes).toEqual([])
    expect(out.note).toBe('No recorded floor vote on H.R. 9999 is in the record. Many bills pass by voice vote or never reach the floor.')
    expect(db.tables()).not.toContain('votes')
  })

  it('reports an unknown member, a malformed id and bad arguments as errors', async () => {
    db.responses.politicians = { data: null }
    db.responses.votes = { data: [], count: 0 }
    expect((await getMemberVotes({ bioguide_id: 'Z999999' })).error).toBe('No member with Bioguide ID Z999999. Use search_members to find one by name.')
    db.reset()
    expect((await getMemberVotes({ bioguide_id: 'pelosi' })).error).toMatch(/looks wrong.*search_members/)
    expect((await getMemberVotes({ bioguide_id: 'P000197', since: '2026-01' })).error).toBe('since must be a date in YYYY-MM-DD form')
    expect((await getMemberVotes({ bioguide_id: 'P000197', position: 'maybe' })).error).toBe('position must be Yea, Nay, Present or Not Voting')
    expect((await getMemberVotes({ bioguide_id: 'P000197', bill: 'the big one' })).error).toMatch(/Bill id looks wrong/)
    expect(db.calls).toHaveLength(0)
  })
})

describe('get_member_bills', () => {
  it('lists sponsored and cosponsored bills with totals and leaves out stub titles', async () => {
    db.responses.politicians = { data: { id: 'P000197', name: 'Nancy Pelosi' } }
    db.responses.bills = { data: [
      { id: `${C}-hr-100`, title: 'Real Act of 2026', introduced_at: '2026-03-01', source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/100' },
      { id: `${C}-hr-915`, title: 'HR 915', introduced_at: '2026-02-01', source_url: null },
    ], count: 14 }
    db.responses.bill_cosponsors = { data: [
      { cosponsored_at: '2026-04-01', bills: { id: `${C}-s-7`, title: 'Another Act', introduced_at: '2026-01-15', source_url: 'https://www.congress.gov/bill/119th-congress/senate-bill/7' } },
    ], count: 31 }
    const out = await getMemberBills({ bioguide_id: 'P000197' })
    expect(out.sponsored).toEqual({ total: 14, bills: [{ id: `${C}-hr-100`, label: 'H.R. 100', title: 'Real Act of 2026', introduced_at: '2026-03-01', canonical: `${SITE}/bill/${C}/hr/100`, source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/100' }] })
    expect(out.cosponsored.total).toBe(31)
    expect(out.cosponsored.bills.map((b) => b.label)).toEqual(['S. 7'])
    expect(out).toMatchObject({ name: 'Nancy Pelosi', canonical: `${SITE}/politician/P000197-nancy-pelosi`, source_url: 'https://www.congress.gov/member/P000197' })
    expect(out.note).toMatch(/can be incomplete/)
  })

  it('reports an unknown member and a malformed id', async () => {
    db.responses.politicians = { data: null }
    db.responses.bills = { data: [], count: 0 }
    db.responses.bill_cosponsors = { data: [], count: 0 }
    expect((await getMemberBills({ bioguide_id: 'Z999999' })).error).toMatch(/No member with Bioguide ID Z999999/)
    expect((await getMemberBills({ bioguide_id: 'nope' })).error).toMatch(/looks wrong/)
  })
})

describe('compare_members', () => {
  const rc = (n) => `senate-${C}-2-${n}`
  function seed(extraB = []) {
    db.responses.politicians = { data: [
      { id: 'S000148', name: 'Charles Schumer', chamber: 'senate', party: 'Democrat', state: 'NY', district: null },
      { id: 'C001098', name: 'Ted Cruz', chamber: 'senate', party: 'Republican', state: 'TX', district: null },
    ] }
    const a = [[1, 'Yea'], [2, 'Nay'], [3, 'Yea'], [4, 'Not Voting'], [5, 'Aye'], [6, 'Nay'], [7, 'Yea']]
    const b = [[1, 'Yea'], [2, 'Yea'], [3, 'Nay'], [4, 'Yea'], [5, 'Yes'], [6, 'Present'], ...extraB]
    const rows = (list) => list.map(([n, position]) => ({ roll_call_id: rc(n), position, voted_at: `2026-11-${String(10 + n).padStart(2, '0')}` }))
    db.responses.votes = (call) => ({ data: hasOp(call, 'eq', 'politician_id', 'S000148') ? rows(a) : rows(b) })
    db.responses.roll_calls = { data: [
      { id: rc(3), question: 'On the Nomination', description: 'Confirmation: A Judge', bill_id: null, bills: null },
      { id: rc(2), question: 'On Passage of the Bill', description: null, bill_id: `${C}-s-5`, bills: { id: `${C}-s-5`, title: 'Laken Riley Act' } },
    ] }
  }

  it('counts only roll calls where both members voted Yea or Nay', async () => {
    seed()
    const out = await compareMembers({ bioguide_id_a: 's000148', bioguide_id_b: 'C001098' })
    // Roll 7 lists only Schumer; rolls 4 and 6 have a Not Voting or Present.
    expect(out).toMatchObject({
      congress: C, chamber: 'senate',
      roll_calls_both_listed: 6, both_voted_yea_or_nay: 4, voted_the_same: 2, voted_differently: 2, same_vote_pct: 50,
      member_a: { bioguide_id: 'S000148', name: 'Charles Schumer', canonical: `${SITE}/politician/S000148-charles-schumer` },
      member_b: { bioguide_id: 'C001098', name: 'Ted Cruz' },
    })
    // Newest first, each with both positions and the official record.
    expect(out.recent_differences.map((d) => [d.roll_call_id, d.position_a, d.position_b])).toEqual([[rc(3), 'Yea', 'Nay'], [rc(2), 'Nay', 'Yea']])
    expect(out.recent_differences[0]).toMatchObject({ question: 'On the Nomination', description: 'Confirmation: A Judge', bill: null, canonical: `${SITE}/vote/${C}/senate/2/3` })
    expect(out.recent_differences[1].bill).toEqual({ id: `${C}-s-5`, label: 'S. 5', title: 'Laken Riley Act', canonical: `${SITE}/bill/${C}/s/5` })
    expect(out.recent_differences[1].source_url).toContain(`vote_${C}_2_00002.htm`)
    expect(out.note).toMatch(/A count, not a judgment/)
  })

  it('gives no percentage when the two never both voted, and refuses pairs that cannot be compared', async () => {
    seed()
    db.responses.votes = { data: [] }
    const empty = await compareMembers({ bioguide_id_a: 'S000148', bioguide_id_b: 'C001098' })
    expect(empty).toMatchObject({ both_voted_yea_or_nay: 0, same_vote_pct: null, recent_differences: [] })

    db.responses.politicians = { data: [
      { id: 'S000148', name: 'Charles Schumer', chamber: 'senate', party: 'Democrat', state: 'NY' },
      { id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', party: 'Democrat', state: 'CA' },
    ] }
    expect((await compareMembers({ bioguide_id_a: 'S000148', bioguide_id_b: 'P000197' })).error).toMatch(/different chambers never vote on the same roll call/)
    db.responses.politicians = { data: [{ id: 'S000148', name: 'Charles Schumer', chamber: 'senate' }] }
    expect((await compareMembers({ bioguide_id_a: 'S000148', bioguide_id_b: 'Z999999' })).error).toMatch(/No member with Bioguide ID Z999999/)
    expect((await compareMembers({ bioguide_id_a: 'S000148', bioguide_id_b: 'S000148' })).error).toBe('Give two different members.')
    expect((await compareMembers({ bioguide_id_a: 'x', bioguide_id_b: 'S000148' })).error).toMatch(/looks wrong/)
  })
})

describe('get_recent_votes', () => {
  const ROWS = [
    { id: `house-${C}-2-99`, bill_id: `${C}-hr-4464`, question: 'On Passage', description: null, voted_at: '2026-11-19', bills: { id: `${C}-hr-4464`, title: 'Preventive Health Savings Act' } },
    { id: `house-${C}-2-327`, bill_id: null, question: 'On Motion to Adjourn', description: null, voted_at: '2026-11-19', bills: null },
    { id: `senate-${C}-2-279`, bill_id: null, question: 'On the Nomination', description: 'Confirmation: Jane Doe to be U.S. District Judge', voted_at: '2026-11-20', bills: null },
    { id: `senate-${C}-2-270`, bill_id: null, question: 'On the Cloture Motion', description: 'Motion to Invoke Cloture: Jane Doe to be U.S. District Judge', voted_at: '2026-11-18', bills: null },
  ]
  const STATS = [
    { roll_call_id: `house-${C}-2-99`, dem_yea: 200, dem_nay: 10, rep_yea: 20, rep_nay: 190, ind_yea: 0, ind_nay: 0 },
    // Double-counted tally: no tally or result may be shown for it.
    { roll_call_id: `house-${C}-2-327`, dem_yea: 400, dem_nay: 10, rep_yea: 400, rep_nay: 10, ind_yea: 0, ind_nay: 0 },
    { roll_call_id: `senate-${C}-2-279`, dem_yea: 0, dem_nay: 43, rep_yea: 49, rep_nay: 0, ind_yea: 0, ind_nay: 0 },
  ]

  it('lists roll calls newest first, by roll number within a day, with tally, party split and result', async () => {
    db.responses.roll_calls = { data: ROWS, count: 1627 }
    db.responses.roll_call_stats = { data: STATS }
    const out = await getRecentVotes({ limit: 3 })
    expect(out.total).toBe(1627)
    expect(out.votes.map((v) => v.roll_call_id)).toEqual([`senate-${C}-2-279`, `house-${C}-2-327`, `house-${C}-2-99`])
    expect(out.votes[0]).toEqual({
      roll_call_id: `senate-${C}-2-279`, chamber: 'senate', congress: C, session: 2, roll: 279, voted_at: '2026-11-20',
      question: 'On the Nomination', description: 'Confirmation: Jane Doe to be U.S. District Judge', bill: null,
      tally: { yea: 49, nay: 43 },
      by_party: { dem: { yea: 0, nay: 43 }, rep: { yea: 49, nay: 0 }, ind: { yea: 0, nay: 0 } },
      result_derived: 'Confirmed',
      canonical: `${SITE}/vote/${C}/senate/2/279`,
      source_url: `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${C}2/vote_${C}_2_00279.htm`,
    })
    expect(out.votes[1]).toMatchObject({ tally: null, by_party: null, result_derived: null })
    expect(out.votes[2]).toMatchObject({ chamber: 'house', bill: { id: `${C}-hr-4464`, label: 'H.R. 4464', title: 'Preventive Health Savings Act' }, tally: { yea: 220, nay: 200 }, result_derived: 'Passed' })
    expect(out.note).toBe('Showing the newest 3 of 1627. Narrow with since, until, chamber, bill or query, or raise limit (max 50).')
    expect(out.data_updated_at).toBe('2026-11-24T06:51:34Z')
  })

  it('passes chamber, date and bill filters to the query', async () => {
    db.responses.roll_calls = { data: [], count: 0 }
    const out = await getRecentVotes({ chamber: 'senate', since: '2026-11-01', until: '2026-11-20', bill: 'S. 5' })
    expect(out.votes).toEqual([])
    expect(out.note).toMatch(/No roll call matches.*voice votes/)
    expect(db.ops('roll_calls', 'like')[0]).toEqual(['like', 'id', 'senate-%'])
    expect(db.ops('roll_calls', 'gte')[0]).toEqual(['gte', 'voted_at', '2026-11-01'])
    expect(db.ops('roll_calls', 'lte')[0]).toEqual(['lte', 'voted_at', '2026-11-20'])
    expect(db.ops('roll_calls', 'eq')[0]).toEqual(['eq', 'bill_id', `${C}-s-5`])
  })

  it('finds roll calls by words in the question, description or bill title, and caches the scan', async () => {
    db.responses.roll_calls = { data: ROWS }
    db.responses.roll_call_stats = { data: STATS }
    const judge = await getRecentVotes({ query: 'district JUDGE doe' })
    expect(judge.total).toBe(2)
    expect(judge.votes.map((v) => v.roll_call_id)).toEqual([`senate-${C}-2-279`, `senate-${C}-2-270`])
    const reads = db.tables().filter((t) => t === 'roll_calls').length
    expect((await getRecentVotes({ query: 'preventive health' })).votes.map((v) => v.roll_call_id)).toEqual([`house-${C}-2-99`])
    expect((await getRecentVotes({ query: 'H.R. 4464' })).votes).toHaveLength(1)
    expect((await getRecentVotes({ query: 'judge', chamber: 'house' })).votes).toEqual([])
    expect((await getRecentVotes({ query: 'judge', since: '2026-11-19' })).votes.map((v) => v.roll_call_id)).toEqual([`senate-${C}-2-279`])
    // One scan of the Congress serves every keyword search for five minutes.
    expect(db.tables().filter((t) => t === 'roll_calls').length).toBe(reads)
  })

  it('rejects malformed arguments without reading anything', async () => {
    expect((await getRecentVotes({ chamber: 'lords' })).error).toBe('chamber must be house or senate')
    expect((await getRecentVotes({ since: 'last week' })).error).toBe('since must be a date in YYYY-MM-DD form')
    expect((await getRecentVotes({ bill: 'the big one' })).error).toMatch(/Bill id looks wrong/)
    expect(db.calls).toHaveLength(0)
  })
})

describe('get_roll_call', () => {
  const ID = `house-${C}-1-145`
  const voter = (id, name, party, state, position) => ({ position, source_url: 'https://clerk.house.gov/Votes/2025145', voted_at: '2025-05-22', politicians: { id, name, party, state, district: null, chamber: 'house' } })
  function seed(n = 70) {
    const crowd = Array.from({ length: n }, (_, i) => voter(`X${String(100000 + i)}`, `Member ${String(i).padStart(2, '0')}`, i % 2 ? 'Republican' : 'Democrat', i % 5 === 0 ? 'OH' : 'TX', i % 3 === 0 ? 'Nay' : 'Yea'))
    db.responses.roll_calls = { data: { id: ID, bill_id: `${C}-hr-1`, question: 'On Passage', description: null, voted_at: '2025-05-22', updated_at: '2026-01-01' } }
    db.responses.roll_call_stats = { data: { dem_yea: 0, dem_nay: 212, rep_yea: 214, rep_nay: 2, ind_yea: 1, ind_nay: 0 } }
    db.responses.votes = { data: [voter('P000197', 'Nancy Pelosi', 'Democrat', 'CA', 'No'), voter('J000299', 'Mike Johnson', 'Republican', 'LA', 'Aye'), ...crowd] }
    db.responses.bills = { data: { id: `${C}-hr-1`, title: 'One Big Beautiful Bill Act', source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/1', policy_area: null } }
  }
  const args = { congress: C, chamber: 'house', session: 1, roll: 145 }

  it('returns a whole chamber as short strings grouped by position, with districts from the roster', async () => {
    seed()
    const out = await getRollCall(args)
    expect(out).toMatchObject({
      roll_call_id: ID, chamber: 'house', congress: C, session: 1, roll: 145, question: 'On Passage',
      bill: { id: `${C}-hr-1`, label: 'H.R. 1', title: 'One Big Beautiful Bill Act', canonical: `${SITE}/bill/${C}/hr/1` },
      by_party: { dem: { yea: 0, nay: 212 }, rep: { yea: 214, nay: 2 }, ind: { yea: 1, nay: 0 } },
      result_derived: 'Passed', members_listed: 72,
      canonical: `${SITE}/vote/${C}/house/1/145`,
    })
    expect(out.votes).toBeUndefined()
    expect(out.members_matched).toBeUndefined()
    expect(Object.keys(out.votes_by_position)).toEqual(['Yea', 'Nay'])
    // politicians.district is null; the roster supplies the seat. Clerk synonyms are normalized.
    expect(out.votes_by_position.Yea).toContain('Mike Johnson (R-LA-4) J000299')
    expect(out.votes_by_position.Nay).toContain('Nancy Pelosi (D-CA-11) P000197')
    expect(out.votes_by_position.Yea).toContain('Member 01 (R-TX) X100001')
    expect(out.votes_by_position.Yea.length + out.votes_by_position.Nay.length).toBe(72)
    expect(out.votes_note).toMatch(/Name \(Party-State-District\) BioguideID/)
    expect(JSON.stringify(out).length).toBeLessThan(5000)
  })

  it('returns one object per member when filtered, or on request', async () => {
    seed()
    const two = await getRollCall({ ...args, bioguide_ids: ['p000197', 'J000299'] })
    expect(two.members_matched).toBe(2)
    expect(two.votes).toEqual([
      { bioguide_id: 'J000299', name: 'Mike Johnson', party: 'Republican', state: 'LA', district: '4', position: 'Yea' },
      { bioguide_id: 'P000197', name: 'Nancy Pelosi', party: 'Democrat', state: 'CA', district: '11', position: 'Nay' },
    ])
    expect(two.votes_by_position).toBeUndefined()

    const ohioNays = await getRollCall({ ...args, state: 'Ohio', party: 'D', position: 'nay' })
    expect(ohioNays.votes.length).toBeGreaterThan(0)
    expect(ohioNays.votes.every((v) => v.state === 'OH' && v.party === 'Democrat' && v.position === 'Nay')).toBe(true)
    expect(ohioNays.members_matched).toBe(ohioNays.votes.length)

    expect((await getRollCall({ ...args, format: 'full' })).votes).toHaveLength(72)
    expect((await getRollCall({ ...args, state: 'LA', format: 'compact' })).votes_by_position).toEqual({ Yea: ['Mike Johnson (R-LA-4) J000299'] })
  })

  it('reports a missing roll call and bad filters as errors', async () => {
    db.responses.roll_calls = { data: null }
    expect((await getRollCall({ congress: C, chamber: 'house', session: 2, roll: 4999 })).error).toBe(`No roll call house-${C}-2-4999. Use get_recent_votes to list roll calls.`)
    expect((await getRollCall({ ...args, state: 'Atlantis' })).error).toMatch(/not a state or territory/)
    expect((await getRollCall({ ...args, position: 'maybe' })).error).toBe('position must be Yea, Nay, Present or Not Voting')
    expect((await getRollCall({ chamber: 'lords', congress: C, session: 1, roll: 1 })).error).toMatch(/Need congress, chamber/)
  })
})

describe('search_bills', () => {
  const HIT = { id: `${C}-hr-1`, title: 'One Big Beautiful Bill Act', introduced_at: '2025-05-20', policy_area: 'Economics and Public Finance', source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/1', legislative_stage: 'enacted' }

  it('looks a bill number up directly, and answers a missing number with nothing rather than a title search', async () => {
    db.responses.bills = { data: HIT }
    const found = await searchBills({ query: 'H.R. 1' })
    expect(found.results).toEqual([{ id: `${C}-hr-1`, label: 'H.R. 1', title: 'One Big Beautiful Bill Act', introduced_at: '2025-05-20', policy_area: 'Economics and Public Finance', stage: 'enacted', canonical: `${SITE}/bill/${C}/hr/1`, source_url: HIT.source_url }])
    expect(db.ops('bills', 'eq')[0]).toEqual(['eq', 'id', `${C}-hr-1`])

    db.reset()
    db.responses.etl_metadata = { data: { value: '2026-11-24T06:51:34Z' } }
    db.responses.bills = { data: null }
    const missing = await searchBills({ query: 'hr 99999', congress: 118 })
    expect(missing).toMatchObject({ results: [], note: 'No bill 118-hr-99999 is in the record.' })
    expect(db.tables().filter((t) => t === 'bills')).toHaveLength(1)
  })

  it('requires every word in the title and applies the filters', async () => {
    db.responses.bills = { data: [HIT] }
    const out = await searchBills({ query: 'big  beautiful, (bill)%', congress: 119, stage: 'enacted', sponsor: 'a000055', has_vote: true, limit: 1 })
    expect(out.results).toHaveLength(1)
    expect(db.ops('bills', 'ilike')).toEqual([['ilike', 'title', '%big%'], ['ilike', 'title', '%beautiful%'], ['ilike', 'title', '%bill%']])
    expect(db.ops('bills', 'like')[0]).toEqual(['like', 'id', '119-%'])
    expect(db.ops('bills', 'eq')).toEqual(expect.arrayContaining([['eq', 'legislative_stage', 'enacted'], ['eq', 'sponsor_bioguide_id', 'A000055']]))
    expect(db.ops('bills', 'select')[0][1]).toContain('roll_calls!inner')
    expect(db.ops('bills', 'limit')[0]).toEqual(['limit', 1])
    expect(out.note).toMatch(/Showing the 1 most recently introduced matches/)
  })

  it('explains an empty answer and rejects an empty or malformed search', async () => {
    db.responses.bills = { data: [] }
    expect((await searchBills({ query: 'zzzz' })).note).toMatch(/No bill title matches every word/)
    // A filter alone is a valid search.
    expect((await searchBills({ stage: 'enacted' })).error).toBeUndefined()
    expect((await searchBills({})).error).toBe('Query is required.')
    expect((await searchBills({ query: '   ' })).error).toBe('Query is required.')
    expect((await searchBills({ query: 'x', stage: 'pending' })).error).toMatch(/stage must be one of/)
    expect((await searchBills({ query: 'x', sponsor: 'pelosi' })).error).toMatch(/looks wrong/)
  })
})

describe('search and fetch (the generic pair ChatGPT deep research calls)', () => {
  const BILL = { id: `${C}-hr-1`, title: 'One Big Beautiful Bill Act', introduced_at: '2025-05-20', policy_area: null, source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/1', legislative_stage: 'enacted' }
  const PASSAGE = { id: `house-${C}-1-145`, bill_id: `${C}-hr-1`, question: 'On Passage', description: null, voted_at: '2025-05-22', bills: { id: `${C}-hr-1`, title: 'One Big Beautiful Bill Act' } }
  const OHIO = makeRoster([
    { id: 'M001242', name: 'Bernie Moreno', chamber: 'senate', state: 'OH', party: 'Republican' },
    { id: 'H001104', name: 'Jon Husted', chamber: 'senate', state: 'OH', party: 'Republican' },
    { id: 'V000137', name: 'J. Vance', chamber: 'senate', state: 'OH', party: 'Republican', serving: false },
    { id: 'C001126', name: 'Mike Carey', chamber: 'house', state: 'OH', district: '15', party: 'Republican' },
    { id: 'B001281', name: 'Joyce Beatty', chamber: 'house', state: 'OH', district: '3', party: 'Democrat' },
    { id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', state: 'CA', district: '11', party: 'Democrat' },
  ], C)
  const shape = (r) => Object.keys(r).sort().join(',')

  beforeEach(() => { mocks.getRoster.mockResolvedValue(OHIO) })

  it('search returns { results: [{ id, title, url }] } for a name, with members who left marked', async () => {
    db.responses.bills = { data: [] }
    db.responses.roll_calls = { data: [] }
    const out = await search({ query: 'Nancy Pelosi' })
    expect(out).toEqual({ results: [{ id: 'member:P000197', title: 'Nancy Pelosi, U.S. House (D-CA-11): voting record', url: `${SITE}/politician/P000197-nancy-pelosi` }] })
    const vance = await search({ query: 'Senator Vance' })
    expect(vance.results[0]).toEqual({ id: 'member:V000137', title: 'J. Vance, U.S. Senator (R-OH), no longer serving: voting record', url: `${SITE}/politician/V000137-j-vance` })
  })

  it('search turns a ZIP code into the members who represent it', async () => {
    const out = await search({ query: '43215' })
    expect(out.results.map((r) => r.id)).toEqual(['member:M001242', 'member:H001104', 'member:C001126', 'member:B001281'])
    expect(out.results.every((r) => shape(r) === 'id,title,url' && r.url.startsWith(`${SITE}/politician/`))).toBe(true)
    // The ZIP path never runs a bill or vote search.
    expect(db.tables().filter((t) => t === 'bills' || t === 'roll_calls')).toEqual([])
  })

  it('search finds a bill number inside a question, then its roll calls', async () => {
    db.responses.bills = (call) => (hasOp(call, 'eq', 'id', `${C}-hr-1`) ? { data: BILL } : { data: [] })
    db.responses.roll_calls = (call) => (hasOp(call, 'eq', 'bill_id', `${C}-hr-1`) ? { data: [PASSAGE], count: 1 } : { data: [] })
    db.responses.roll_call_stats = { data: [{ roll_call_id: PASSAGE.id, dem_yea: 0, dem_nay: 212, rep_yea: 214, rep_nay: 2, ind_yea: 1, ind_nay: 0 }] }
    const out = await search({ query: 'How did the House vote on H.R. 1?' })
    expect(out.results).toEqual([
      { id: `bill:${C}-hr-1`, title: 'H.R. 1: One Big Beautiful Bill Act', url: `${SITE}/bill/${C}/hr/1` },
      { id: `vote:house-${C}-1-145`, title: 'House roll call 145, 2025-05-22: On Passage on H.R. 1 One Big Beautiful Bill Act (Passed 215-214)', url: `${SITE}/vote/${C}/house/1/145` },
    ])
  })

  it('search titles a bill by its number alone when the title is missing or a stub', async () => {
    db.responses.bills = { data: [{ ...BILL, id: `${C}-hr-915`, title: 'HR 915' }, { ...BILL, id: `${C}-hr-916`, title: null }] }
    db.responses.roll_calls = { data: [] }
    const out = await search({ query: 'reconciliation' })
    expect(out.results.map((r) => r.title)).toEqual(['H.R. 915', 'H.R. 916'])
  })

  it('search survives a failing part and answers an empty query with no results', async () => {
    db.responses.bills = { data: null, error: { message: 'down' } }
    db.responses.roll_calls = { data: null, error: { message: 'down' } }
    expect((await search({ query: 'Joyce Beatty' })).results.map((r) => r.id)).toEqual(['member:B001281'])
    db.reset()
    expect(await search({ query: '   ' })).toEqual({ results: [] })
    expect(await search({})).toEqual({ results: [] })
    expect(db.calls).toHaveLength(0)
  })

  it('reads an id from search, a bare id, or a BallotWatch URL', () => {
    expect(parseDocumentId('member:p000197')).toEqual({ type: 'member', id: 'P000197' })
    expect(parseDocumentId('P000197')).toEqual({ type: 'member', id: 'P000197' })
    expect(parseDocumentId(`bill:${C}-hr-1`)).toEqual({ type: 'bill', id: `${C}-hr-1` })
    expect(parseDocumentId('bill:H.R. 1')).toEqual({ type: 'bill', id: `${C}-hr-1` })
    expect(parseDocumentId('118-s-5')).toEqual({ type: 'bill', id: '118-s-5' })
    expect(parseDocumentId('vote:House-119-1-145')).toEqual({ type: 'vote', id: 'house-119-1-145' })
    expect(parseDocumentId('senate-119-2-279')).toEqual({ type: 'vote', id: 'senate-119-2-279' })
    expect(parseDocumentId('https://www.ballotwatch.io/politician/P000197-nancy-pelosi/record?x=1')).toEqual({ type: 'member', id: 'P000197' })
    expect(parseDocumentId('https://www.ballotwatch.io/bill/119/hr/1')).toEqual({ type: 'bill', id: '119-hr-1' })
    expect(parseDocumentId('https://www.ballotwatch.io/vote/119/house/1/145#top')).toEqual({ type: 'vote', id: 'house-119-1-145' })
    for (const bad of ['', 'nonsense', 'member:nonsense', 'vote:119-hr-1', 'https://www.ballotwatch.io/about']) expect(parseDocumentId(bad), bad).toBeNull()
  })

  it('fetch returns a member record as Markdown with string metadata', async () => {
    db.responses.politicians = { data: { id: 'V000137', name: 'J. Vance', chamber: 'senate', state: 'OH', district: null, party: 'Republican', photo_url: null } }
    db.responses.member_congress_terms = { data: [{ congress: C, chamber: 'senate', state: 'OH', district: null, party: 'R', term_start: '2025-01-03', term_end: null }] }
    db.responses.member_stats = { data: { congress: C, total_votes: 1, yea_count: 1, nay_count: 0, present_count: 0, not_voting_count: 0 } }
    db.responses.votes = { data: [{ roll_call_id: `senate-${C}-1-1`, position: 'Yea', voted_at: '2025-01-09', source_url: null, bill_id: null, bills: null }], count: 1 }
    db.responses.roll_calls = { data: [{ id: `senate-${C}-1-1`, question: 'On the Motion', description: null, bill_id: null }] }
    db.responses.roll_call_stats = { data: [] }
    const out = await fetchDocument({ id: 'member:V000137' })
    expect(shape(out)).toBe('id,metadata,text,title,url')
    expect(out).toMatchObject({ id: 'member:V000137', title: 'J. Vance, U.S. Senator (R-OH), no longer serving: voting record', url: `${SITE}/politician/V000137-j-vance` })
    expect(out.text).toContain('# J. Vance\'s record in 60 seconds')
    expect(out.text).toContain('On the Motion')
    expect(out.text).toContain('This member is no longer serving in Congress.')
    expect(out.metadata).toEqual({ type: 'member', bioguide_id: 'V000137', source_url: 'https://www.congress.gov/member/V000137', data_updated_at: '2026-11-24T06:51:34Z' })
  })

  it('fetch returns a bill with its explanation source and recorded votes', async () => {
    db.responses.bills = { data: { ...BILL, summary: null, crs_summary: 'Official summary text.', sponsor_bioguide_id: null, sponsor_name: null, sponsor_party: null, sponsor_state: null, updated_at: '2026-01-01' } }
    db.responses.roll_calls = { data: [{ id: PASSAGE.id, question: 'On Passage', description: null, voted_at: '2025-05-22' }] }
    db.responses.roll_call_stats = { data: [{ roll_call_id: PASSAGE.id, dem_yea: 0, dem_nay: 212, rep_yea: 214, rep_nay: 2, ind_yea: 1, ind_nay: 0 }] }
    db.responses.bill_explanations = { data: null }
    const out = await fetchDocument({ id: `${SITE}/bill/${C}/hr/1` })
    expect(out).toMatchObject({ id: `bill:${C}-hr-1`, title: 'H.R. 1: One Big Beautiful Bill Act', url: `${SITE}/bill/${C}/hr/1` })
    expect(out.text).toContain('# H.R. 1: One Big Beautiful Bill Act')
    expect(out.text).toContain('Official summary text.')
    expect(out.text).toMatch(/\| 2025-05-22 \| House \| On Passage \| 215-214 \| Passed \|/)
    expect(out.metadata).toEqual({ type: 'bill', bill_id: `${C}-hr-1`, stage: 'enacted', source_url: BILL.source_url, data_updated_at: '2026-11-24T06:51:34Z' })
  })

  it('fetch returns a roll call with every member grouped by position', async () => {
    const voter = (id, name, party, state, position) => ({ position, source_url: null, voted_at: '2025-05-22', politicians: { id, name, party, state, district: null, chamber: 'house' } })
    db.responses.roll_calls = { data: { id: PASSAGE.id, bill_id: `${C}-hr-1`, question: 'On Passage', description: null, voted_at: '2025-05-22', updated_at: '2026-01-01' } }
    db.responses.roll_call_stats = { data: { dem_yea: 0, dem_nay: 212, rep_yea: 214, rep_nay: 2, ind_yea: 1, ind_nay: 0 } }
    db.responses.votes = { data: [voter('P000197', 'Nancy Pelosi', 'Democrat', 'CA', 'Nay'), voter('C001126', 'Mike Carey', 'Republican', 'OH', 'Yea'), voter('B001281', 'Joyce Beatty', 'Democrat', 'OH', 'Nay')] }
    db.responses.bills = { data: { id: `${C}-hr-1`, title: 'One Big Beautiful Bill Act', source_url: BILL.source_url, policy_area: null } }
    const out = await fetchDocument({ id: `vote:house-${C}-1-145` })
    expect(out).toMatchObject({ id: `vote:house-${C}-1-145`, url: `${SITE}/vote/${C}/house/1/145`, title: 'House roll call 145, 2025-05-22: On Passage on H.R. 1 One Big Beautiful Bill Act (Passed 215-214)' })
    expect(out.text).toContain(`# House roll call 145, ${C}th Congress, session 1`)
    expect(out.text).toContain('- Tally: 215 yea, 214 nay')
    expect(out.text).toContain('- Result (derived from tally and question): Passed')
    expect(out.text).toContain('**Yea (1):** Mike Carey (R-OH-15)')
    expect(out.text).toContain('**Nay (2):** Joyce Beatty (D-OH-3); Nancy Pelosi (D-CA-11)')
    expect(out.text).not.toMatch(/[A-Z]\d{6}/)
    expect(out.metadata).toMatchObject({ type: 'roll_call', roll_call_id: `house-${C}-1-145`, result: 'Passed', source_url: `https://clerk.house.gov/Votes/${1789 + 2 * (C - 1)}145` })
    expect(Object.values(out.metadata).every((v) => typeof v === 'string')).toBe(true)
  })

  it('fetch reports an unknown id or a missing record as an error', async () => {
    expect((await fetchDocument({ id: 'nonsense' })).error).toMatch(/Unknown id\. Use an id returned by search/)
    expect((await fetchDocument({})).error).toMatch(/Unknown id/)
    db.responses.politicians = { data: null }
    expect((await fetchDocument({ id: 'member:Z999999' })).error).toBe('No member with Bioguide ID Z999999')
    db.responses.bills = { data: null }
    expect((await fetchDocument({ id: 'bill:119-hr-99999' })).error).toBe('No bill 119-hr-99999')
    db.responses.roll_calls = { data: null }
    expect((await fetchDocument({ id: `vote:house-${C}-2-4999` })).error).toMatch(/No roll call/)
  })
})
