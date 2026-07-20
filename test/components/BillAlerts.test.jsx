import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import BillAlertsPage from '../../src/components/BillAlertsPage'
import BillWatchControl from '../../src/components/BillWatchControl'
import RequireAuth from '../../src/components/RequireAuth'

const { authState, services } = vi.hoisted(() => ({
  authState: { user: null, loading: false },
  services: {
    getBillFollow: vi.fn(), startBillFollow: vi.fn(), updateBillFollow: vi.fn(),
    stopBillFollow: vi.fn(), getBillFollows: vi.fn(), getBillAlertHistory: vi.fn(),
    getBillAlertPreference: vi.fn(), setAllBillAlertEmailEnabled: vi.fn(),
  },
}))

vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../src/services/billAlerts', () => services)

function Destination() {
  const location = useLocation()
  return <div>Auth destination {location.search}</div>
}

beforeEach(() => {
  authState.user = null
  authState.loading = false
  Object.values(services).forEach((mock) => mock.mockReset())
  services.stopBillFollow.mockResolvedValue(true)
  services.updateBillFollow.mockResolvedValue({})
  services.setAllBillAlertEmailEnabled.mockResolvedValue({})
})

afterEach(cleanup)

describe('BillWatchControl', () => {
  it('offers a safe sign-in return path to signed-out readers', () => {
    render(
      <MemoryRouter initialEntries={['/bill/119/hr/1']}>
        <Routes>
          <Route path="/bill/:congress/:type/:number" element={<BillWatchControl billId="119-hr-1" />} />
          <Route path="/auth" element={<Destination />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to watch' }))
    expect(screen.getByText(/Auth destination/)).toHaveTextContent('next=%2Fbill%2F119%2Fhr%2F1')
  })

  it('loads and saves per-category settings for an active follow', async () => {
    authState.user = { id: 'user-1' }
    services.getBillFollow.mockResolvedValue({
      bill_id: '119-hr-1', committee_alerts: true, floor_alerts: false,
      vote_alerts: true, email_enabled: true, paused_at: null,
    })
    services.updateBillFollow.mockResolvedValue({
      bill_id: '119-hr-1', committee_alerts: true, floor_alerts: true,
      vote_alerts: true, email_enabled: true, paused_at: null,
    })
    render(<MemoryRouter><BillWatchControl billId="119-hr-1" /></MemoryRouter>)
    const floor = await screen.findByRole('checkbox', { name: 'Floor schedule' })
    expect(floor).not.toBeChecked()
    fireEvent.click(floor)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(services.updateBillFollow).toHaveBeenCalledWith(
      '119-hr-1', expect.objectContaining({ floorAlerts: true }),
    ))
  })
})

describe('authenticated alert management', () => {
  it('redirects signed-out users while preserving the requested alerts URL', () => {
    render(
      <MemoryRouter initialEntries={['/alerts?view=history']}>
        <Routes>
          <Route path="/alerts" element={<RequireAuth><div>Private alerts</div></RequireAuth>} />
          <Route path="/auth" element={<Destination />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText(/Auth destination/)).toHaveTextContent('next=%2Falerts%3Fview%3Dhistory')
  })

  it('edits, pauses, and discloses email delivery on the management page', async () => {
    authState.user = { id: 'user-1' }
    const follow = {
      id: 'follow-1', bill_id: '119-hr-1', committee_alerts: true,
      floor_alerts: true, vote_alerts: true, email_enabled: true, paused_at: null,
      bills: { title: 'A test bill' },
    }
    services.getBillFollows.mockResolvedValue([follow])
    services.getBillAlertHistory.mockResolvedValue([])
    services.getBillAlertPreference.mockResolvedValue({ email_enabled: true })
    render(
      <HelmetProvider>
        <MemoryRouter><BillAlertsPage /></MemoryRouter>
      </HelmetProvider>,
    )
    expect(await screen.findByText('A test bill')).toBeInTheDocument()
    expect(screen.getByText(/Email delivery is handled by Resend/)).toBeInTheDocument()
    const row = screen.getByText('A test bill').closest('article')
    fireEvent.click(within(row).getByRole('button', { name: 'Pause' }))
    await waitFor(() => expect(services.updateBillFollow).toHaveBeenCalledWith(
      '119-hr-1', expect.objectContaining({ paused: true }),
    ))
  })
})
