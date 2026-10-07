import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'

// The sign-in page: email/password sign in and sign up, the ?next= round trip,
// the "check your email" state when sign-up returns no session, and the Google
// button, shown only when the Supabase settings endpoint says Google is on.

const auth = vi.hoisted(() => ({ user: null, loading: false, signIn: null, signUp: null, signInWithGoogle: null }))
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => auth }))

import Auth from '../../src/components/Auth'

function Where() {
  const loc = useLocation()
  return <output data-testid="where">{`${loc.pathname}${loc.search}`}</output>
}

function renderAt(path) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  )
}

function fill(email = 'a@b.co', password = 'secret1') {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } })
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: password } })
}

const submit = () => fireEvent.submit(document.querySelector('.auth-form'))
const settled = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  auth.user = null
  auth.loading = false
  auth.signIn = vi.fn()
  auth.signUp = vi.fn()
  auth.signInWithGoogle = vi.fn()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ external: { google: false } }) }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Auth: email and password', () => {
  it('signs in and honours a safe ?next= path', async () => {
    auth.signIn.mockResolvedValue({ error: null })
    renderAt('/auth?next=%2Fbill%2F119%2Fhr%2F1%3Fx%3D1')
    fill()
    submit()
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/bill/119/hr/1?x=1'))
    expect(auth.signIn).toHaveBeenCalledWith('a@b.co', 'secret1')
  })

  it('ignores a protocol-relative ?next= and falls back to /my-representative', async () => {
    auth.signIn.mockResolvedValue({ error: null })
    renderAt('/auth?next=%2F%2Fevil.example')
    fill()
    submit()
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/my-representative'))
  })

  it('treats a ?next= back to /auth as the default, so sign-in cannot loop', async () => {
    auth.signIn.mockResolvedValue({ error: null })
    renderAt('/auth?next=%2Fauth%3Fnext%3D%252Fbills')
    fill()
    submit()
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/my-representative'))
  })

  it('sends an already signed-in reader straight to ?next=', () => {
    auth.user = { id: 'u1' }
    renderAt('/auth?next=%2Fbills')
    expect(screen.getByTestId('where').textContent).toBe('/bills')
  })

  it('keeps showing the form while the session is still loading', () => {
    auth.user = { id: 'u1' }
    auth.loading = true
    renderAt('/auth?next=%2Fbills')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sign in')
  })

  it('tells search engines not to index the sign-in page', async () => {
    renderAt('/auth')
    await waitFor(() => expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex'))
  })

  it('shows the error for a wrong password and stays on the page', async () => {
    auth.signIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    renderAt('/auth')
    fill()
    submit()
    expect((await screen.findByRole('alert')).textContent).toBe('Invalid login credentials')
    expect(screen.queryByTestId('where')).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign in' })).not.toBeDisabled()
  })

  it('shows a generic error when sign-in throws', async () => {
    auth.signIn.mockRejectedValue(new Error('network'))
    renderAt('/auth')
    fill()
    submit()
    expect((await screen.findByRole('alert')).textContent).toBe('Something went wrong. Please try again.')
  })

  it('sign-up without a session asks the reader to confirm by email and does not navigate', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null })
    renderAt('/auth?next=%2Fbills')
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Create your account')
    fill('new@b.co', 'secret2')
    submit()
    expect((await screen.findByRole('status')).textContent).toBe('Check your email to confirm your account, then sign in.')
    expect(screen.queryByTestId('where')).toBeNull()
    // Back in sign-in mode with the password cleared.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sign in')
    expect(screen.getByLabelText(/password/i).value).toBe('')
    expect(auth.signUp).toHaveBeenCalledWith('new@b.co', 'secret2', '/bills')
  })

  it('sign-up with a session goes straight to ?next=', async () => {
    auth.signUp.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null })
    renderAt('/auth?next=%2Fbills')
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    fill()
    submit()
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/bills'))
  })

  it('switching mode clears a previous error', async () => {
    auth.signIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    renderAt('/auth')
    fill()
    submit()
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('Auth: Google provider gating', () => {
  it('hides the Google button when the settings fetch fails, is not ok, or Google is off', async () => {
    for (const impl of [
      () => Promise.reject(new Error('offline')),
      () => Promise.resolve({ ok: false, json: async () => ({ external: { google: true } }) }),
      () => Promise.resolve({ ok: true, json: async () => ({ external: { google: false } }) }),
    ]) {
      fetch.mockImplementation(impl)
      renderAt('/auth')
      await waitFor(() => expect(fetch).toHaveBeenCalled())
      await settled()
      expect(screen.queryByRole('button', { name: /Continue with Google/ })).toBeNull()
      cleanup()
      fetch.mockClear()
    }
  })

  it('asks the project settings endpoint with the anon key, shows the button when Google is on, and passes ?next=', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ external: { google: true } }) })
    auth.signInWithGoogle.mockResolvedValue({ error: { message: 'Provider is not enabled' } })
    renderAt('/auth?next=%2Fmap')
    const btn = await screen.findByRole('button', { name: /Continue with Google/ })
    expect(fetch).toHaveBeenCalledWith('https://proj.supabase.co/auth/v1/settings', { headers: { apikey: 'anon-key' } })
    fireEvent.click(btn)
    expect((await screen.findByRole('alert')).textContent).toBe('Provider is not enabled')
    expect(auth.signInWithGoogle).toHaveBeenCalledWith('/map')
  })

  it('never calls the settings endpoint without Supabase config', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    renderAt('/auth')
    await settled()
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Continue with Google/ })).toBeNull()
  })
})
