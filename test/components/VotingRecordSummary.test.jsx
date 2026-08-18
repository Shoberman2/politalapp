import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VotingRecordSummary from '../../src/components/VotingRecordSummary.jsx'

const services = vi.hoisted(() => ({
  getMemberDashboardData: vi.fn(),
  getVotingIdeology: vi.fn(),
}))

vi.mock('../../src/services/supabaseVotes', () => ({
  getMemberDashboardData: services.getMemberDashboardData,
}))

vi.mock('../../src/services/voteviewIdeology', () => ({
  getVotingIdeology: services.getVotingIdeology,
}))

beforeEach(() => {
  services.getMemberDashboardData.mockResolvedValue({
    stats: {
      total_votes: 100,
      yea_count: 60,
      nay_count: 30,
      present_count: 0,
      party_loyalty_pct: 92,
    },
    votes: [],
  })
  services.getVotingIdeology.mockResolvedValue({
    available: true,
    label: 'Liberal-aligned voting record',
    confidence: 'High',
    placement: 33,
    votes: 535,
    congress: 119,
    methodologyUrl: 'https://voteview.com/articles/data_help_members',
  })
})

afterEach(cleanup)

describe('VotingRecordSummary', () => {
  it('puts the sourced ideology estimate and voting history in the first summary', async () => {
    render(<VotingRecordSummary bioguideId="O000172" party="Democratic" displayName="Alexandria Ocasio-Cortez" />)

    expect(await screen.findByText('Liberal-aligned voting record')).toBeInTheDocument()
    expect(screen.getByText('90%')).toBeInTheDocument()
    expect(screen.getByText('92%')).toBeInTheDocument()
    expect(screen.getByText('Official party: Democratic')).toBeInTheDocument()
  })

  it('states that analysis is not self-identification and declines unsupported narrow labels', async () => {
    render(<VotingRecordSummary bioguideId="O000172" party="Democratic" displayName="Alexandria Ocasio-Cortez" />)

    const details = await screen.findByText('How this estimate works')
    details.click()

    expect(screen.getByText(/not an official affiliation or self-identification/i)).toBeInTheDocument()
    expect(screen.getByText(/“populist” or “neoconservative” are not inferred/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /request a source-linked correction/i })).toHaveAttribute(
      'href',
      expect.stringContaining('data_correction.yml'),
    )
  })
})
