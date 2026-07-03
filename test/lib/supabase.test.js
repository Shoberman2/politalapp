import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(() => ({ auth: {} })),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}))

describe('supabase browser client', () => {
  beforeEach(() => {
    vi.resetModules()
    createClientMock.mockClear()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses PKCE and explicit callback handling for Google OAuth', async () => {
    await import('../../src/lib/supabase.js')

    expect(createClientMock).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.objectContaining({
        auth: expect.objectContaining({
          flowType: 'pkce',
          detectSessionInUrl: false,
          persistSession: true,
          autoRefreshToken: true,
        }),
      })
    )
  })
})
