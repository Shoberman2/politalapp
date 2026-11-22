import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSupabaseMock } from '../fixtures/supabaseChain.js'

const db = makeSupabaseMock()
vi.mock('../../src/lib/supabase', () => ({ supabase: { from: (t) => db.from(t) } }))

import { getMemberRecord, recordFromPrerender, getMemberFaqFacts } from '../../src/services/memberRecord.js'
import { memberTallySentence, memberFaq } from '../../shared/memberFaq.js'
import { memberTallySentence as serverTally, memberFaq as serverFaq } from '../../api/_lib/renderPage.js'

const member = { id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', state: 'CA', district: '11', party: 'Democratic' }

describe('services/memberRecord getMemberRecord', () => {
  beforeEach(() => db.reset())

  it('returns null for a malformed id without touching the database', async () => {
    expect(await getMemberRecord('not-an-id')).toBeNull()
    expect(await getMemberRecord(null)).toBeNull()
    expect(await getMemberRecord('P00019')).toBeNull()
    expect(db.tables()).toEqual([])
  })

  it('upper-cases the id and returns null for an unknown member', async () => {
    db.responses.politicians = { data: null, error: null }
    expect(await getMemberRecord('p000197')).toBeNull()
    expect(db.ops('politicians', 'eq')).toEqual([['eq', 'id', 'P000197']])
  })

  it('throws when the member lookup fails', async () => {
    db.responses.politicians = { data: null, error: { message: 'connection refused' } }
    await expect(getMemberRecord('P000197')).rejects.toThrow('connection refused')
  })

  it('throws when the votes lookup fails', async () => {
    db.responses.politicians = { data: member, error: null }
    db.responses.votes = { data: null, error: { message: 'timeout' } }
    await expect(getMemberRecord('P000197')).rejects.toThrow('timeout')
  })

  it.each([
    ['member_congress_terms', 'terms timeout'],
    ['member_stats', 'stats timeout'],
    ['roll_calls', 'rc timeout'],
    ['roll_call_stats', 'rcs timeout'],
  ])('throws when %s fails instead of rendering an empty record', async (table, message) => {
    db.responses.politicians = { data: member, error: null }
    db.responses.votes = { data: [{ roll_call_id: 'house-119-2-295', position: 'Nay', voted_at: '2026-09-03' }], error: null, count: 1 }
    db.responses[table] = { data: null, error: { message } }
    await expect(getMemberRecord('P000197')).rejects.toThrow(message)
  })

  it('skips the roll-call queries when the member has no votes and reports a thin record', async () => {
    db.responses.politicians = { data: member, error: null }
    db.responses.votes = { data: [], error: null, count: 0 }
    const r = await getMemberRecord('P000197')
    expect(r.kind).toBe('record')
    expect(r.id).toBe('P000197')
    expect(r.recentVotes).toEqual([])
    expect(r.voteCount).toBe(0)
    expect(r.thin).toBe(true)
    expect(db.tables()).not.toContain('roll_calls')
    expect(db.tables()).not.toContain('roll_call_stats')
  })

  it('loads roll calls for distinct vote ids, uses the exact count, and never reads campaign-finance tables', async () => {
    db.responses.politicians = { data: member, error: null }
    db.responses.votes = {
      data: [
        { roll_call_id: 'house-119-2-295', position: 'Nay', voted_at: '2026-09-03', source_url: 'https://clerk.house.gov/Votes/2026295', bill_id: '119-hr-4795', bills: { id: '119-hr-4795', title: 'WRDA' } },
        { roll_call_id: 'house-119-2-295', position: 'Nay', voted_at: '2026-09-03', source_url: null, bill_id: null, bills: null },
        { roll_call_id: null, position: 'Yea', voted_at: '2026-09-02' },
      ],
      error: null,
      count: 676,
    }
    db.responses.roll_calls = { data: [{ id: 'house-119-2-295', question: 'On Passage' }] }
    db.responses.roll_call_stats = { data: [] }
    db.responses.etl_metadata = { data: { value: '2026-10-02T12:00:00Z' } }

    const r = await getMemberRecord('P000197')
    expect(db.ops('roll_calls', 'in')).toEqual([['in', 'id', ['house-119-2-295']]])
    expect(r.voteCount).toBe(676)
    expect(r.thin).toBe(false)
    expect(r.updatedAt).toBe('2026-10-02T12:00:00Z')
    expect(r.recentVotes.length).toBe(2)
    expect(db.tables().some((t) => /fec|donor|donation|contribut/i.test(t))).toBe(false)
  })
})

describe('services/memberRecord recordFromPrerender', () => {
  const data = { kind: 'record', id: 'P000197', recentVotes: [] }

  it('accepts the embedded record for the same member, case-insensitively', () => {
    expect(recordFromPrerender(data, 'p000197')).toBe(data)
  })

  it('rejects missing data, another page kind, another member, or a malformed record', () => {
    expect(recordFromPrerender(null, 'P000197')).toBeNull()
    expect(recordFromPrerender({ ...data, kind: 'member' }, 'P000197')).toBeNull()
    expect(recordFromPrerender({ ...data, id: undefined }, 'P000197')).toBeNull()
    expect(recordFromPrerender(data, 'S000148')).toBeNull()
    expect(recordFromPrerender({ kind: 'record', id: 'P000197' }, 'P000197')).toBeNull()
  })
})

describe('services/memberRecord getMemberFaqFacts', () => {
  beforeEach(() => db.reset())
  const stats = { congress: 119, total_votes: 689, yea_count: 272, nay_count: 396, present_count: 2, not_voting_count: 19 }

  it('takes the House seat from the open term when politicians.district is null, as the server does', async () => {
    db.responses.politicians = { data: { name: 'Alexandria Ocasio-Cortez', chamber: 'house', party: 'Democrat', state: 'NY', district: null }, error: null }
    db.responses.member_congress_terms = { data: [{ congress: 119, district: '14', term_end: null }, { congress: 118, district: '14', term_end: '2025-01-03' }], error: null }
    db.responses.member_stats = { data: stats, error: null }
    const facts = await getMemberFaqFacts('o000172')
    expect(facts).toEqual({ name: 'Alexandria Ocasio-Cortez', party: 'Democrat', state: 'NY', district: '14', stats })
    expect(memberTallySentence(facts)).toBe('Alexandria Ocasio-Cortez (D-NY-14) has 689 recorded roll-call votes in the 119th Congress: 272 yea, 396 nay, 2 present, 19 not voting.')
    // The server page object for the same member yields the same text.
    const serverMember = { ...facts, id: 'O000172', chamber: 'house', votes: [], voteCount: 689 }
    expect(serverTally(serverMember)).toBe(memberTallySentence(facts))
    expect(serverFaq(serverMember)).toEqual(memberFaq(facts))
  })

  it('gives senators no district, and returns null on a failed read or a malformed id', async () => {
    db.responses.politicians = { data: { name: 'Charles Schumer', chamber: 'senate', party: 'Democrat', state: 'NY', district: null }, error: null }
    db.responses.member_congress_terms = { data: [{ congress: 119, district: null, term_end: null }], error: null }
    db.responses.member_stats = { data: { ...stats, present_count: 0 }, error: null }
    expect(memberTallySentence(await getMemberFaqFacts('S000148'))).toMatch(/^Charles Schumer \(D-NY\) has 689 .*0 present/)
    db.responses.member_stats = { data: null, error: { message: 'timeout' } }
    expect(await getMemberFaqFacts('S000148')).toBeNull()
    expect(await getMemberFaqFacts('nope')).toBeNull()
  })
})
