import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

// The account gate: a spinner while the session loads, a redirect to /auth
// with the full path (query included) in ?next= when signed out, and the page
// itself when signed in. RequireAuth is a thin alias kept for old imports.

const state = vi.hoisted(() => ({ user: null, loading: false }))
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => state }))

import ProtectedRoute from '../../src/components/ProtectedRoute'
import RequireAuth from '../../src/components/RequireAuth'

function AuthPage() {
  const loc = useLocation()
  return <output data-testid="auth">{`${loc.pathname}${loc.search}`}</output>
}

function renderAt(path, Gate = ProtectedRoute) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="*" element={<Gate><p>Secret page</p></Gate>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => { cleanup(); state.user = null; state.loading = false })

describe('ProtectedRoute', () => {
  it('shows a loading status, not the page and not a redirect, while the session loads', () => {
    state.loading = true
    renderAt('/bills')
    expect(screen.getByRole('status').textContent).toMatch('Loading…')
    expect(screen.queryByText('Secret page')).toBeNull()
    expect(screen.queryByTestId('auth')).toBeNull()
  })

  it('sends a signed-out reader to /auth with the encoded path and query as ?next=', () => {
    renderAt('/bill/119/hr/1?tab=votes&x=1')
    const expected = `/auth?next=${encodeURIComponent('/bill/119/hr/1?tab=votes&x=1')}`
    expect(screen.getByTestId('auth').textContent).toBe(expected)
    expect(screen.queryByText('Secret page')).toBeNull()
  })

  it('renders the page for a signed-in user, through RequireAuth too', () => {
    state.user = { id: 'u1' }
    renderAt('/map')
    expect(screen.getByText('Secret page')).toBeInTheDocument()
    cleanup()
    renderAt('/alerts', RequireAuth)
    expect(screen.getByText('Secret page')).toBeInTheDocument()
    cleanup()
    state.user = null
    renderAt('/alerts', RequireAuth)
    expect(screen.getByTestId('auth').textContent).toBe(`/auth?next=${encodeURIComponent('/alerts')}`)
  })
})
