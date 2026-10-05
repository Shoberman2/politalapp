import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// The masthead lists public pages only. Account features sit behind one link:
// "Sign in" (returning to the current page) when signed out, "My alerts" when
// signed in with bill alerts on, and nothing when signed in with alerts off.

const state = vi.hoisted(() => ({ user: null, alerts: true }))

vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }))
vi.mock('../../src/config/features', () => ({
  get SHOW_BILL_ALERTS() { return state.alerts },
}))

import Navigation from '../../src/components/Navigation'

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Navigation />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  state.user = null
  state.alerts = true
})

const accountLinks = (c) => [...c.querySelectorAll('a.nav-account, a.topnav-account-mobile')]

describe('Navigation account link', () => {
  it('offers Sign in when signed out, returning to the current page', () => {
    const { container } = renderAt('/bill/119/hr/1')
    const links = accountLinks(container)
    expect(links).toHaveLength(2)   // desktop + mobile menu
    links.forEach((a) => {
      expect(a.textContent).toBe('Sign in')
      expect(a.getAttribute('href')).toBe(`/auth?next=${encodeURIComponent('/bill/119/hr/1')}`)
    })
  })

  it('shows My alerts when signed in and bill alerts are on', () => {
    state.user = { id: 'u1', email: 'a@b.c' }
    const { container } = renderAt('/')
    const links = accountLinks(container)
    expect(links).toHaveLength(2)
    links.forEach((a) => {
      expect(a.textContent).toBe('My alerts')
      expect(a.getAttribute('href')).toBe('/alerts')
    })
  })

  it('shows no account link when signed in and bill alerts are off', () => {
    state.user = { id: 'u1' }
    state.alerts = false
    const { container } = renderAt('/')
    expect(accountLinks(container)).toHaveLength(0)
    expect(container.textContent).not.toMatch(/Sign in|My alerts/)
  })

  it('keeps the main row to public pages, with no announcement strip', () => {
    const { container } = renderAt('/')
    const main = [...container.querySelectorAll('nav.topnav a:not(.topnav-account-mobile)')].map((a) => a.getAttribute('href'))
    expect(main).toEqual(['/all', '/bills', '/this-week', '/how-it-works', '/offices'])
    expect(container.querySelector('.announce')).toBeNull()
  })
})
