import { afterEach, describe, expect, it, vi } from 'vitest'

// Regression: ISSUE-001 — Congress API request logging printed the API key.
// Found by /qa on 2026-08-15.
// Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-08-15.md

const mocks = vi.hoisted(() => ({
  requestUse: vi.fn(),
  responseUse: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      interceptors: {
        request: { use: mocks.requestUse },
        response: { use: mocks.responseUse },
      },
    })),
  },
}))

vi.mock('../../src/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  mocks.requestUse.mockReset()
  mocks.responseUse.mockReset()
})

describe('Congress API request logging regression', () => {
  it('logs the endpoint without serializing credential-bearing parameters', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_CONGRESS_API_KEY', 'test-secret-should-not-log')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await import('../../src/services/congress.js')
    const onRequest = mocks.requestUse.mock.calls[0][0]
    onRequest({
      method: 'get',
      baseURL: 'https://api.congress.gov/v3',
      url: '/member/O000172',
      params: { api_key: 'test-secret-should-not-log', format: 'json' },
    })

    const output = JSON.stringify(log.mock.calls)
    expect(output).toContain('GET https://api.congress.gov/v3/member/O000172')
    expect(output).not.toContain('test-secret-should-not-log')
    expect(output).not.toContain('Params')
  })
})
