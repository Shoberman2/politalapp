import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  classifyNominateScore,
  getVotingIdeology,
  resetVoteviewCacheForTests,
} from '../../src/services/voteviewIdeology.js'

afterEach(() => {
  vi.restoreAllMocks()
  resetVoteviewCacheForTests()
})

describe('Voteview ideology translation', () => {
  it('withholds a label when too few roll calls support the estimate', () => {
    expect(classifyNominateScore(-0.7, 24)).toMatchObject({
      available: false,
      label: 'Insufficient voting evidence',
      confidence: 'Insufficient',
    })
  })

  it.each([
    [-0.7, 'Progressive-aligned voting record'],
    [-0.3, 'Liberal-aligned voting record'],
    [0, 'Cross-partisan voting record'],
    [0.3, 'Conservative-aligned voting record'],
    [0.7, 'Very conservative-aligned voting record'],
  ])('translates score %s without presenting it as self-identification', (score, label) => {
    expect(classifyNominateScore(score, 250)).toMatchObject({
      available: true,
      label,
      confidence: 'High',
    })
  })

  it('loads a member record with source and methodology metadata', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        congress: 119,
        source: 'Voteview Congressional Roll-Call Votes Database',
        methodologyUrl: 'https://voteview.com/articles/data_help_members',
        fetchedAt: '2026-08-15T00:00:00.000Z',
        members: {
          O000172: { dimension1: -0.333, votes: 535, errors: 7 },
        },
      }),
    })

    await expect(getVotingIdeology('O000172')).resolves.toMatchObject({
      label: 'Liberal-aligned voting record',
      confidence: 'High',
      dimension1: -0.333,
      votes: 535,
      congress: 119,
    })
  })
})
