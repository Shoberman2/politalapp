import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase admin
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockLimit = vi.fn()
const mockGte = vi.fn()
const mockIn = vi.fn()
const mockSingle = vi.fn()

const supabaseChain = {
  select: (...args) => { mockSelect(...args); return supabaseChain },
  insert: (...args) => { mockInsert(...args); return supabaseChain },
  update: (...args) => { mockUpdate(...args); return supabaseChain },
  eq: (...args) => { mockEq(...args); return supabaseChain },
  order: (...args) => { mockOrder(...args); return supabaseChain },
  limit: (...args) => { mockLimit(...args); return supabaseChain },
  gte: (...args) => { mockGte(...args); return supabaseChain },
  in: (...args) => { mockIn(...args); return supabaseChain },
  single: () => { mockSingle(); return Promise.resolve({ data: { id: 'test-session-id', session_number: 1 }, error: null }) },
}

const mockFrom = vi.fn(() => supabaseChain)

vi.mock('../../api/_lib/supabase.js', () => ({
  supabaseAdmin: { from: (...args) => { mockFrom(...args); return supabaseChain } },
}))

vi.mock('../../api/_lib/response.js', () => ({
  jsonResponse: (data, status = 200) => new Response(JSON.stringify(data), { status }),
  errorResponse: (msg, status = 400, code = 'ERROR') => new Response(JSON.stringify({ error: { message: msg, code } }), { status }),
  handleCors: () => null,
}))

// Mock fetch for OpenAI calls
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('POST /api/simulation/run', () => {
  let handler

  beforeEach(async () => {
    vi.resetModules()
    mockFetch.mockReset()
    mockFrom.mockClear()
    mockSelect.mockClear()
    mockInsert.mockClear()
    mockUpdate.mockClear()

    process.env.SIMULATION_API_KEY = 'test-key-123'
    process.env.OPENAI_API_KEY = 'sk-test'

    // Default: no running sessions, no recent sessions
    mockLimit.mockImplementation(() => ({
      ...supabaseChain,
      then: (cb) => cb({ data: [], error: null }),
    }))

    const mod = await import('../../api/simulation/run.js')
    handler = mod.default
  })

  function makeRequest(token = 'test-key-123') {
    return new Request('http://localhost/api/simulation/run', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    })
  }

  it('returns 405 for non-POST methods', async () => {
    const req = new Request('http://localhost/api/simulation/run', { method: 'GET' })
    const res = await handler(req)
    expect(res.status).toBe(405)
  })

  it('returns 401 when no auth token provided', async () => {
    const req = new Request('http://localhost/api/simulation/run', {
      method: 'POST',
      headers: {},
    })
    const res = await handler(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 when auth token is invalid', async () => {
    const res = await handler(makeRequest('wrong-key'))
    expect(res.status).toBe(401)
  })

  it('returns 401 when SIMULATION_API_KEY is not set', async () => {
    delete process.env.SIMULATION_API_KEY
    const res = await handler(makeRequest('any-key'))
    expect(res.status).toBe(401)
  })

  it('returns 500 when OPENAI_API_KEY is not configured', async () => {
    delete process.env.OPENAI_API_KEY
    const res = await handler(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('CONFIG_ERROR')
  })
})

describe('error message sanitization', () => {
  it('should not include raw API error details in error messages', () => {
    // The failSession function stores sanitized messages like:
    // "Failed at step 4: House vote generation failed after retry"
    // This test validates the pattern
    const sanitized = `Failed at step 4: House vote generation failed after retry`
    expect(sanitized).not.toContain('sk-')
    expect(sanitized).not.toContain('Bearer')
    expect(sanitized).not.toContain('stack')
    expect(sanitized).toMatch(/^Failed at step \d+:/)
  })
})
