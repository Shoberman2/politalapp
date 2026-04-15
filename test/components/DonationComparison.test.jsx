import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import DonationComparison from '../../src/components/DonationComparison'

vi.mock('../../src/services/donations', () => ({
  getDonationsByPoliticianName: vi.fn(),
  formatCurrency: (amount) => `$${Math.round(amount).toLocaleString()}`,
  getMoneyVotesCorrelation: vi.fn().mockResolvedValue([]),
}))

import { getDonationsByPoliticianName } from '../../src/services/donations'

function renderComparison() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <DonationComparison />
      </MemoryRouter>
    </HelmetProvider>
  )
}

describe('DonationComparison', () => {
  it('renders input fields and compare button', () => {
    renderComparison()
    expect(screen.getByPlaceholderText('e.g., Nancy Pelosi')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g., Mitch McConnell')).toBeInTheDocument()
    expect(screen.getByText('Compare')).toBeInTheDocument()
  })

  it('disables compare button when inputs are empty', () => {
    renderComparison()
    const buttons = screen.getAllByRole('button', { name: 'Compare' })
    expect(buttons[0].disabled).toBe(true)
  })

  it('shows results after comparison', async () => {
    getDonationsByPoliticianName
      .mockResolvedValueOnce({
        candidate: { name: 'PELOSI, NANCY', id: 'H8CA05035' },
        totalRaised: 5000000,
        donors: [
          { name: 'DONOR A', employer: 'GOOGLE', totalAmount: 5000, occupation: 'engineer' },
        ],
      })
      .mockResolvedValueOnce({
        candidate: { name: 'MCCONNELL, MITCH', id: 'S2KY00012' },
        totalRaised: 8000000,
        donors: [
          { name: 'DONOR B', employer: 'EXXON MOBIL', totalAmount: 3000, occupation: 'executive' },
        ],
      })

    renderComparison()

    const inputsA = screen.getAllByPlaceholderText('e.g., Nancy Pelosi')
    const inputsB = screen.getAllByPlaceholderText('e.g., Mitch McConnell')
    fireEvent.change(inputsA[0], { target: { value: 'Nancy Pelosi' } })
    fireEvent.change(inputsB[0], { target: { value: 'Mitch McConnell' } })
    const buttons = screen.getAllByText('Compare')
    fireEvent.click(buttons[0])

    const name = await screen.findByText('PELOSI, NANCY')
    expect(name).toBeInTheDocument()
    expect(screen.getByText('MCCONNELL, MITCH')).toBeInTheDocument()
  })
})
