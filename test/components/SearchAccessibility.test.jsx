import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'

const services = vi.hoisted(() => ({
  getAllCurrentMembers: vi.fn(),
  searchBills: vi.fn(),
  getTrendingBills: vi.fn(),
  searchBillsInDb: vi.fn(),
}))

vi.mock('../../src/services/congress', () => ({
  getAllCurrentMembers: services.getAllCurrentMembers,
  searchBills: services.searchBills,
  getTrendingBills: services.getTrendingBills,
}))
vi.mock('../../src/services/billsDb', () => ({ searchBillsInDb: services.searchBillsInDb }))

import AllPoliticians from '../../src/components/AllPoliticians'
import BillsPage from '../../src/components/BillsPage'

function renderPage(node) {
  return render(
    <HelmetProvider>
      <MemoryRouter>{node}</MemoryRouter>
    </HelmetProvider>,
  )
}

beforeEach(() => {
  Object.values(services).forEach((mock) => mock.mockReset())
  services.getAllCurrentMembers.mockImplementation(async (onBatch) => onBatch([], true))
  services.searchBills.mockResolvedValue({ bills: [] })
  services.getTrendingBills.mockResolvedValue([])
  services.searchBillsInDb.mockResolvedValue([])
})

afterEach(cleanup)

describe('search controls', () => {
  it('names the member search textbox', async () => {
    renderPage(<AllPoliticians />)
    expect(await screen.findByRole('textbox', { name: 'Search members by name' })).toBeInTheDocument()
  })

  it('names the bill search textbox', async () => {
    renderPage(<BillsPage />)
    expect(await screen.findByRole('textbox', { name: 'Search bills' })).toBeInTheDocument()
  })
})
