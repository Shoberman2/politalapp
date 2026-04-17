import { describe, it, expect } from 'vitest'
import {
  effectivePartyCode,
  partyMajorityDirection,
  computePatternMatchScore,
  computePartyCrossover,
  computeDistrictMismatch,
  computeMoneyAligned,
  rankNotableVotes,
  VPA_SCHEMA_VERSION,
} from '../../src/services/votingPatterns.js'

describe('VPA_SCHEMA_VERSION', () => {
  it('is exported and non-empty', () => {
    expect(VPA_SCHEMA_VERSION).toMatch(/^\d+\.\d+$/)
  })
})

describe('effectivePartyCode', () => {
  it('returns D for Democratic', () => {
    expect(effectivePartyCode('A000001', 'D')).toBe('D')
    expect(effectivePartyCode('A000001', 'Democratic')).toBe('D')
  })
  it('returns R for Republican', () => {
    expect(effectivePartyCode('A000001', 'R')).toBe('R')
    expect(effectivePartyCode('A000001', 'Republican')).toBe('R')
  })
  it('returns I for Independent without override', () => {
    expect(effectivePartyCode('X999999', 'I')).toBe('I')
  })
  it('returns caucus override for Sanders (S000033)', () => {
    expect(effectivePartyCode('S000033', 'I')).toBe('D')
  })
  it('returns caucus override for King (K000383)', () => {
    expect(effectivePartyCode('K000383', 'I')).toBe('D')
  })
})

describe('partyMajorityDirection', () => {
  const stats = { dem_yea: 150, dem_nay: 20, rep_yea: 10, rep_nay: 200, ind_yea: 2, ind_nay: 1 }

  it('returns 1 (Yea) for D when dem_yea > dem_nay', () => {
    expect(partyMajorityDirection(stats, 'D')).toBe(1)
  })
  it('returns 0 (Nay) for R when rep_nay > rep_yea', () => {
    expect(partyMajorityDirection(stats, 'R')).toBe(0)
  })
  it('returns 1 for I when ind_yea > ind_nay', () => {
    expect(partyMajorityDirection(stats, 'I')).toBe(1)
  })
  it('returns null when stats is null', () => {
    expect(partyMajorityDirection(null, 'D')).toBe(null)
  })
  it('returns null when both yea and nay are 0 for that party', () => {
    const empty = { dem_yea: 0, dem_nay: 0, rep_yea: 100, rep_nay: 5 }
    expect(partyMajorityDirection(empty, 'D')).toBe(null)
  })
})

function makeVote({ position = 'Yea', rcs = null, bill = null } = {}) {
  return {
    politician_id: 'T000001',
    bill_id: bill?.id ?? 'X-1',
    roll_call_id: rcs?.roll_call_id ?? `rc-${Math.random()}`,
    position,
    voted_at: '2026-01-01',
    source_url: '',
    bill,
    roll_call_stats: rcs,
  }
}

describe('computePatternMatchScore', () => {
  it('returns null when fewer than 50 votes', () => {
    const result = computePatternMatchScore({
      bioguideId: 'T000001',
      partyCode: 'D',
      state: 'CA',
      district: null,
      votes: Array.from({ length: 10 }, () => makeVote()),
      topDonorIndustries: [],
      correlations: [],
    })
    expect(result.score).toBe(null)
  })

  it('returns 100% when rep matches party majority on every vote', () => {
    // Build 60 votes where party majority is Yea and rep voted Yea
    const stats = { dem_yea: 200, dem_nay: 5, rep_yea: 0, rep_nay: 210, ind_yea: 0, ind_nay: 0 }
    const votes = Array.from({ length: 60 }, () =>
      makeVote({ position: 'Yea', rcs: { ...stats, roll_call_id: `rc-${Math.random()}` } }),
    )
    const result = computePatternMatchScore({
      bioguideId: 'T000001',
      partyCode: 'D',
      state: 'XX',
      district: null,
      votes,
      topDonorIndustries: [],
      correlations: [],
    })
    expect(result.score).toBe(100)
    expect(result.matched).toBeGreaterThanOrEqual(60)
  })

  it('returns 0% when rep votes opposite party majority every time', () => {
    const stats = { dem_yea: 200, dem_nay: 5, rep_yea: 0, rep_nay: 210, ind_yea: 0, ind_nay: 0 }
    const votes = Array.from({ length: 60 }, () =>
      makeVote({ position: 'Nay', rcs: { ...stats, roll_call_id: `rc-${Math.random()}` } }),
    )
    const result = computePatternMatchScore({
      bioguideId: 'T000001',
      partyCode: 'D',
      state: 'XX',
      district: null,
      votes,
      topDonorIndustries: [],
      correlations: [],
    })
    expect(result.score).toBe(0)
  })

  it('skips Present/Not Voting positions', () => {
    const stats = { dem_yea: 200, dem_nay: 5 }
    const votes = [
      ...Array.from({ length: 50 }, () => makeVote({ position: 'Yea', rcs: stats })),
      ...Array.from({ length: 10 }, () => makeVote({ position: 'Present', rcs: stats })),
    ]
    const result = computePatternMatchScore({
      bioguideId: 'T000001',
      partyCode: 'D',
      state: 'XX',
      district: null,
      votes,
      topDonorIndustries: [],
      correlations: [],
    })
    // 50 substantive Yeas all matching Yea majority
    expect(result.score).toBe(100)
  })
})

