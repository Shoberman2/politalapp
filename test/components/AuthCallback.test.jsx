import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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

function renderAt(path) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/briefings" element={<div>Briefings destination</div>} />
          <Route path="/my-representative" element={<div>Representative destination</div>} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  )
}

describe('AuthCallback', () => {
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

  it('accepts a legacy implicit hash redirect if one is already in flight', async () => {
    renderAt('/auth/callback#access_token=legacy-token&refresh_token=legacy-refresh')

    expect(await screen.findByText('Representative destination')).toBeInTheDocument()
    expect(authMock.setSession).toHaveBeenCalledWith({
      access_token: 'legacy-token',
      refresh_token: 'legacy-refresh',
    })
    expect(authMock.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('shows Google provider errors instead of checking for a missing session', async () => {
    renderAt('/auth/callback?error=access_denied&error_description=Access%20denied')

    expect(await screen.findByText('Access denied')).toBeInTheDocument()
    expect(authMock.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(authMock.getSession).not.toHaveBeenCalled()
  })
})
