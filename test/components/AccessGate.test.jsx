import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

// Route parity for the app-wide account gate: every path listed in
// shared/access.js sends a signed-out reader to /auth?next=<path>, and the
// public record (profiles, bill pages, record cards, roll calls) never does.

const state = vi.hoisted(() => ({ user: null, loading: false }))
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => state }))

import AccessGate from '../../src/components/AccessGate'

function Where() {
  const loc = useLocation()
  return <output data-testid="where">{`${loc.pathname}${loc.search}`}</output>
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AccessGate>
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </AccessGate>
    </MemoryRouter>,
  )
}

afterEach(() => { cleanup(); state.user = null; state.loading = false })

const GATED = ['/my-representative', '/bills', '/map', '/shutdown-tracker', '/compare', '/ai-congress',
  '/ai-congress/x', '/committee/HSAG', '/briefings', '/alerts',
  // spellings the router resolves to a gated page
  '/%62ills', '/%6Dap', '/my-%72epresentative', '/my-representative//', '/compare///', '/committee/x//', '/committee/a%2Fb']
const PUBLIC = ['/all', '/politician/P000197', '/politician/P000197/record', '/bill/119/hr/1',
  '/vote/119/house/2/295', '/this-week', '/offices', '/how-it-works', '/', '/billsx']

describe('AccessGate', () => {
  it.each(GATED)('signed out, %s redirects to /auth with ?next=', (path) => {
    renderAt(path)
    expect(screen.getByTestId('where').textContent).toBe(`/auth?next=${encodeURIComponent(path)}`)
  })

  it.each(PUBLIC)('signed out, %s stays public', (path) => {
    renderAt(path)
    expect(screen.getByTestId('where').textContent).toBe(path)
  })

  it('keeps the query and hash in ?next=', () => {
    renderAt('/bills?q=tax#list')
    expect(screen.getByTestId('where').textContent)
      .toBe(`/auth?next=${encodeURIComponent('/bills?q=tax#list')}`)
  })

  it('shows a loading status on a gated path while the session resolves, never on a public one', () => {
    state.loading = true
    renderAt('/bills')
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByTestId('where')).toBeNull()
    cleanup()
    renderAt('/bill/119/hr/1')
    expect(screen.queryByText('Loading…')).toBeNull()
    expect(screen.getByTestId('where').textContent).toBe('/bill/119/hr/1')
  })

  it('redirects once the session resolves signed out', () => {
    state.loading = true
    const tree = () => (
      <MemoryRouter initialEntries={['/bills']}>
        <AccessGate>
          <Routes>
            <Route path="*" element={<Where />} />
          </Routes>
        </AccessGate>
      </MemoryRouter>
    )
    const { rerender } = render(tree())
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    state.loading = false
    state.user = null
    rerender(tree())
    expect(screen.getByTestId('where').textContent).toBe(`/auth?next=${encodeURIComponent('/bills')}`)
  })

  it('gates a navigation from a public page to a gated one while the session is loading', () => {
    state.loading = true
    function Go() {
      const loc = useLocation()
      const navigate = useNavigate()
      return (
        <>
          <output data-testid="where">{loc.pathname}</output>
          <button type="button" onClick={() => navigate('/bills')}>go</button>
        </>
      )
    }
    const tree = () => (
      <MemoryRouter initialEntries={['/all']}>
        <AccessGate>
          <Routes>
            <Route path="*" element={<Go />} />
          </Routes>
        </AccessGate>
      </MemoryRouter>
    )
    const { rerender } = render(tree())
    expect(screen.getByTestId('where').textContent).toBe('/all')
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByTestId('where')).toBeNull()
    state.loading = false
    rerender(tree())
    expect(screen.getByTestId('where').textContent).toBe('/auth')
  })

  it('renders gated pages for a signed-in user', () => {
    state.user = { id: 'u1' }
    renderAt('/map')
    expect(screen.getByTestId('where').textContent).toBe('/map')
  })
})
