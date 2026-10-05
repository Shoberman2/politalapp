import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'

// Regression: /bills showed "Failed to load bills: Request failed with status
// code 504" when Congress.gov timed out behind /api/proxy/congress/bill/119
// (production, 2026-10-05 15:20-15:33 UTC). The current-Congress list now
// falls back to the database copy the ETL keeps.

const services = vi.hoisted(() => ({
  searchBills: vi.fn(),
  getTrendingBills: vi.fn(),
  searchBillsInDb: vi.fn(),
}))

vi.mock('../../src/services/congress', () => ({
  searchBills: services.searchBills,
  getTrendingBills: services.getTrendingBills,
}))
vi.mock('../../src/services/billsDb', () => ({ searchBillsInDb: services.searchBillsInDb }))

import BillsPage from '../../src/components/BillsPage'

function dbPage(start, count = 20) {
  return Array.from({ length: count }, (_, i) => ({
    id: `119-hr-${start + i}`,
    congress: 119,
    type: 'HR',
    number: start + i,
    title: `Database Bill ${start + i}`,
    introducedDate: '2026-09-30',
    sponsors: [],
  }))
}

function timeout504() {
  return Object.assign(new Error('Request failed with status code 504'), { response: { status: 504 } })
}

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <BillsPage />
      </MemoryRouter>
    </HelmetProvider>,
  )
}

beforeEach(() => {
  Object.values(services).forEach((mock) => mock.mockReset())
  services.getTrendingBills.mockResolvedValue([])
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('BillsPage when Congress.gov is unavailable', () => {
  it('shows the database copy of the current Congress instead of an error', async () => {
    services.searchBills.mockRejectedValue(timeout504())
    services.searchBillsInDb.mockResolvedValue(dbPage(1))

    renderPage()

    expect(await screen.findByText('Database Bill 1')).toBeInTheDocument()
    expect(screen.queryByText(/Failed to load bills/)).not.toBeInTheDocument()
    expect(services.searchBills).toHaveBeenCalledWith(expect.objectContaining({ congress: 119, offset: 0 }))
    expect(services.searchBillsInDb).toHaveBeenCalledWith(expect.objectContaining({
      congress: 119,
      billType: null,
      limit: 20,
      offset: 0,
    }))
  })

  it('keeps paging through the database after falling back', async () => {
    services.searchBills.mockRejectedValue(timeout504())
    services.searchBillsInDb
      .mockResolvedValueOnce(dbPage(1))
      .mockResolvedValueOnce(dbPage(21))

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Load more bills' }))

    expect(await screen.findByText('Database Bill 21')).toBeInTheDocument()
    expect(services.searchBills).toHaveBeenCalledTimes(1)
    expect(services.searchBillsInDb).toHaveBeenLastCalledWith(expect.objectContaining({ congress: 119, offset: 20 }))
  })

  it('uses the live list and skips the database when Congress.gov answers', async () => {
    services.searchBills.mockResolvedValue({ bills: [{ congress: 119, type: 'HR', number: 5, title: 'Live Bill 5' }] })

    renderPage()

    expect(await screen.findByText('Live Bill 5')).toBeInTheDocument()
    expect(services.searchBillsInDb).not.toHaveBeenCalled()
  })

  it('still reports an error when both sources fail', async () => {
    services.searchBills.mockRejectedValue(timeout504())
    services.searchBillsInDb.mockRejectedValue(new Error('database unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    renderPage()

    await waitFor(() => expect(screen.getByText(/Failed to load bills: database unavailable/)).toBeInTheDocument())
  })
})
