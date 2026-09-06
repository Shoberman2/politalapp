import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '../fixtures/supabaseChain.js'

const db = makeSupabaseMock()
vi.mock('../../src/lib/supabase', () => ({ supabase: { from: (t) => db.from(t) } }))

import { getRollCall, billFromId, fromPrerender } from '../../src/services/rollCall.js'
import { rollCallHref, parseRollCallId } from '../../src/services/floorVotes.js'

const member = (id, name, extra = {}) => ({ id, name, party: 'Democratic', state: 'CA', district: '11', ...extra })
const rows = [
  { position: 'Nay', source_url: 'https://clerk.house.gov/Votes/2026295', voted_at: '2026-09-03', politicians: member('P000197', 'Nancy Pelosi') },
  { position: 'Yea', source_url: 'https://clerk.house.gov/Votes/2026295', voted_at: '2026-09-03', politicians: member('A000055', 'Robert Aderholt', { party: 'Republican', state: 'AL', district: '4' }) },
  { position: 'Yea', source_url: null, voted_at: '2026-09-03', politicians: member('B001314', 'Aaron Bean', { party: 'Republican', state: 'FL', district: '4' }) },
  { position: 'Not Voting', source_url: null, voted_at: '2026-09-03', politicians: member('C001120', 'Dan Crenshaw', { party: 'Republican', state: 'TX', district: '2' }) },
  { position: 'Yea', source_url: null, voted_at: '2026-09-03', politicians: null },   // orphan row, dropped
]

