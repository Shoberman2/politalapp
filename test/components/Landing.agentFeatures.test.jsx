import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'

// The offices feature renders from real data only: the latest recorded vote. Skeletons only while loading,
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

describe('Landing: office feature', () => {
  it('shows skeletons, not invented data, while nothing has loaded', () => {
    services.getRecentFloorVotes.mockReturnValue(new Promise(() => {}))
    const { container } = renderLanding()
    expect(container.querySelectorAll('.feature-offices .mk-skel').length).toBeGreaterThan(0)
  })

  it('no longer carries the assistant or the write sections (2026-11-16)', async () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [vote(281), vote(280), vote(279)], recordedThrough: '2026-07-24' })
    const { container } = renderLanding()
    await waitFor(() => expect(container.querySelector('.feature-offices .mk-fields .mk-skel')).toBeNull())
    for (const id of ['mcp', 'write', 'agents']) expect(container.querySelector(`.feature-${id}`), id).toBeNull()
    expect(container.textContent).not.toMatch(/Then Write To The Person Who Cast It|Ask Your AI Assistant/)
  })

  it('prints the inbox row from the latest recorded vote', async () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [vote(281), vote(280), vote(279)], recordedThrough: '2026-07-24' })
    const { container } = renderLanding()
    await waitFor(() => expect(container.querySelector('.feature-offices .mk-fields .mk-skel')).toBeNull())
    const inbox = container.querySelector('.feature-offices .mock-inbox')
    const fields = Object.fromEntries([...inbox.querySelectorAll('.mk-fields > div')].map((d) => [d.querySelector('dt').textContent, d.querySelector('dd').textContent]))
    expect(fields).toEqual({ From: 'A constituent in your district', Re: 'H.R. 8800', Vote: '216–214 · Passed', Status: 'Received' })
  })

  it('replaces skeletons with a one-line fallback once loading fails', async () => {
    services.getRecentFloorVotes.mockRejectedValue(new Error('offline'))
    services.getFeaturedMembers.mockRejectedValue(new Error('offline'))
    const { container } = renderLanding()
    await waitFor(() => expect(container.querySelector('.feature-offices .mk-unavailable')).not.toBeNull())
    expect(container.querySelector('.feature-offices .mk-unavailable').textContent).toBe('No recorded vote available right now.')
    for (const id of ['offices', 'votes', 'find']) {
      expect(container.querySelectorAll(`.feature-${id} .mk-skel`), id).toHaveLength(0)
    }
  })
})
