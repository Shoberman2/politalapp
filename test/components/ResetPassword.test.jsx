import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'

// /auth/reset is where the emailed reset link lands (through /auth/callback).
// With a session it saves a new password; without one the link is spent.

const auth = vi.hoisted(() => ({ user: null, loading: false, updatePassword: null }))
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => auth }))

import ResetPassword from '../../src/components/ResetPassword'
import ClosingCta, { showsClosingCta } from '../../src/components/ClosingCta'

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}

function renderReset() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/auth/reset']}>
        <Routes>
          <Route path="/auth/reset" element={<ResetPassword />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  )
}

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  auth.user = null
  auth.loading = false
  auth.updatePassword = null
})

describe('ResetPassword', () => {
  it('saves the new password and goes to the app', async () => {
    auth.user = { id: 'u1' }
    sessionStorage.setItem('bw-recovery', '1')
    auth.updatePassword = vi.fn().mockResolvedValue({ error: null })
    renderReset()
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'better-secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/my-representative'))
    expect(auth.updatePassword).toHaveBeenCalledWith('better-secret')
    expect(sessionStorage.getItem('bw-recovery')).toBeNull()
  })

  it('shows the error and stays when the save fails', async () => {
    auth.user = { id: 'u1' }
    sessionStorage.setItem('bw-recovery', '1')
    auth.updatePassword = vi.fn().mockResolvedValue({ error: { message: 'New password should be different from the old password.' } })
    renderReset()
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'same-secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/different from the old password/)
    expect(screen.queryByTestId('where')).toBeNull()
  })

  it('without a session, says the link has expired and offers sign-in', () => {
    renderReset()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('This Link Has Expired')
    expect(screen.queryByLabelText('New password')).toBeNull()
    expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe('/auth')
  })

  it('does not offer the password form to a signed-in session that did not come from a reset link', () => {
    auth.user = { id: 'u1' }
    renderReset()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('This Link Has Expired')
    expect(screen.queryByLabelText('New password')).toBeNull()
  })

  it('does not call the link expired while the session is still loading', () => {
    auth.loading = true
    renderReset()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Set A New Password')
  })
})

describe('ClosingCta', () => {
  it('closes public interior pages, and stays off the landing, sign-in, legal and gated pages', () => {
    for (const path of ['/about', '/how-it-works', '/this-week', '/government', '/politician/S001223', '/bill/119/hr/1', '/developers']) {
      expect(showsClosingCta(path), path).toBe(true)
    }
    for (const path of ['/', '/auth', '/auth/reset', '/auth/callback', '/privacy', '/terms', '/bills', '/my-representative', '/compare', '/all']) {
      expect(showsClosingCta(path), path).toBe(false)
    }
  })

  it('renders the one primary action with the site-wide words', () => {
    render(<MemoryRouter initialEntries={['/about']}><ClosingCta /></MemoryRouter>)
    const link = screen.getByRole('link', { name: 'Find my reps' })
    expect(link.getAttribute('href')).toBe('/auth?mode=signup&next=%2Fmy-representative')
  })
})