describe('services/rollCall', () => {
  beforeEach(() => db.reset())

  it('loads one roll call with a trusted tally, derived result, bill link, and members sorted by name', async () => {
    db.responses.roll_calls = { data: { id: 'house-119-2-295', bill_id: '119-hr-4795', question: 'On Passage', description: null, voted_at: '2026-09-03' } }
    db.responses.roll_call_stats = { data: { dem_yea: 200, dem_nay: 10, rep_yea: 180, rep_nay: 30, ind_yea: 0, ind_nay: 0 } }
    db.responses.votes = { data: rows }
    db.responses.bills = { data: { id: '119-hr-4795', title: 'Water Resources Development Act of 2026', source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/4795' } }

    const rc = await getRollCall({ congress: '119', chamber: 'House', session: '2', roll: '295' })
    expect(rc).toMatchObject({ id: 'house-119-2-295', chamberKey: 'house', chamber: 'House', congress: 119, session: 2, number: 295, question: 'On Passage', votedAt: '2026-09-03' })
    expect(rc.tally).toEqual({ yea: 380, nay: 40, present: 0, notVoting: 1 })
    expect(rc.result).toBe('Passed')
    expect(rc.party).toEqual({ dem: { yea: 200, nay: 10 }, rep: { yea: 180, nay: 30 }, ind: { yea: 0, nay: 0 } })
    expect(rc.bill).toEqual({ id: '119-hr-4795', label: 'H.R. 4795', href: '/bill/119/hr/4795', title: 'Water Resources Development Act of 2026', source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/4795' })
    expect(rc.sourceUrl).toBe('https://clerk.house.gov/Votes/2026295')
    expect(rc.votes.map((v) => v.member.name)).toEqual(['Aaron Bean', 'Dan Crenshaw', 'Nancy Pelosi', 'Robert Aderholt'])
    expect(db.ops('roll_calls', 'eq')[0]).toEqual(['eq', 'id', 'house-119-2-295'])
    expect(db.ops('votes', 'limit')[0]).toEqual(['limit', 600])

    // A corrupt stats row (more votes than seats) is refused: no tally, no result; the party split stays as recorded.
    db.reset()
    db.responses.roll_calls = { data: { id: 'house-119-2-295', bill_id: null, question: 'On Passage', description: 'Providing for consideration', voted_at: null } }
    db.responses.roll_call_stats = { data: { dem_yea: 300, dem_nay: 20, rep_yea: 200, rep_nay: 30, ind_yea: 0, ind_nay: 0 } }
    db.responses.votes = { data: rows }
    const corrupt = await getRollCall({ congress: 119, chamber: 'house', session: 2, roll: 295 })
    expect(corrupt.tally).toBeNull()
    expect(corrupt.result).toBeNull()
    expect(corrupt.party.dem.yea).toBe(300)
    expect(corrupt.bill).toBeNull()
    expect(corrupt.votedAt).toBe('2026-09-03')     // falls back to the first member row
    expect(db.tables()).not.toContain('bills')

    // No stats row: count the member rows instead.
    db.reset()
    db.responses.roll_calls = { data: { id: 'house-119-2-295', bill_id: null, question: 'On Motion to Suspend the Rules and Pass', description: null, voted_at: '2026-09-03' } }
    db.responses.votes = { data: rows }
    const counted = await getRollCall({ congress: 119, chamber: 'house', session: 2, roll: 295 })
    expect(counted.tally).toEqual({ yea: 2, nay: 1, present: 0, notVoting: 1 })
    expect(counted.result).toBe('Passed')          // 2 of 3 clears two-thirds
    expect(counted.party).toBeNull()

    // A nomination cloture reads the nominee from the description: a simple majority invokes it.
    db.reset()
    db.responses.roll_calls = { data: { id: 'senate-119-1-262', bill_id: null, question: 'On the Cloture Motion', description: 'Nomination of Jane Doe to be United States District Judge', voted_at: '2025-07-01' } }
    db.responses.votes = { data: rows }
    const cloture = await getRollCall({ congress: 119, chamber: 'senate', session: 1, roll: 262 })
    expect(cloture.result).toBe('Cloture invoked')

    // Unknown chamber or missing row: null, and the bad chamber never queries.
    db.reset()
    expect(await getRollCall({ congress: 119, chamber: 'joint', session: 2, roll: 1 })).toBeNull()
    expect(db.calls).toHaveLength(0)
    db.responses.roll_calls = { data: null }
    expect(await getRollCall({ congress: 119, chamber: 'senate', session: 1, roll: 9999 })).toBeNull()

    // The server-rendered record adapts to this page's shape so the first render needs no fetch.
    const embedded = fromPrerender({ kind: 'vote', id: 'senate-119-1-262', question: 'On the Cloture Motion', description: 'Nomination of Jane Doe', voted_at: '2025-07-01', bill: { id: '119-s-1', title: null, source_url: null }, tally: { yea: 52, nay: 48, present: 0, notVoting: 0 }, party: null, result: 'Cloture invoked', source_url: 'https://www.senate.gov/x', votes: [{ position: 'Yea', member: { id: 'P000145', name: 'Alex Padilla' } }] })
    expect(embedded).toMatchObject({ id: 'senate-119-1-262', chamberKey: 'senate', chamber: 'Senate', congress: 119, session: 1, number: 262, votedAt: '2025-07-01', sourceUrl: 'https://www.senate.gov/x', result: 'Cloture invoked', party: null })
    expect(embedded.bill).toEqual({ id: '119-s-1', label: 'S. 1', href: '/bill/119/s/1', title: null, source_url: null })
    expect(embedded.votes).toEqual([{ position: 'Yea', member: { id: 'P000145', name: 'Alex Padilla' } }])
    expect(fromPrerender(null)).toBeNull()
    expect(fromPrerender({ kind: 'member', id: 'P000197' })).toBeNull()
    expect(fromPrerender({ kind: 'vote', id: 'house-119-295' })).toBeNull()

    // Pure helpers used by this page and by the Landing feed links.
    expect(billFromId('119-hjres-4')).toEqual({ id: '119-hjres-4', label: 'H.J.Res. 4', href: '/bill/119/hjres/4' })
    expect(billFromId('bogus')).toBeNull()
    expect(billFromId(null)).toBeNull()
    expect(rollCallHref('house-119-2-225')).toBe('/vote/119/house/2/225')
    expect(rollCallHref('senate-119-1-262')).toBe('/vote/119/senate/1/262')
    expect(rollCallHref('house-119-225')).toBeNull()
    expect(rollCallHref(null)).toBeNull()
    expect(parseRollCallId('senate-119-1-262')).toEqual({ chamberKey: 'senate', chamber: 'Senate', congress: 119, session: 1, number: 262 })
  })
})
