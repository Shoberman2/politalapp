import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'

// The MCP, API and offices features render from real data only: the featured
// member's record and the latest recorded vote. Skeletons only while loading,
// a one-line fallback when the data could not be loaded, never invented rows.

const { services } = vi.hoisted(() => ({
  services: {
    getRecentFloorVotes: vi.fn(),
    getFeaturedMembers: vi.fn(),
    getMemberRecord: vi.fn(),
  },
}))

vi.mock('../../src/services/floorVotes', async (importOriginal) => ({ ...(await importOriginal()), getRecentFloorVotes: services.getRecentFloorVotes }))
vi.mock('../../src/services/memberRecord', () => ({ getMemberRecord: services.getMemberRecord }))
vi.mock('../../src/services/congress', () => ({
  getRecentBills: vi.fn().mockResolvedValue([]),
  getFeaturedMembers: services.getFeaturedMembers,
  getTrendingBills: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../src/services/userService', () => ({ saveUserAddress: vi.fn() }))

import Landing from '../../src/components/Landing'

const vote = (n, extra = {}) => ({
  id: `house-119-2-${n}`, chamber: 'House', number: n, question: 'On Passage', description: null,
  bill: { display: 'H.R. 8800', href: '/bill/119/hr/8800' }, votedAt: '2026-07-24', yea: 216, nay: 214, result: 'Passed', ...extra,
})

const record = {
  id: 'B001318', name: 'Becca Balint', chamber: 'house', state: 'VT',
  stats: { total: 10, cast: 9, notVoting: 1 },
  recentVotes: [
    { roll_call_id: 'house-119-2-281', chamber: 'House', roll: 281, question: 'On Passage', bill: { label: 'H.R. 8800' }, position: 'Yea' },
    { roll_call_id: 'house-119-2-280', chamber: 'House', roll: 280, question: 'On Motion to Recommit', bill: null, position: 'Nay' },
  ],
}

function renderLanding() {
  return render(<HelmetProvider><MemoryRouter><Landing /></MemoryRouter></HelmetProvider>)
}

beforeEach(() => {
  Object.values(services).forEach((m) => m.mockReset())
  services.getFeaturedMembers.mockResolvedValue([])
  services.getMemberRecord.mockResolvedValue(null)
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
})
afterEach(cleanup)

describe('Landing: agent and office features', () => {
  it('shows skeletons, not invented data, while nothing has loaded', () => {
    services.getRecentFloorVotes.mockReturnValue(new Promise(() => {}))
    const { container } = renderLanding()
    for (const id of ['mcp', 'agents', 'offices']) {
      const f = container.querySelector(`.feature-${id}`)
      expect(f.querySelectorAll('.mk-skel').length).toBeGreaterThan(0)
    }
    expect(container.querySelector('.feature-agents .mk-json')).toBeNull()
    expect(container.querySelector('.feature-mcp .mk-answer li')).toBeNull()
  })

  it('builds the MCP transcript from the featured member’s real votes', async () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    services.getFeaturedMembers.mockResolvedValue([{ bioguideId: 'B001318', name: 'Becca Balint', chamber: 'house', state: 'VT', party: 'D' }])
    services.getMemberRecord.mockResolvedValue(record)
    const { container } = renderLanding()
    await waitFor(() => expect(container.querySelector('.feature-mcp .mk-answer li')).not.toBeNull())
    const mcp = container.querySelector('.feature-mcp .mock-chat')
    expect(mcp.querySelector('.mk-turn-user').textContent).toMatch('How did Becca Balint vote recently?')
    const rows = [...mcp.querySelectorAll('.mk-answer li')].map((li) => li.textContent)
    expect(rows).toEqual(['YeaH.R. 8800 · On Passage', 'NayOn Motion to Recommit'])
    expect(mcp.querySelector('.mk-src').textContent).toBe('Source · BallotWatch MCP · House roll call 281')
  })

  it('prints the API response and the inbox row from the latest recorded vote', async () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [vote(281), vote(280), vote(279)], recordedThrough: '2026-07-24' })
    const { container } = renderLanding()
    await waitFor(() => expect(container.querySelector('.feature-agents .mk-json')).not.toBeNull())

    const code = container.querySelector('.feature-agents .mock-code')
    expect(code.querySelector('.mk-req').textContent).toBe('GET /api/v1/votes/house-119-2-281')
    const json = code.querySelector('.mk-json').textContent
    expect(json).toMatch('"roll_call_id": "house-119-2-281"')
    expect(json).toMatch('"voted_at": "2026-07-24"')
    expect(json).toMatch(/"yea": 216,\s*"nay": 214/)
    expect(json).toMatch('"source_url": "https://clerk.house.gov/Votes/2026281"')

    const inbox = container.querySelector('.feature-offices .mock-inbox')
    const fields = Object.fromEntries([...inbox.querySelectorAll('.mk-fields > div')].map((d) => [d.querySelector('dt').textContent, d.querySelector('dd').textContent]))
    expect(fields).toEqual({ From: 'A constituent in your district', Re: 'H.R. 8800', Vote: '216–214 · Passed', Status: 'Received' })
  })

  it('replaces skeletons with a one-line fallback once loading fails', async () => {
    services.getRecentFloorVotes.mockRejectedValue(new Error('offline'))
    services.getFeaturedMembers.mockRejectedValue(new Error('offline'))
    const { container } = renderLanding()
    await waitFor(() => expect(container.querySelector('.feature-offices .mk-unavailable')).not.toBeNull())
    expect(container.querySelector('.feature-mcp .mk-unavailable').textContent).toBe('The record could not be loaded right now.')
    expect(container.querySelector('.feature-agents .mk-unavailable').textContent).toBe('No recorded vote available right now.')
    expect(container.querySelector('.feature-offices .mk-unavailable').textContent).toBe('No recorded vote available right now.')
    for (const id of ['mcp', 'agents', 'offices', 'record', 'write', 'votes', 'find']) {
      expect(container.querySelectorAll(`.feature-${id} .mk-skel`), id).toHaveLength(0)
    }
  })

  it('says "No recorded votes yet." when the featured member has none', async () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    services.getFeaturedMembers.mockResolvedValue([{ bioguideId: 'B001318', name: 'Becca Balint', chamber: 'house', state: 'VT', party: 'D' }])
    services.getMemberRecord.mockResolvedValue({ ...record, recentVotes: [] })
    const { container } = renderLanding()
    await waitFor(() => expect(container.querySelector('.feature-mcp .mk-turn-ai p')?.textContent).toBe('No recorded votes yet.'))
  })
})
