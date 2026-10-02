import { describe, it, expect } from 'vitest'
import {
  shapeMemberRecord, shapeRecordStats, normalizePosition, recordBill, recordPath,
  recordSummary, recordSeatCode, RECORD_VOTE_LIMIT,
} from '../../shared/memberRecord.js'

const pelosi = { id: 'p000197', name: 'Nancy Pelosi', chamber: 'house', state: 'CA', district: null, party: 'Democratic', photo_url: null }
const terms = [
  { congress: 118, chamber: 'house', state: 'CA', district: '11', term_start: '2023-01-03', term_end: null },
  { congress: 119, chamber: 'house', state: 'CA', district: '11', term_start: '2025-01-03', term_end: null },
]
const stats = { congress: 119, total_votes: 676, yea_count: 256, nay_count: 355, present_count: 4, not_voting_count: 61, party_loyalty_pct: 99 }

const vote = (n, extra = {}) => ({
  roll_call_id: `house-119-2-${n}`, position: 'Yea', voted_at: `2026-09-${String((n % 28) + 1).padStart(2, '0')}`,
  source_url: `https://clerk.house.gov/Votes/2026${n}`, bill_id: null, bills: null, ...extra,
})

describe('shared/memberRecord', () => {
  it('shapes the same facts from raw rows: seat, term, counts, ten votes with derived results', () => {
    const votes = Array.from({ length: 12 }, (_, i) => vote(300 - i))
    votes[0] = vote(300, { position: 'Nay', bill_id: '119-hr-4795', bills: { id: '119-hr-4795', title: 'Water Resources Development Act of 2026' } })
    votes[1] = vote(299, { bill_id: '119-hr-915', bills: { id: '119-hr-915', title: 'HR 915' } })
    const r = shapeMemberRecord({
      member: pelosi, terms, stats, votes, voteCount: 676,
      rollCalls: [
        { id: 'house-119-2-300', question: 'On Passage', description: null },
        { id: 'house-119-2-299', question: 'On Motion to Suspend the Rules and Pass', description: null },
      ],
      rollCallStats: [
        { roll_call_id: 'house-119-2-300', dem_yea: 200, dem_nay: 10, rep_yea: 180, rep_nay: 30, ind_yea: 0, ind_nay: 0 },
        { roll_call_id: 'house-119-2-299', dem_yea: 150, dem_nay: 60, rep_yea: 100, rep_nay: 100, ind_yea: 0, ind_nay: 0 },   // 250-160: short of two-thirds
        { roll_call_id: 'house-119-2-298', dem_yea: 300, dem_nay: 0, rep_yea: 300, rep_nay: 0, ind_yea: 0, ind_nay: 0 },     // 600 in a 435 seat chamber
      ],
      updatedAt: '2026-10-02T12:12:53Z',
    })

    expect(r).toMatchObject({ kind: 'record', id: 'P000197', district: '11', congress: 119, servingSince: '2025-01-03', voteCount: 676, thin: false, updatedAt: '2026-10-02T12:12:53Z' })
    expect(r.stats).toEqual({ congress: 119, total: 676, cast: 615, yea: 256, nay: 355, present: 4, notVoting: 61, notVotingPct: 9 })
    // No scores ride along: the party-majority rate never reaches the card.
    expect(JSON.stringify(r)).not.toMatch(/loyalty|party_majority/i)

    expect(r.recentVotes).toHaveLength(RECORD_VOTE_LIMIT)
    expect(r.recentVotes[0]).toMatchObject({
      path: '/vote/119/house/2/300', question: 'On Passage', position: 'Nay', result: 'Passed', resultKind: 'passed',
      bill: { id: '119-hr-4795', label: 'H.R. 4795', path: '/bill/119/hr/4795', title: 'Water Resources Development Act of 2026' },
      source_url: 'https://clerk.house.gov/Votes/2026300', chamber: 'House',
    })
    expect(r.recentVotes[1]).toMatchObject({ result: 'Failed', resultKind: 'failed', bill: { label: 'H.R. 915', title: null } })   // stub title dropped
    expect(r.recentVotes[2]).toMatchObject({ result: null, tally: null })   // impossible tally: no result shown
    expect(r.recentVotes[3]).toMatchObject({ result: null, question: null })   // no stats row, no roll call row

    expect(r.sources).toEqual({
      congressGov: 'https://www.congress.gov/member/P000197',
      bioguide: 'https://bioguide.congress.gov/search/bio/P000197',
      chamberVotes: 'https://clerk.house.gov/Votes',
    })
    expect(recordSeatCode(r)).toBe('D-CA-11')
    expect(recordSummary(r, (s) => (s === 'CA' ? 'California' : s))).toBe(
      'Nancy Pelosi, U.S. Representative for California district 11. 119th Congress: voted on 615 of 676 roll calls, not voting on 61. The 10 most recent votes, each linked to the official roll call.',
    )
  })

  it('says so when a member has little or no data, and never pads the list', () => {
    const senator = { id: 'A000383', name: 'Alan Armstrong', chamber: 'senate', state: 'OK', district: '3', party: 'Republican' }
    const thin = shapeMemberRecord({ member: senator, terms: [{ congress: 119, district: '3', term_start: '2026-09-15', term_end: null }], stats: null, votes: [vote(1, { roll_call_id: 'senate-119-2-500', position: 'Aye' })], voteCount: 1 })
    expect(thin).toMatchObject({ district: null, thin: true, voteCount: 1, stats: null, servingSince: '2026-09-15' })
    expect(thin.recentVotes).toHaveLength(1)
    expect(thin.recentVotes[0]).toMatchObject({ position: 'Yea', chamber: 'Senate', result: null })
    expect(thin.sources.chamberVotes).toBe('https://www.senate.gov/legislative/votes_new.htm')

    const none = shapeMemberRecord({ member: senator, terms: [], stats: { congress: 119, total_votes: 0 }, votes: [], voteCount: 0 })
    expect(none).toMatchObject({ voteCount: 0, recentVotes: [], stats: null, thin: true, congress: null, servingSince: null })
    expect(recordSummary(none)).toContain('No recorded votes yet.')

    expect(shapeMemberRecord({ member: null })).toBeNull()
  })

  it('normalizes positions, bill ids, stats, and paths', () => {
    expect(['Yea', 'yes', 'Aye', 'Nay', 'No', 'Present', 'Not Voting'].map(normalizePosition)).toEqual(['Yea', 'Yea', 'Yea', 'Nay', 'Nay', 'Present', 'Not Voting'])
    expect(recordBill('119-SJRES-12')).toEqual({ id: '119-sjres-12', label: 'S.J.Res. 12', path: '/bill/119/sjres/12' })
    expect(recordBill('nope')).toBeNull()
    expect(shapeRecordStats(null)).toBeNull()
    expect(shapeRecordStats({ congress: 119, total_votes: 3, yea_count: 3, nay_count: 0, present_count: 0, not_voting_count: 0 }).notVotingPct).toBe(0)
    expect(shapeRecordStats({ congress: 119, total_votes: 1000, not_voting_count: 1 }).notVotingPct).toBe(0.1)   // never rounded to zero
    expect(recordPath('p000197')).toBe('/politician/P000197/record')
  })
})
