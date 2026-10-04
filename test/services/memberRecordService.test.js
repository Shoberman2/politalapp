import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSupabaseMock } from '../fixtures/supabaseChain.js'

const db = makeSupabaseMock()
vi.mock('../../src/lib/supabase', () => ({ supabase: { from: (t) => db.from(t) } }))

import { getMemberRecord, recordFromPrerender } from '../../src/services/memberRecord.js'

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
