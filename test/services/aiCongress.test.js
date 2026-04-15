import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase client
const mockData = { data: null, error: null }
const mockChain = {
  select: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(() => Promise.resolve(mockData)),
}
// Make the chain resolve as a promise for queries without maybeSingle
mockChain.order.mockImplementation(() => ({
  ...mockChain,
  then: (cb) => cb(mockData),
}))
mockChain.in.mockImplementation(() => ({
  ...mockChain,
  order: vi.fn(() => ({
    then: (cb) => cb(mockData),
  })),
}))

const mockFrom = vi.fn(() => mockChain)

vi.mock('../../src/lib/supabase', () => ({
  supabase: { from: (...args) => mockFrom(...args) },
}))

let getSessions, getSession

beforeEach(async () => {
  vi.resetModules()
  mockData.data = null
  mockData.error = null
  const mod = await import('../../src/services/aiCongress.js')
  getSessions = mod.getSessions
  getSession = mod.getSession
})

describe('getSessions', () => {
  it('returns sessions ordered by created_at DESC', async () => {
    const sessions = [
      { id: '1', session_number: 2, created_at: '2026-04-14' },
      { id: '2', session_number: 1, created_at: '2026-04-13' },
    ]
    mockChain.in.mockImplementation(() => ({
      order: vi.fn(() => ({ then: (cb) => cb({ data: sessions, error: null }) })),
    }))

    const result = await getSessions()
    expect(result).toEqual(sessions)
    expect(mockFrom).toHaveBeenCalledWith('ai_sessions')
  })

  it('returns empty array when no sessions exist', async () => {
    mockChain.in.mockImplementation(() => ({
      order: vi.fn(() => ({ then: (cb) => cb({ data: [], error: null }) })),
    }))

    const result = await getSessions()
    expect(result).toEqual([])
  })

  it('returns empty array on query error', async () => {
    mockChain.in.mockImplementation(() => ({
      order: vi.fn(() => ({ then: (cb) => cb({ data: null, error: { message: 'fail' } }) })),
    }))

    const result = await getSessions()
    expect(result).toEqual([])
  })
})

describe('getSession', () => {
  it('returns session with bills', async () => {
    const session = { id: 'abc', session_number: 1, status: 'completed' }
    const bills = [{ id: 'b1', title: 'Test Bill', sort_order: 0 }]

    let callCount = 0
    mockFrom.mockImplementation((table) => {
      if (table === 'ai_sessions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn(() => Promise.resolve({ data: session, error: null })),
            }),
          }),
        }
      }
      if (table === 'ai_bills') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn(() => Promise.resolve({ data: bills, error: null })),
            }),
          }),
        }
      }
    })

    const result = await getSession('abc')
    expect(result).toEqual({ ...session, bills })
  })

  it('returns null for invalid session id', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        }),
      }),
    }))

    const result = await getSession('nonexistent')
    expect(result).toBeNull()
  })
})
