import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

// Extended by /ship test coverage audit (2026-11-17).
// Value: protects=the members list's empty state offers "Clear filters", which
//   resets the search box, the chamber, party and state selects and the quick
//   filter, and brings the roster back;
//   fails_when=the button is dropped, or one filter is left out of the reset so
//   the list stays empty after clicking it;
//   why_new=no test reached the members empty state or drove these filters;
//   seam=none;
//   no_claim=the roster fetch from Congress.gov (getAllCurrentMembers is mocked)
describe('members list empty state', () => {
  const MEMBERS = [
    { bioguideId: 'A000001', name: 'Adams, Ann', chamber: 'house', party: 'Democratic', state: 'Ohio', district: 3 },
    { bioguideId: 'B000002', name: 'Baker, Bo', chamber: 'senate', party: 'Republican', state: 'Texas' },
  ]

  it('clears every filter and shows the roster again', async () => {
    services.getAllCurrentMembers.mockImplementation(async (onBatch) => onBatch(MEMBERS, true))
    const { container } = renderPage(<AllPoliticians />)
    const search = await screen.findByRole('textbox', { name: 'Search members by name' })
    expect(container.querySelectorAll('.member-card')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()

    // Each control alone still matches a member; together they match none.
    fireEvent.change(search, { target: { value: 'Adams' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Chamber' }), { target: { value: 'house' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Party' }), { target: { value: 'D' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'State' }), { target: { value: 'Ohio' } })
    expect(container.querySelectorAll('.member-card')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Senate' }))
    expect(container.querySelectorAll('.member-card')).toHaveLength(0)
    expect(screen.getByText('No members match these filters.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(container.querySelectorAll('.member-card')).toHaveLength(2)
    expect(search.value).toBe('')
    for (const name of ['Chamber', 'Party', 'State']) expect(screen.getByRole('combobox', { name }).value).toBe('all')
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
  })
})