describe('computePartyCrossover', () => {
  it('counts crossovers correctly', () => {
    const stats = { dem_yea: 150, dem_nay: 10, rep_yea: 10, rep_nay: 200 }
    const votes = [
      makeVote({ position: 'Yea', rcs: { ...stats, roll_call_id: '1' } }),
      makeVote({ position: 'Nay', rcs: { ...stats, roll_call_id: '2' } }),
      makeVote({ position: 'Nay', rcs: { ...stats, roll_call_id: '3' } }),
    ]
    const result = computePartyCrossover({ bioguideId: 'T000001', partyCode: 'D', votes })
    // Party majority is Yea; 2 of 3 voted Nay → 66% crossover
    expect(result.crossoverCount).toBe(2)
    expect(result.substantiveCount).toBe(3)
    expect(result.crossoverRate).toBeGreaterThan(60)
  })
})

describe('computeMoneyAligned', () => {
  it('returns unavailable when below minimum threshold', () => {
    const result = computeMoneyAligned({
      topDonorIndustries: [{ industry: 'Healthcare', totalAmount: 100 }],
      correlations: [{ industry: 'Healthcare', billsVotedOn: 3, yeaCount: 2, nayCount: 1, yeaPercent: 67 }],
    })
    expect(result.available).toBe(false)
  })

  it('computes alignment rate when sufficient data', () => {
    const result = computeMoneyAligned({
      topDonorIndustries: [{ industry: 'Healthcare', totalAmount: 100 }],
      correlations: [
        { industry: 'Healthcare', billsVotedOn: 20, yeaCount: 15, nayCount: 5, yeaPercent: 75 },
      ],
    })
    expect(result.available).toBe(true)
    expect(result.industryVotes).toBe(20)
    expect(result.alignedCount).toBe(15)
    expect(result.alignmentRate).toBe(75)
  })
})

describe('rankNotableVotes', () => {
  it('splits votes into typical (matched party) and atypical (crossed)', () => {
    const stats = { dem_yea: 150, dem_nay: 10 } // majority = Yea
    const votes = [
      // Typical — party voted Yea, rep voted Yea
      makeVote({ position: 'Yea', rcs: { ...stats, roll_call_id: 't1' } }),
      makeVote({ position: 'Yea', rcs: { ...stats, roll_call_id: 't2' } }),
      // Atypical — rep voted against party
      makeVote({ position: 'Nay', rcs: { ...stats, roll_call_id: 'a1' } }),
      makeVote({ position: 'Nay', rcs: { ...stats, roll_call_id: 'a2' } }),
    ]
    const result = rankNotableVotes({ bioguideId: 'T000001', partyCode: 'D', votes })
    expect(result.typical.length).toBe(2)
    expect(result.atypical.length).toBe(2)
    expect(result.typical[0].position).toBe('Yea')
    expect(result.atypical[0].position).toBe('Nay')
  })

  it('caps typical at 6 and atypical at 6', () => {
    const stats = { dem_yea: 100, dem_nay: 5 }
    const votes = Array.from({ length: 20 }, (_, i) =>
      makeVote({
        position: i % 2 === 0 ? 'Yea' : 'Nay',
        rcs: { ...stats, roll_call_id: `v${i}` },
      }),
    )
    const result = rankNotableVotes({ bioguideId: 'T000001', partyCode: 'D', votes })
    expect(result.typical.length).toBe(6)
    expect(result.atypical.length).toBe(6)
  })
})

describe('computeDistrictMismatch', () => {
  it('returns available=false when no district lean data', () => {
    const result = computeDistrictMismatch({
      bioguideId: 'T000001',
      partyCode: 'D',
      state: 'ZZ', // nonexistent
      district: '99',
      votes: [makeVote()],
    })
    expect(result.available).toBe(false)
  })
})
