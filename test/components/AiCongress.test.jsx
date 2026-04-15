import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import AiCongress from '../../src/components/AiCongress'

// Mock the service
vi.mock('../../src/services/aiCongress', () => ({
  getSessions: vi.fn(),
}))

import { getSessions } from '../../src/services/aiCongress'

function renderWithProviders(ui) {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </HelmetProvider>
  )
}

describe('AiCongress', () => {
  it('renders empty state when no sessions exist', async () => {
    getSessions.mockResolvedValue([])
    renderWithProviders(<AiCongress />)

    const heading = await screen.findByText("AI Congress hasn't convened yet.")
    expect(heading).toBeInTheDocument()
  })

  it('renders session list when sessions exist', async () => {
    getSessions.mockResolvedValue([
      {
        id: 'abc',
        session_number: 1,
        status: 'completed',
        summary: 'A historic session where 15 of 25 bills passed.',
        bills_passed: 15,
        bills_failed: 10,
        total_bills: 25,
        created_at: '2026-04-14T12:00:00Z',
      },
    ])

    renderWithProviders(<AiCongress />)

    const sessionTitle = await screen.findByText('15 of 25 bills passed')
    expect(sessionTitle).toBeInTheDocument()
    expect(screen.getByText('Session 1')).toBeInTheDocument()
  })

  it('renders disambiguation banner', async () => {
    getSessions.mockResolvedValue([])
    renderWithProviders(<AiCongress />)

    const banners = await screen.findAllByText(/This is an AI simulation/)
    expect(banners.length).toBeGreaterThanOrEqual(1)
  })
})
