import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import AiCongressSession from '../../src/components/AiCongressSession'

// Mock the service
vi.mock('../../src/services/aiCongress', () => ({
  getSession: vi.fn(),
}))

import { getSession } from '../../src/services/aiCongress'

function renderWithRoute(sessionId = 'abc') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/ai-congress/${sessionId}`]}>
        <Routes>
          <Route path="/ai-congress/:sessionId" element={<AiCongressSession />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  )
}

const mockSession = {
  id: 'abc',
  session_number: 1,
  status: 'completed',
  summary: 'An evidence-based Congress passed 15 of 25 bills.',
  bills_passed: 15,
  bills_failed: 10,
  total_bills: 25,
  created_at: '2026-04-14T12:00:00Z',
  bills: [
    {
      id: 'b1',
      title: 'The Affordable Housing Expansion Act',
      issue: 'Housing affordability',
      provisions: ['$50B for affordable housing', 'Tax credits for developers'],
      estimated_cost: '$50 billion annually',
      affected_groups: 'Low-income families',
      house_yea: 312,
      house_nay: 123,
      house_passed: true,
      house_arguments_for: ['Housing costs affect every district'],
      house_arguments_against: ['Federal spending concerns'],
      senate_yea: 67,
      senate_nay: 33,
      senate_passed: true,
      senate_cloture_required: false,
      senate_cloture_votes: null,
      senate_arguments_for: ['Bipartisan support for housing'],
      senate_arguments_against: ["States' rights"],
      passed: true,
      surprise_rationale: 'Fiscal conservatives supported it because housing instability increases other federal spending.',
      sort_order: 0,
    },
    {
      id: 'b2',
      title: 'Universal Background Check Act',
      issue: 'Gun violence',
      provisions: ['Universal background checks'],
      estimated_cost: '$500 million annually',
      affected_groups: 'Gun owners',
      house_yea: 200,
      house_nay: 235,
      house_passed: false,
      house_arguments_for: ['Public safety'],
      house_arguments_against: ['Second Amendment concerns'],
      senate_yea: 45,
      senate_nay: 55,
      senate_passed: false,
      senate_cloture_required: true,
      senate_cloture_votes: 52,
      senate_arguments_for: ['Bipartisan polling support'],
      senate_arguments_against: ['Constitutional objections'],
      passed: false,
      surprise_rationale: 'Even without party loyalty, constitutional concerns prevented passage.',
      sort_order: 1,
    },
  ],
}

describe('AiCongressSession', () => {
  it('renders completed session with all bill cards', async () => {
    getSession.mockResolvedValue(mockSession)
    renderWithRoute()

    const title = await screen.findByText('The Affordable Housing Expansion Act')
    expect(title).toBeInTheDocument()
    expect(screen.getByText('Universal Background Check Act')).toBeInTheDocument()
  })

  it('shows PASSED and FAILED tags correctly', async () => {
    getSession.mockResolvedValue(mockSession)
    renderWithRoute()

    const titles = await screen.findAllByText('The Affordable Housing Expansion Act')
    expect(titles.length).toBeGreaterThanOrEqual(1)
    const passedTags = document.querySelectorAll('.ai-bill-tag.passed')
    const failedTags = document.querySelectorAll('.ai-bill-tag.failed')
    expect(passedTags.length).toBeGreaterThanOrEqual(1)
    expect(failedTags.length).toBeGreaterThanOrEqual(1)
  })

  it('shows running status banner', async () => {
    getSession.mockResolvedValue({
      ...mockSession,
      status: 'running',
      summary: null,
      bills: [mockSession.bills[0]],
    })
    renderWithRoute()

    const banner = await screen.findByText(/Simulation in progress/)
    expect(banner).toBeInTheDocument()
  })

  it('shows failed status banner', async () => {
    getSession.mockResolvedValue({
      ...mockSession,
      status: 'failed',
      bills: [mockSession.bills[0]],
    })
    renderWithRoute()

    const banner = await screen.findByText(/did not complete/)
    expect(banner).toBeInTheDocument()
  })

  it('renders disambiguation banner', async () => {
    getSession.mockResolvedValue(mockSession)
    renderWithRoute()

    const banners = await screen.findAllByText(/This is an AI simulation/)
    expect(banners.length).toBeGreaterThanOrEqual(1)
  })

  it('shows vote tallies with chamber labels', async () => {
    getSession.mockResolvedValue(mockSession)
    renderWithRoute()

    const titles = await screen.findAllByText('The Affordable Housing Expansion Act')
    expect(titles.length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('House:').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Senate:').length).toBeGreaterThan(0)
  })

  it('shows cloture info when required', async () => {
    getSession.mockResolvedValue(mockSession)
    renderWithRoute()

    const titles = await screen.findAllByText('Universal Background Check Act')
    expect(titles.length).toBeGreaterThanOrEqual(1)
    const cloture = screen.getAllByText('Cloture: 52/60')
    expect(cloture.length).toBeGreaterThanOrEqual(1)
  })

  it('renders surprise rationale', async () => {
    getSession.mockResolvedValue(mockSession)
    renderWithRoute()

    const titles = await screen.findAllByText('The Affordable Housing Expansion Act')
    expect(titles.length).toBeGreaterThanOrEqual(1)
    const surprise = screen.getAllByText(/Fiscal conservatives supported it/)
    expect(surprise.length).toBeGreaterThanOrEqual(1)
  })
})
