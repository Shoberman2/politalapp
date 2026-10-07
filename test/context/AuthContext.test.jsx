import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'

// The session gate: `loading` ends as soon as the session resolves (never on
// the profile fetch), a failed getSession signs the reader out instead of
// hanging, an 8s timeout covers a getSession that never settles, and sign-out
// falls back to a local sign-out when the network call fails.

const sb = vi.hoisted(() => ({
  getSession: null,
  signOut: null,
  signUp: null,
  profile: null,
  listener: null,
}))

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a) => sb.getSession(...a),
      onAuthStateChange: (cb) => {
        sb.listener = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      signOut: (...a) => sb.signOut(...a),
      signUp: (...a) => sb.signUp(...a),
    },
    from: () => ({ select: () => ({ eq: (_col, id) => ({
      single: () => (typeof sb.profile === 'function' ? sb.profile(id) : sb.profile),
    }) }) }),
  },
}))

import { AuthProvider, useAuth } from '../../src/context/AuthContext'

let api
function Probe() {
  api = useAuth()
  return <output data-testid="state">{api.loading ? 'loading' : api.user ? `user:${api.user.id}` : 'signed-out'}</output>
}
const renderProvider = () => render(<AuthProvider><Probe /></AuthProvider>)

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  sb.getSession = vi.fn()
  sb.signOut = vi.fn()
  sb.signUp = vi.fn().mockResolvedValue({ data: {}, error: null })
  sb.profile = new Promise(() => {})   // the profile never arrives
  sb.listener = null
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('AuthProvider', () => {
  it('stops loading once the session resolves, without waiting for the profile', async () => {
    sb.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('user:u1'))
  })

  it('treats a failed getSession as signed out', async () => {
    sb.getSession.mockRejectedValue(new Error('offline'))
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('signed-out'))
  })

  it('stops loading after 8 seconds when getSession never settles', async () => {
    vi.useFakeTimers()
    sb.getSession.mockReturnValue(new Promise(() => {}))
    renderProvider()
    expect(screen.getByTestId('state').textContent).toBe('loading')
    await act(async () => { vi.advanceTimersByTime(8000) })
    expect(screen.getByTestId('state').textContent).toBe('signed-out')
  })

  it('signs this device out locally when the network sign-out fails', async () => {
    sb.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    sb.signOut.mockResolvedValueOnce({ error: { message: 'network' } }).mockResolvedValueOnce({ error: null })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('user:u1'))
    let result
    await act(async () => { result = await api.signOut() })
    expect(sb.signOut).toHaveBeenNthCalledWith(2, { scope: 'local' })
    expect(result.error).toEqual({ message: 'network' })
    expect(screen.getByTestId('state').textContent).toBe('signed-out')
  })

  it('drops a profile fetch that resolves after the reader signed out', async () => {
    let resolveProfile
    sb.profile = () => new Promise((resolve) => { resolveProfile = resolve })
    sb.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('user:u1'))
    await waitFor(() => expect(resolveProfile).toBeTypeOf('function'))
    act(() => { sb.listener('SIGNED_OUT', null) })
    expect(screen.getByTestId('state').textContent).toBe('signed-out')
    await act(async () => { resolveProfile({ data: { id: 'u1', subscription_status: 'active' }, error: null }) })
    expect(api.profile).toBeNull()
  })

  it('does not fetch the profile again for the INITIAL_SESSION event', async () => {
    const fetched = vi.fn(() => new Promise(() => {}))
    sb.profile = fetched
    sb.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('user:u1'))
    act(() => { sb.listener('INITIAL_SESSION', { user: { id: 'u1' } }) })
    expect(fetched).toHaveBeenCalledTimes(1)
  })

  it('clears the stored session by hand when both sign-out calls fail', async () => {
    window.localStorage.setItem('sb-proj-auth-token', '{"access_token":"t"}')
    window.localStorage.setItem('bw-theme', 'dark')
    sb.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    sb.signOut.mockResolvedValueOnce({ error: { message: 'network' } })
      .mockRejectedValueOnce(new Error('storage locked'))
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('user:u1'))
    await act(async () => { await api.signOut() })
    expect(window.localStorage.getItem('sb-proj-auth-token')).toBeNull()
    expect(window.localStorage.getItem('bw-theme')).toBe('dark')
    expect(screen.getByTestId('state').textContent).toBe('signed-out')
    window.localStorage.removeItem('bw-theme')
  })

  it('sends the email confirmation link through /auth/callback with a safe ?next=', async () => {
    sb.getSession.mockResolvedValue({ data: { session: null } })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('signed-out'))
    await act(async () => { await api.signUp('a@b.co', 'secret1', '/bills') })
    expect(sb.signUp).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: 'secret1',
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/bills')}` },
    })
    await act(async () => { await api.signUp('a@b.co', 'secret1', '//evil.example') })
    expect(sb.signUp.mock.calls[1][0].options.emailRedirectTo).toBe(`${window.location.origin}/auth/callback?next=${encodeURIComponent('/my-representative')}`)
  })
})
