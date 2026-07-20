import { beforeEach, describe, expect, it, vi } from 'vitest'

// Regression: ISSUE-003 — /bills made one Congress.gov detail request per
// visible bill, repeated the whole search in Strict Mode, and repeated the
// same detail fan-out for trending bills.
// Found by /qa on 2026-07-10.

const mocks = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  supabaseFrom: vi.fn(),
  supabaseIn: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: mocks.axiosGet,
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
  },
}))

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: mocks.supabaseFrom,
  },
}))

import { getTrendingBills, searchBills } from '../../src/services/congress'

beforeEach(() => {
  mocks.axiosGet.mockReset()
  mocks.supabaseFrom.mockReset()
  mocks.supabaseIn.mockReset()
  localStorage.clear()
  mocks.supabaseFrom.mockReturnValue({
    select: vi.fn(() => ({ in: mocks.supabaseIn })),
  })
})

describe('Congress bills request fan-out regression', () => {
  it('coalesces concurrent searches and resolves sponsors in one database batch', async () => {
    let resolveList
    mocks.axiosGet.mockReturnValueOnce(new Promise((resolve) => { resolveList = resolve }))
    mocks.supabaseIn.mockResolvedValue({
      data: [{
        id: '119-hr-10',
        sponsor_bioguide_id: 'A000001',
        sponsor_name: 'Alex Example',
        sponsor_party: 'D',
        sponsor_state: 'CA',
      }],
      error: null,
    })

    const options = { congress: 119, limit: 20, offset: 0 }
    const first = searchBills(options)
    const second = searchBills(options)
    expect(second).toBe(first)

    resolveList({
      data: {
        bills: [
          { congress: 119, type: 'HR', number: 10, title: 'First bill' },
          { congress: 119, type: 'S', number: 20, title: 'Second bill' },
        ],
        pagination: { count: 2 },
      },
    })

    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(firstResult).toEqual(secondResult)
    expect(mocks.axiosGet).toHaveBeenCalledTimes(1)
    expect(mocks.axiosGet).toHaveBeenCalledWith('/bill/119', {
      params: { limit: 20, offset: 0, sort: 'updateDate+desc' },
    })
    expect(mocks.supabaseIn).toHaveBeenCalledWith('id', ['119-hr-10', '119-s-20'])
    expect(firstResult.bills[0].sponsors).toEqual([expect.objectContaining({
      bioguideId: 'A000001',
      fullName: 'Alex Example',
    })])
  })

  it('keeps the bill list usable when the sponsor batch is unavailable', async () => {
    mocks.axiosGet.mockResolvedValue({
      data: {
        bills: [{ congress: 119, type: 'HR', number: 11, title: 'Fallback bill' }],
        pagination: { count: 1 },
      },
    })
    mocks.supabaseIn.mockResolvedValue({ data: null, error: new Error('database unavailable') })

    await expect(searchBills({ congress: 119, offset: 1 })).resolves.toMatchObject({
      bills: [{ title: 'Fallback bill' }],
    })
    expect(mocks.axiosGet).toHaveBeenCalledTimes(1)
  })

  it('builds trending cards without exact bill-detail requests', async () => {
    mocks.supabaseIn.mockResolvedValue({ data: [], error: null })
    mocks.axiosGet.mockImplementation((path) => {
      if (path === '/bill/119') {
        return Promise.resolve({
          data: {
            bills: [{
              congress: 119,
              type: 'HR',
              number: 123,
              title: 'Committee Test Act',
              latestAction: { text: 'Referred to committee', actionDate: '2026-07-01' },
              originChamber: 'House',
            }],
          },
        })
      }
      if (path === '/bill/119/hr/123/summaries') {
        return Promise.resolve({ data: { summaries: [] } })
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    const results = await getTrendingBills()

    expect(results).toHaveLength(1)
    expect(mocks.axiosGet).toHaveBeenCalledWith('/bill/119', expect.any(Object))
    expect(mocks.axiosGet).toHaveBeenCalledWith('/bill/119/hr/123/summaries')
    expect(mocks.axiosGet).not.toHaveBeenCalledWith('/bill/119/hr/123')
  })
})
