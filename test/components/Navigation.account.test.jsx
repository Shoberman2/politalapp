import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

// The masthead lists public pages only. Signed out: a "Sign in" text link that
// returns to the current page, and "Find my reps" through sign-in. Signed in:
// "Sign out", "My reps", and the theme toggle (never shown signed out).

const state = vi.hoisted(() => ({ user: null, signOut: null }))

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: state.user, signOut: state.signOut }),
}))

import Navigation from '../../src/components/Navigation'

function Where() {
  const loc = useLocation()
  return <output data-testid="where">{loc.pathname}</output>
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Navigation />
      <Routes><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  state.user = null
  state.signOut = null
})

const accountLinks = (c) => [...c.querySelectorAll('.nav-account, .topnav-account-mobile')]
const cta = (c) => c.querySelector('.topbar-right a.btn-primary')

describe('Navigation', () => {
  it('signed out: Sign in returns to the current page, CTA goes through sign-in', () => {
    const { container } = renderAt('/vote/119/house/2/295?x=1')
    const links = accountLinks(container)
    expect(links).toHaveLength(2)   // desktop + mobile menu
    links.forEach((a) => {
      expect(a.textContent).toBe('Sign in')
      expect(a.getAttribute('href')).toBe(`/auth?next=${encodeURIComponent('/vote/119/house/2/295?x=1')}`)
    })
    expect(cta(container).textContent).toBe('Find my reps')
    expect(cta(container).getAttribute('href')).toBe(`/auth?next=${encodeURIComponent('/my-representative')}`)
  })

  it('on /auth itself, Sign in and the CTA keep the current ?next=', () => {
    const { container } = renderAt('/auth?next=%2Fbills')
    accountLinks(container).forEach((a) => expect(a.getAttribute('href')).toBe('/auth?next=%2Fbills'))
    expect(cta(container).getAttribute('href')).toBe('/auth?next=%2Fbills')
    cleanup()
    const plain = renderAt('/auth').container
    accountLinks(plain).forEach((a) => expect(a.getAttribute('href')).toBe('/auth'))
    expect(cta(plain).getAttribute('href')).toBe(`/auth?next=${encodeURIComponent('/my-representative')}`)
  })

  it('never shows the theme toggle signed out', () => {
    const { container } = renderAt('/')
    expect(container.querySelector('.theme-toggle')).toBeNull()
  })

  it('signed in: Sign out, My reps and the theme toggle', async () => {
    state.user = { id: 'u1', email: 'a@b.c' }
    state.signOut = vi.fn().mockResolvedValue({ error: null })
    const { container, getByTestId } = renderAt('/all')
    const links = accountLinks(container)
    expect(links).toHaveLength(2)
    links.forEach((b) => expect(b.textContent).toBe('Sign out'))
    expect(cta(container).textContent).toBe('My reps')
    expect(cta(container).getAttribute('href')).toBe('/my-representative')
    expect(container.querySelector('.theme-toggle')).not.toBeNull()

    fireEvent.click(container.querySelector('button.nav-account'))
    await waitFor(() => expect(getByTestId('where').textContent).toBe('/'))
    expect(state.signOut).toHaveBeenCalledTimes(1)
  })

  it('keeps the main row to four public pages, with no announcement strip', () => {
    const { container } = renderAt('/')
    const main = [...container.querySelectorAll('nav.topnav a:not(.topnav-account-mobile)')].map((a) => a.getAttribute('href'))
    expect(main).toEqual(['/how-it-works', '/this-week', '/all', '/offices'])
    expect(container.textContent).not.toMatch(/Bills|Methodology|API/)
    expect(container.querySelector('.announce')).toBeNull()
  })
})
