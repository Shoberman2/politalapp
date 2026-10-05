import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '../fixtures/supabaseChain.js'

const db = makeSupabaseMock()
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: (t) => db.from(t) } }))

import { getMemberPage, getRollCallPage, getBillPage } from '../../api/_lib/pages.js'
import { _resetEtlMetaCache } from '../../api/_lib/etlMeta.js'

// `updatedAt` comes through etlMeta's per-instance cache, so every scenario
// starts from an empty cache as well as an empty mock database.
const reset = () => { db.reset(); _resetEtlMetaCache() }

const person = (id, name, extra = {}) => ({ id, name, party: 'Democratic', state: 'CA', district: '11', chamber: 'house', ...extra })

describe('pages loaders', () => {
  beforeEach(reset)

  it('builds a member page: seat from the open term, placeholder bill titles nulled, questions joined', async () => {
    db.responses.politicians = { data: { id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', state: 'CA', district: null, party: 'Democratic', photo_url: null, updated_at: '2026-09-01' } }
    db.responses.member_congress_terms = { data: [
      { congress: 119, chamber: 'house', state: 'CA', district: '11', party: 'D', term_start: '2025-01-03', term_end: null },
      { congress: 118, chamber: 'house', state: 'CA', district: '12', party: 'D', term_start: '2023-01-03', term_end: '2025-01-03' },
    ] }
    db.responses.member_stats = { data: { congress: 119, total_votes: 890, yea_count: 400, nay_count: 380, present_count: 0, not_voting_count: 110, party_loyalty_pct: 94 } }
    db.responses.votes = { count: 890, data: [
      { roll_call_id: 'house-119-2-295', position: 'Nay', voted_at: '2026-09-03', source_url: 'https://clerk.house.gov/Votes/2026295', bill_id: '119-hr-4795', bills: { id: '119-hr-4795', title: 'HR 4795' } },
      { roll_call_id: 'house-119-2-294', position: 'Yea', voted_at: '2026-09-03', source_url: null, bill_id: '119-hr-1', bills: null },
      { roll_call_id: 'house-119-2-293', position: 'Yea', voted_at: '2026-09-02', source_url: null, bill_id: null, bills: null },
    ] }
    db.responses.roll_calls = { data: [{ id: 'house-119-2-295', question: 'On Passage' }] }
    db.responses.etl_metadata = { data: { value: '2026-09-05T10:25:32Z' } }

    const page = await getMemberPage('p000197')
    expect(page.kind).toBe('member')
    expect(page.district).toBe('11')           // politicians.district is null; the open term carries the seat
    expect(page.voteCount).toBe(890)           // the exact count, not the 50-row page
    expect(page.indexable).toBe(true)
    expect(page.votes[0].bill).toEqual({ id: '119-hr-4795', title: null })   // "HR 4795" is a stub, not a title
    expect(page.votes[0].question).toBe('On Passage')
    expect(page.votes[1].bill).toEqual({ id: '119-hr-1', title: null })      // bill row missing, id kept
    expect(page.votes[1].question).toBeNull()
    expect(page.votes[2].bill).toBeNull()
    expect(page.source_url).toBe('https://bioguide.congress.gov/search/bio/P000197')
    expect(page.updatedAt).toBe('2026-09-05T10:25:32Z')
    expect(db.ops('roll_calls', 'in')[0]).toEqual(['in', 'id', ['house-119-2-295', 'house-119-2-294', 'house-119-2-293']])

    // Senators never carry a district, even when a term row has one.
    reset()
    db.responses.politicians = { data: { id: 'P000145', name: 'Alex Padilla', chamber: 'senate', state: 'CA', district: null, party: 'Democratic' } }
    db.responses.member_congress_terms = { data: [{ congress: 119, chamber: 'senate', state: 'CA', district: '0', term_end: null }] }
    db.responses.votes = { count: 0, data: [] }
    const senator = await getMemberPage('P000145')
    expect(senator.district).toBeNull()
    expect(senator).toMatchObject({ indexable: false, noindexReason: 'no_votes', stats: null })
    expect(db.tables()).not.toContain('roll_calls')   // no votes, no question lookup

    // Malformed ids never touch the database; unknown ids return null.
    reset()
    expect(await getMemberPage('nancy')).toBeNull()
    expect(db.calls).toHaveLength(0)
    db.responses.politicians = { data: null }
    expect(await getMemberPage('Z999999')).toBeNull()
  })

  it('keeps a roll call out of the index when member rows disagree with the stats tally', async () => {
    db.responses.roll_calls = { data: { id: 'house-119-2-295', bill_id: '119-hr-4795', question: 'On Passage', description: null, voted_at: '2026-09-03' } }
    db.responses.roll_call_stats = { data: { dem_yea: 200, dem_nay: 10, rep_yea: 180, rep_nay: 30, ind_yea: 0, ind_nay: 0 } }
    db.responses.votes = { data: [
      { position: 'Nay', source_url: 'https://clerk.house.gov/Votes/2026295', voted_at: '2026-09-03', politicians: person('P000197', 'Nancy Pelosi') },
      { position: 'Yea', source_url: 'https://clerk.house.gov/Votes/2026295', voted_at: '2026-09-03', politicians: person('A000055', 'Robert Aderholt', { party: 'Republican', state: 'AL', district: '4' }) },
      { position: 'Not Voting', source_url: null, voted_at: '2026-09-03', politicians: person('B001314', 'Aaron Bean', { party: 'Republican', state: 'FL', district: '4' }) },
      { position: 'Yea', source_url: null, voted_at: '2026-09-03', politicians: null },   // orphan row, dropped
    ] }
    db.responses.bills = { data: { id: '119-hr-4795', title: 'HR 4795', source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/4795', policy_area: null } }
    db.responses.etl_metadata = { data: { value: '2026-09-05T10:25:32Z' } }

    const rc = await getRollCallPage('HOUSE-119-2-295')
    expect(rc).toMatchObject({ kind: 'vote', id: 'house-119-2-295', chamber: 'House', chamberKey: 'house', congress: 119, session: 2, roll: 295 })
    // The stats tally (420 yea+nay) supplies the numbers, but only 2 member rows are Yea/Nay.
    expect(rc.tally).toEqual({ yea: 380, nay: 40, present: 0, notVoting: 1 })
    expect(rc.indexable).toBe(false)
    expect(rc.noindexReason).toBe('tally_mismatch')
    expect(rc.result).toBe('Passed')           // still derived: the tally itself is sane
    expect(rc.resultKind).toBe('passed')
    expect(rc.party).toEqual({ dem: { yea: 200, nay: 10 }, rep: { yea: 180, nay: 30 }, ind: { yea: 0, nay: 0 } })
    expect(rc.bill).toEqual({ id: '119-hr-4795', title: null, source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/4795', policy_area: null })
    expect(rc.votes.map((v) => v.member.name)).toEqual(['Aaron Bean', 'Nancy Pelosi', 'Robert Aderholt'])
    expect(rc.source_url).toBe('https://clerk.house.gov/Votes/2026295')
    expect(db.ops('bills', 'eq')[0]).toEqual(['eq', 'id', '119-hr-4795'])
    expect(db.ops('votes', 'limit')[0]).toEqual(['limit', 600])   // MAX_ROLL_CALL_ROWS
  })

  it('falls back to counting member rows when roll_call_stats is empty, and returns null for unknown ids', async () => {
    db.responses.roll_calls = { data: { id: 'senate-119-1-262', bill_id: null, question: 'On the Cloture Motion', description: 'Motion to invoke cloture', voted_at: null } }
    db.responses.roll_call_stats = { data: null }
    db.responses.votes = { data: [
      { position: 'Yea', source_url: 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00262.htm', voted_at: '2025-07-01', politicians: person('P000145', 'Alex Padilla', { chamber: 'senate', district: null }) },
      { position: 'Yea', source_url: null, voted_at: '2025-07-01', politicians: person('S001150', 'Adam Schiff', { chamber: 'senate', district: null }) },
      { position: 'Nay', source_url: null, voted_at: '2025-07-01', politicians: person('C001056', 'John Cornyn', { chamber: 'senate', party: 'Republican', state: 'TX', district: null }) },
    ] }
    db.responses.etl_metadata = { data: null }

    const rc = await getRollCallPage('senate-119-1-262')
    expect(rc.tally).toEqual({ yea: 2, nay: 1, present: 0, notVoting: 0 })
    expect(rc.party).toBeNull()
    expect(rc.indexable).toBe(true)                 // no stats to disagree with; the counted tally is sane
    expect(rc.result).toBeNull()                    // majority under 60 on a non-nomination cloture: no claim
    expect(rc.resultKind).toBeNull()
    expect(rc.voted_at).toBe('2025-07-01')          // roll_calls.voted_at missing; the first member row fills it
    expect(rc.source_url).toContain('senate.gov')
    expect(rc.bill).toBeNull()
    expect(rc.updatedAt).toBeNull()
    expect(db.tables()).not.toContain('bills')

    // The same motion with the nominee in the description is a simple-majority cloture.
    reset()
    db.responses.roll_calls = { data: { id: 'senate-119-1-262', bill_id: null, question: 'On the Cloture Motion', description: 'Nomination of Jane Doe to be United States District Judge', voted_at: '2025-07-01' } }
    db.responses.votes = { data: [
      { position: 'Yea', voted_at: '2025-07-01', politicians: person('P000145', 'Alex Padilla', { chamber: 'senate', district: null }) },
      { position: 'Yea', voted_at: '2025-07-01', politicians: person('S001150', 'Adam Schiff', { chamber: 'senate', district: null }) },
      { position: 'Nay', voted_at: '2025-07-01', politicians: person('C001056', 'John Cornyn', { chamber: 'senate', party: 'Republican', state: 'TX', district: null }) },
    ] }
    const nomination = await getRollCallPage('senate-119-1-262')
    expect(nomination.result).toBe('Cloture invoked')
    expect(nomination.resultKind).toBe('passed')

    // No member rows and no stats: no tally, no result, not indexable.
    reset()
    db.responses.roll_calls = { data: { id: 'senate-119-1-1', bill_id: null, question: 'On the Motion', description: null, voted_at: '2025-01-03' } }
    db.responses.votes = { data: [] }
    const empty = await getRollCallPage('senate-119-1-1')
    expect(empty.tally).toBeNull()
    expect(empty.result).toBeNull()
    // The official record URL comes from the roll-call id, not from member rows.
    expect(empty).toMatchObject({ indexable: false, noindexReason: 'no_tally', votes: [], source_url: 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00001.htm', voted_at: '2025-01-03' })

    reset()
    expect(await getRollCallPage('house-119-295')).toBeNull()   // three-part id is not a roll call
    expect(db.calls).toHaveLength(0)
    db.responses.roll_calls = { data: null }
    expect(await getRollCallPage('house-119-2-9999')).toBeNull()
  })

  it('discards a cached explanation written for a different title and keeps one that matches', async () => {
    const billRow = {
      id: '119-hr-1', title: 'An act to provide for reconciliation pursuant to title II of H. Con. Res. 14.',
      introduced_at: '2025-07-04', summary: null, crs_summary: null, policy_area: null,
      source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/1',
      sponsor_bioguide_id: 'A000375', sponsor_name: 'Jodey Arrington', sponsor_party: 'R', sponsor_state: 'TX',
      legislative_stage: 'enacted', updated_at: '2026-09-01',
    }
    db.responses.bills = { data: billRow }
    db.responses.roll_calls = { data: [
      { id: 'house-119-1-190', question: 'On Passage', voted_at: '2025-07-03' },
      { id: 'senate-119-1-262', question: 'On Passage', voted_at: '2025-07-01' },
    ] }
    db.responses.bill_explanations = { data: { paragraphs: ['The For the People Act of 2025 is a piece of legislation aimed at expanding voting access.'], bill_title: 'For the People Act of 2025' } }
    db.responses.roll_call_stats = { data: [
      { roll_call_id: 'house-119-1-190', dem_yea: 0, dem_nay: 212, rep_yea: 218, rep_nay: 2, ind_yea: 0, ind_nay: 0 },
      { roll_call_id: 'senate-119-1-262', dem_yea: 0, dem_nay: 47, rep_yea: 60, rep_nay: 3, ind_yea: 0, ind_nay: 0 },   // 110 in a 100-seat chamber: corrupt
    ] }
    db.responses.etl_metadata = { data: { value: '2026-09-05T10:25:32Z' } }

    const bill = await getBillPage('119-HR-1')
    expect(bill).toMatchObject({ kind: 'bill', id: '119-hr-1', label: 'H.R. 1', congress: '119', billType: 'hr', number: '1' })
    expect(bill.oneLiner).toBeNull()
    expect(bill.explanationDiscarded).toBe(true)
    expect(bill.summary).toBeNull()
    expect(bill.indexable).toBe(true)          // a recorded vote is enough
    expect(bill.sponsor).toEqual({ id: 'A000375', name: 'Jodey Arrington', party: 'R', state: 'TX' })
    expect(bill.rollCalls[0]).toEqual({ id: 'house-119-1-190', chamber: 'House', question: 'On Passage', voted_at: '2025-07-03', tally: { yea: 218, nay: 214 }, result: 'Passed', resultKind: 'passed' })
    expect(bill.rollCalls[1]).toMatchObject({ id: 'senate-119-1-262', chamber: 'Senate', tally: null, result: null, resultKind: null })
    expect(db.ops('bill_explanations', 'eq')).toEqual([['eq', 'bill_key', '119-hr-1'], ['eq', 'model', 'gpt-4o-mini'], ['eq', 'prompt_version', 2]])
    expect(db.ops('roll_call_stats', 'in')[0]).toEqual(['in', 'roll_call_id', ['house-119-1-190', 'senate-119-1-262']])

    // Same bill, an explanation generated under the current title: kept.
    reset()
    db.responses.bills = { data: { ...billRow, crs_summary: 'Provides for reconciliation.' } }
    db.responses.roll_calls = { data: [] }
    db.responses.bill_explanations = { data: { paragraphs: ['This Act provides for budget reconciliation.'], bill_title: billRow.title } }
    const kept = await getBillPage('119-hr-1')
    expect(kept.oneLiner).toBe('This Act provides for budget reconciliation.')
    expect(kept.explanationDiscarded).toBe(false)
    expect(kept.summary).toBe('Provides for reconciliation.')
    expect(kept.rollCalls).toEqual([])
    expect(kept.indexable).toBe(true)          // a summary alone is enough
    expect(db.tables()).not.toContain('roll_call_stats')

    // A stub title with nothing behind it stays out of the index; bad ids and unknown bills return null.
    reset()
    db.responses.bills = { data: { ...billRow, id: '119-hr-915', title: 'HR 915', sponsor_bioguide_id: null } }
    db.responses.roll_calls = { data: [] }
    const stub = await getBillPage('119-hr-915')
    expect(stub).toMatchObject({ indexable: false, noindexReason: 'placeholder_title', sponsor: null, oneLiner: null, explanationDiscarded: false })
    reset()
    expect(await getBillPage('hr1')).toBeNull()
    expect(db.calls).toHaveLength(0)
    db.responses.bills = { data: null }
    expect(await getBillPage('119-hr-999999')).toBeNull()
  })
})
