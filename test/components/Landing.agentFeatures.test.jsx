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

describe('Landing: write feature', () => {
  it('shows skeletons, not invented data, while nothing has loaded', () => {
    services.getRecentFloorVotes.mockReturnValue(new Promise(() => {}))
    const { container } = renderLanding()
    expect(container.querySelectorAll('.feature-write .mk-skel').length).toBeGreaterThan(0)
  })

  it('explains writing to your rep, and nothing for developers or offices (2026-11-17)', async () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [vote(281), vote(280), vote(279)], recordedThrough: '2026-07-24' })
    const { container } = renderLanding()
    await waitFor(() => expect(container.querySelector('.feature-write .mk-skel')).toBeNull())
    for (const id of ['mcp', 'offices', 'agents']) expect(container.querySelector(`.feature-${id}`), id).toBeNull()
    expect(container.textContent).toMatch(/Then Write To The Person Who Cast It/)
    expect(container.textContent).not.toMatch(/Ask Your AI Assistant|For Congressional Offices/)
    expect(container.querySelector('a[href="/offices"]')).toBeNull()
    expect(container.querySelector('a[href="/all"]')).toBeNull()
  })

  it('opens the draft with the facts of the latest recorded vote and links to it', async () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [vote(281), vote(280), vote(279)], recordedThrough: '2026-07-24' })
    const { container } = renderLanding()
    await waitFor(() => expect(container.querySelector('.feature-write .mk-skel')).toBeNull())
    const letter = container.querySelector('.feature-write .mk-letter').textContent
    expect(letter).toContain('H.R. 8800')
    expect(letter).toContain('[Write your message here, in your own words.]')
    expect(container.querySelector('.feature-write a.btn-text').getAttribute('href')).toMatch(/^\/vote\/.+#tell-your-rep$/)
  })

  it('replaces skeletons with a one-line fallback once loading fails', async () => {
    services.getRecentFloorVotes.mockRejectedValue(new Error('offline'))
    services.getFeaturedMembers.mockRejectedValue(new Error('offline'))
    const { container } = renderLanding()
    await waitFor(() => expect(container.querySelector('.feature-write .mk-unavailable')).not.toBeNull())
    expect(container.querySelector('.feature-write .mk-unavailable').textContent).toBe('No recorded vote available right now.')
    for (const id of ['write', 'votes', 'find']) {
      expect(container.querySelectorAll(`.feature-${id} .mk-skel`), id).toHaveLength(0)
    }
  })
})
