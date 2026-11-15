import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ShutdownBanner from '../../src/components/ShutdownBanner'

// Regression: ISSUE-003 — every non-landing route fetched four appropriations
// lists even though the banner discarded the response.
// Found by /qa on 2026-07-10.

const { fetchAppropriationsBills } = vi.hoisted(() => ({
  fetchAppropriationsBills: vi.fn(),
}))

vi.mock('../../src/services/shutdown', () => ({
  calculateShutdownRisk: vi.fn(() => ({
    level: 'low',
    nextDeadline: null,
  })),
  getCountdown: vi.fn(),
  fetchAppropriationsBills,
}))

describe('ShutdownBanner request regression', () => {
  beforeEach(() => {
    sessionStorage.clear()
    fetchAppropriationsBills.mockReset()
  })

  it('renders the calculated risk without starting a discarded API fetch', async () => {
    render(
      <MemoryRouter>
        <ShutdownBanner />
      </MemoryRouter>
    )

    expect((await screen.findByText('low')).closest('strong').textContent).toBe('Shutdown risk: low')
    expect(fetchAppropriationsBills).not.toHaveBeenCalled()
  })

  it('says nothing once the hand-kept deadline has passed (the list is stale)', async () => {
    const shutdown = await import('../../src/services/shutdown')
    shutdown.calculateShutdownRisk.mockReturnValueOnce({ level: 'shutdown', nextDeadline: { date: '2026-09-30' } })
    shutdown.getCountdown.mockReturnValue({ expired: true })
    const { container } = render(
      <MemoryRouter>
        <ShutdownBanner />
      </MemoryRouter>
    )
    expect(container.querySelector('.shutdown-banner')).toBeNull()
    shutdown.getCountdown.mockReset()
  })
})
