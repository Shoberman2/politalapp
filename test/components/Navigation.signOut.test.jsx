import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

// Sign out leaves the page first (so a gated page never bounces to /auth while
// the session clears), and still lands on the homepage when signOut() rejects.

const state = vi.hoisted(() => ({ user: { id: 'u1' }, signOut: null }))
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => state }))

import Navigation from '../../src/components/Navigation'

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}

afterEach(cleanup)

describe('Navigation sign out', () => {
  it('navigates home from the mobile menu even when signOut rejects', async () => {
    state.signOut = vi.fn().mockRejectedValue(new Error('network'))
    const { container } = render(
      <MemoryRouter initialEntries={['/bills']}>
        <Navigation />
        <Routes><Route path="*" element={<Where />} /></Routes>
      </MemoryRouter>,
    )
    fireEvent.click(container.querySelector('button.topnav-account-mobile'))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'))
    expect(state.signOut).toHaveBeenCalledTimes(1)
  })

  it('is on the homepage before signOut() has finished', async () => {
    let finish
    state.signOut = vi.fn(() => new Promise((r) => { finish = r }))
    const { container } = render(
      <MemoryRouter initialEntries={['/bills']}>
        <Navigation />
        <Routes><Route path="*" element={<Where />} /></Routes>
      </MemoryRouter>,
    )
    fireEvent.click(container.querySelector('button.nav-account'))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'))
    expect(state.signOut).toHaveBeenCalledTimes(1)
    finish({ error: null })
  })
})
