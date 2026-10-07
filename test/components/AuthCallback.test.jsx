import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import AuthCallback from '../../src/components/AuthCallback'

const { authMock } = vi.hoisted(() => ({
  authMock: {
    exchangeCodeForSession: vi.fn(),
    setSession: vi.fn(),
    getSession: vi.fn(),
  },
}))

vi.mock('../../src/lib/supabase', () => ({
  supabase: { auth: authMock },
}))

function AuthPage() {
  const loc = useLocation()
  return <div>{`Sign in page ${loc.pathname}${loc.search}`}</div>
}

function renderAt(path) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/briefings" element={<div>Briefings destination</div>} />
          <Route path="/my-representative" element={<div>Representative destination</div>} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  )
}

describe('AuthCallback', () => {
  afterEach(cleanup)

  beforeEach(() => {
    authMock.exchangeCodeForSession.mockReset()
    authMock.setSession.mockReset()
    authMock.getSession.mockReset()
    authMock.exchangeCodeForSession.mockResolvedValue({ error: null })
    authMock.setSession.mockResolvedValue({ error: null })
    authMock.getSession.mockResolvedValue({
      data: { session: { access_token: 'token', user: { id: 'user-1' } } },
      error: null,
    })
  })

  it('exchanges a PKCE code and navigates to the requested app path', async () => {
    renderAt('/auth/callback?code=oauth-code&next=%2Fbriefings')

    expect(await screen.findByText('Briefings destination')).toBeInTheDocument()
    expect(authMock.exchangeCodeForSession).toHaveBeenCalledWith('oauth-code')
    expect(authMock.setSession).not.toHaveBeenCalled()
  })

  it('ignores tokens in the URL hash and shows an error', async () => {
    authMock.getSession.mockResolvedValue({ data: { session: null }, error: null })
    renderAt('/auth/callback#access_token=crafted-token&refresh_token=crafted-refresh')

    expect(await screen.findByText('Google sign-in did not return a session.')).toBeInTheDocument()
    expect(authMock.setSession).not.toHaveBeenCalled()
    expect(authMock.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('asks the reader to sign in on this device when the code verifier is missing', async () => {
    authMock.exchangeCodeForSession.mockResolvedValue({
      error: new Error('invalid request: both auth code and code verifier should be non-empty'),
    })
    authMock.getSession.mockResolvedValue({ data: { session: null }, error: null })
    renderAt('/auth/callback?code=oauth-code&next=%2Fbriefings')

    expect(await screen.findByText('Your email is confirmed. Sign in on this device to continue.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth?next=%2Fbriefings')
  })

  it('continues to next when the code was already used but this device has a session', async () => {
    authMock.exchangeCodeForSession.mockResolvedValue({
      error: new Error('invalid request: both auth code and code verifier should be non-empty'),
    })
    authMock.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null })
    renderAt('/auth/callback?code=used-code&next=%2Fbriefings')

    expect(await screen.findByText('Briefings destination')).toBeInTheDocument()
  })

  it('keeps ?next= on Back to sign in', async () => {
    authMock.exchangeCodeForSession.mockResolvedValue({ error: new Error('Code expired') })
    renderAt('/auth/callback?code=oauth-code&next=%2Fbriefings')

    expect(await screen.findByText('Code expired')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
    expect(await screen.findByText('Sign in page /auth?next=%2Fbriefings')).toBeInTheDocument()
  })

  it('shows Google provider errors instead of checking for a missing session', async () => {
    renderAt('/auth/callback?error=access_denied&error_description=Access%20denied')

    expect(await screen.findByText('Sign-in was cancelled or refused by the provider. Please try again.')).toBeInTheDocument()
    expect(screen.queryByText('Access denied')).not.toBeInTheDocument()
    expect(authMock.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(authMock.getSession).not.toHaveBeenCalled()
  })
})
