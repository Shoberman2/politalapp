import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSupabaseMock } from '../fixtures/supabaseChain.js'

const db = makeSupabaseMock()
vi.mock('../../src/lib/supabase', () => ({ supabase: { from: (t) => db.from(t) } }))

import { getMemberVotesOnBillAfter } from '../../src/services/laterVotes.js'

describe('services/laterVotes', () => {
  beforeEach(() => db.reset())

  it('reads only this member’s votes on this bill after the day, with the roll-call question', async () => {
    db.responses.votes = { data: [
      { position: 'Nay', voted_at: '2026-10-08', roll_call_id: 'house-119-2-310' },
      { position: 'Yea', voted_at: '2026-10-08', roll_call_id: 'house-119-2-301' },
      { position: 'Not Voting', voted_at: '2026-10-12', roll_call_id: null },
    ] }
    db.responses.roll_calls = { data: [{ id: 'house-119-2-301', question: 'On Passage' }, { id: 'house-119-2-310', question: null }] }

    const votes = await getMemberVotesOnBillAfter({ bioguideId: 'p000197', billId: '119-HR-1', afterDay: '2026-10-03' })

    expect(db.ops('votes', 'eq')).toEqual([['eq', 'politician_id', 'P000197'], ['eq', 'bill_id', '119-hr-1']])
    // Inclusive of the send day: a vote later that same day counts.
    expect(db.ops('votes', 'gte')).toEqual([['gte', 'voted_at', '2026-10-03']])
    expect(db.ops('votes', 'gt')).toEqual([])
    expect(db.ops('roll_calls', 'in')).toEqual([['in', 'id', ['house-119-2-310', 'house-119-2-301']]])
    expect(votes).toEqual([
      { position: 'Yea', votedAt: '2026-10-08', rollCallId: 'house-119-2-301', rollNumber: 301, chamber: 'House', href: '/vote/119/house/2/301', question: 'On Passage' },
      { position: 'Nay', votedAt: '2026-10-08', rollCallId: 'house-119-2-310', rollNumber: 310, chamber: 'House', href: '/vote/119/house/2/310', question: null },
      { position: 'Not Voting', votedAt: '2026-10-12', rollCallId: null, rollNumber: null, chamber: null, href: null, question: null },
    ])
  })

  it('keeps a vote cast on the same day the person wrote', async () => {
    db.responses.votes = { data: [{ position: 'Yea', voted_at: '2026-10-03', roll_call_id: 'house-119-2-290' }] }
    db.responses.roll_calls = { data: [] }
    const votes = await getMemberVotesOnBillAfter({ bioguideId: 'P000197', billId: '119-hr-1', afterDay: '2026-10-03' })
    expect(votes.map((v) => v.votedAt)).toEqual(['2026-10-03'])
  })

  it('returns [] when there are no later votes, without a second query', async () => {
    db.responses.votes = { data: [] }
    expect(await getMemberVotesOnBillAfter({ bioguideId: 'P000197', billId: '119-hr-1', afterDay: '2026-10-03' })).toEqual([])
    expect(db.tables()).toEqual(['votes'])
  })

  it('returns null when the lookup fails, and [] for unusable input', async () => {
    db.responses.votes = { data: null, error: { message: 'boom' } }
    expect(await getMemberVotesOnBillAfter({ bioguideId: 'P000197', billId: '119-hr-1', afterDay: '2026-10-03' })).toBeNull()
    db.reset()
    expect(await getMemberVotesOnBillAfter({ bioguideId: 'P000197', billId: '', afterDay: '2026-10-03' })).toEqual([])
    expect(await getMemberVotesOnBillAfter({ bioguideId: 'P000197', billId: '119-hr-1', afterDay: 'Oct 3' })).toEqual([])
    expect(db.tables()).toEqual([])
  })

  it('keeps the votes when the question lookup fails', async () => {
    db.responses.votes = { data: [{ position: 'Yea', voted_at: '2026-10-08', roll_call_id: 'senate-119-2-12' }] }
    db.responses.roll_calls = { data: null, error: { message: 'nope' } }
    const votes = await getMemberVotesOnBillAfter({ bioguideId: 'P000145', billId: '119-hr-1', afterDay: '2026-10-03' })
    expect(votes).toEqual([{ position: 'Yea', votedAt: '2026-10-08', rollCallId: 'senate-119-2-12', rollNumber: 12, chamber: 'Senate', href: '/vote/119/senate/2/12', question: null }])
  })
})
