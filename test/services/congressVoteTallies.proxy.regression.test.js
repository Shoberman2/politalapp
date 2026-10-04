import { beforeEach, describe, expect, it, vi } from 'vitest'

// Regression: congress.js used to compare recorded-vote URLs against its own
// BASE_URL (https://api.congress.gov/v3). BASE_URL is now the same-origin
// proxy, so absolute Congress.gov URLs inside payloads must still be mapped to
// proxy-relative paths (and anything else skipped).

const { create, get } = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn() }))

vi.mock('axios', () => ({ default: { create, get: vi.fn() } }))
vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))

beforeEach(() => {
  vi.resetModules()
  get.mockReset()
  create.mockReset()
  create.mockImplementation(() => ({
    get,
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  }))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('getVoteTalliesFromActions through the proxy', () => {
  it('maps absolute api.congress.gov vote URLs to proxy-relative paths and skips other hosts', async () => {
    get.mockResolvedValue({ data: { vote: { result: 'Passed', totalYea: 300, totalNay: 120, question: 'On Passage' } } })
    const { getVoteTalliesFromActions } = await import('../../src/services/congress.js')

    const tallies = await getVoteTalliesFromActions([
      {
        actionDate: '2026-09-03',
        recordedVotes: [
          { url: 'https://api.congress.gov/v3/house-vote/119/2/295', chamber: 'House', rollNumber: 295 },
          { url: 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00100.xml', chamber: 'Senate' },
          { url: '/house-vote/119/2/296', chamber: 'House', rollNumber: 296 },
          { url: null },
        ],
      },
    ])

    expect(get.mock.calls.map((c) => c[0])).toEqual(['/house-vote/119/2/295', '/house-vote/119/2/296'])
    for (const [path] of get.mock.calls) expect(path).not.toMatch(/^https?:/)
    expect(tallies).toHaveLength(2)
    expect(tallies[0]).toMatchObject({ chamber: 'House', rollNumber: 295, result: 'Passed', totalYea: 300, totalNay: 120, date: '2026-09-03' })
  })

  it('keeps going when one tally request fails and returns [] for no recorded votes', async () => {
    get.mockRejectedValueOnce(new Error('502')).mockResolvedValueOnce({ data: { vote: { yea: { total: 1 }, nay: { total: 2 } } } })
    const { getVoteTalliesFromActions } = await import('../../src/services/congress.js')

    const tallies = await getVoteTalliesFromActions([
      { recordedVotes: [{ url: 'https://api.congress.gov/v3/house-vote/119/2/1' }, { url: 'https://api.congress.gov/v3/house-vote/119/2/2' }] },
    ])
    expect(tallies).toHaveLength(1)
    expect(tallies[0]).toMatchObject({ totalYea: 1, totalNay: 2, totalNotVoting: 0, totalPresent: 0 })

    expect(await getVoteTalliesFromActions([])).toEqual([])
    expect(await getVoteTalliesFromActions([{ recordedVotes: [] }])).toEqual([])
  })
})
