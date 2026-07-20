import { beforeEach, describe, expect, it, vi } from 'vitest'

const { axiosGet } = vi.hoisted(() => ({
  axiosGet: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: axiosGet,
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
  },
}))

let getVoteTalliesFromActions

beforeEach(async () => {
  vi.resetModules()
  axiosGet.mockReset()
  ;({ getVoteTalliesFromActions } = await import('../../src/services/congress.js'))
})

describe('getVoteTalliesFromActions', () => {
  it('skips external Senate vote URLs that the browser cannot fetch with CORS', async () => {
    const actions = [{
      actionDate: '2025-03-02',
      recordedVotes: [{
        chamber: 'Senate',
        date: '2025-03-02',
        rollNumber: 100,
        url: 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00100.xml',
      }],
    }]

    const tallies = await getVoteTalliesFromActions(actions)

    expect(tallies).toEqual([])
    expect(axiosGet).not.toHaveBeenCalled()
  })

  it('fetches Congress.gov vote API URLs through the Congress API client', async () => {
    axiosGet.mockResolvedValueOnce({
      data: {
        vote: {
          chamber: 'House',
          date: '2025-01-15',
          rollNumber: 21,
          result: 'Passed',
          yea: { total: 220 },
          nay: { total: 210 },
          notVoting: { total: 5 },
          present: { total: 0 },
          question: 'On Passage',
        },
      },
    })

    const actions = [{
      actionDate: '2025-01-15',
      recordedVotes: [{
        chamber: 'House',
        url: 'https://api.congress.gov/v3/vote/119/house/21',
      }],
    }]

    const tallies = await getVoteTalliesFromActions(actions)

    expect(axiosGet).toHaveBeenCalledWith('/vote/119/house/21')
    expect(tallies).toEqual([{
      chamber: 'House',
      date: '2025-01-15',
      rollNumber: 21,
      result: 'Passed',
      totalYea: 220,
      totalNay: 210,
      totalNotVoting: 5,
      totalPresent: 0,
      question: 'On Passage',
    }])
  })
})
