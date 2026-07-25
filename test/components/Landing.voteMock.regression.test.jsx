import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'

// REGRESSION: the "See every vote, with the receipts." step sat on grey
// skeleton bars forever. Two independent causes:
//   1. roll_call_stats had no rows for any recent roll call, so every vote came
//      back tally-less (fixed in services/floorVotes.js, covered separately).
//   2. Landing truncated the fetch to the first 5 votes BEFORE the step picked
//      its rows, so the votes that did carry tallies were thrown away — and the
//      step required a tally, so it fell back to skeletons.
// This pins cause 2 plus the "never sit on skeletons once loaded" rule.
// Reported by the user with a screenshot, 2026-07-25.

const { services } = vi.hoisted(() => ({
  services: {
    getRecentFloorVotes: vi.fn(),
    getRecentBills: vi.fn(),
    getFeaturedMembers: vi.fn(),
    getTrendingBills: vi.fn(),
    getDistrictFromAddress: vi.fn(),
    saveUserAddress: vi.fn(),
  },
}))

vi.mock('../../src/services/floorVotes', () => ({
  getRecentFloorVotes: services.getRecentFloorVotes,
}))
vi.mock('../../src/services/congress', () => ({
  getRecentBills: services.getRecentBills,
  getFeaturedMembers: services.getFeaturedMembers,
  getTrendingBills: services.getTrendingBills,
}))
vi.mock('../../src/services/userService', () => ({
  saveUserAddress: services.saveUserAddress,
}))
vi.mock('../../src/services/district', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getDistrictFromAddress: services.getDistrictFromAddress }
})

import Landing from '../../src/components/Landing'

/** A roll call with no tally — the shape recent Senate/procedural votes have. */
const untallied = (n) => ({
  id: `senate-119-2-${n}`,
  chamber: 'Senate',
  number: n,
  question: 'On the Nomination',
  description: `Confirmation: Nominee ${n}`,
  bill: null,
  yea: null,
  nay: null,
  result: null,
})

/** A bill vote carrying a real yea-nay tally. */
const tallied = (n, billNum, yea, nay) => ({
  id: `house-119-2-${n}`,
  chamber: 'House',
  number: n,
  question: 'On Passage',
  description: null,
  bill: { display: `H.R. ${billNum}`, href: `/bill/119/hr/${billNum}` },
  yea,
  nay,
  result: 'Passed',
})

function renderLanding() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    </HelmetProvider>
  )
}

beforeEach(() => {
  Object.values(services).forEach((m) => m.mockReset())
  services.getRecentBills.mockResolvedValue([])
  services.getFeaturedMembers.mockResolvedValue([])
  services.getTrendingBills.mockResolvedValue([])

  // jsdom ships neither of these, and Landing uses both (reduced-motion query,
  // reveal animations, the scroll-triggered closing clip).
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  window.IntersectionObserver = class {
    constructor(cb) { this.cb = cb }
    // Reveal straight away so rows aren't left at opacity 0.
    observe(el) { this.cb([{ isIntersecting: true, target: el }]) }
    unobserve() {}
    disconnect() {}
  }
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

afterEach(cleanup)

describe('Landing — "See every vote" step', () => {
  it('shows tallied votes even when they sit past the feed cut-off', async () => {
    // Five untallied roll calls first, then the tallied ones. The old code kept
    // only the first five and so never saw a single tally.
    services.getRecentFloorVotes.mockResolvedValue({
      votes: [
        ...[207, 208, 209, 206, 205].map(untallied),
        tallied(281, '8800', 216, 214),
        tallied(280, '7008', 232, 198),
        tallied(278, '6001', 216, 212),
      ],
      recordedThrough: '2026-07-24',
    })

    const { container } = renderLanding()

    await waitFor(() => {
      expect(container.querySelector('.mock-votes .mk-yn')).not.toBeNull()
    })

    const mock = container.querySelector('.mock-votes')
    const tallies = [...mock.querySelectorAll('.mk-yn')].map((n) => n.textContent)
    expect(tallies).toEqual(['216–214', '232–198', '216–212'])
    expect(within(mock).getByText('H.R. 8800')).toBeTruthy()
    // The whole point: no skeleton bars once the fetch has resolved.
    expect(mock.querySelectorAll('.mk-skel').length).toBe(0)
  })

  it('falls back to real bill rows rather than skeletons when no tally exists', async () => {
    services.getRecentFloorVotes.mockResolvedValue({
      votes: [
        { ...untallied(207), bill: { display: 'S.J.Res. 180', href: '/bill/119/sjres/180' } },
        untallied(208),
        untallied(209),
      ],
      recordedThrough: '2026-07-24',
    })

    const { container } = renderLanding()

    await waitFor(() => {
      expect(container.querySelector('.mock-votes .mk-vote')).not.toBeNull()
    })

    const mock = container.querySelector('.mock-votes')
    await waitFor(() => {
      expect(mock.querySelectorAll('.mk-skel').length).toBe(0)
    })
    // Real records, just without a tally chip — never invented numbers.
    expect(within(mock).getByText('S.J.Res. 180')).toBeTruthy()
    expect(mock.querySelectorAll('.mk-yn').length).toBe(0)
  })

  it('renders a lookup result beside the field that was actually used', async () => {
    // The closing section used to be a button that only scrolled back to the
    // top. It now runs the real lookup, so the result has to land next to the
    // field the reader used instead of somewhere off-screen.
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    services.getDistrictFromAddress.mockResolvedValue({ state: 'CA', city: 'Beverly Hills' })

    const { container } = renderLanding()

    const finaleForm = container.querySelector('.finale .lookup-form')
    expect(finaleForm).not.toBeNull()

    fireEvent.change(finaleForm.querySelector('input'), { target: { value: '90210' } })
    fireEvent.submit(finaleForm)

    await waitFor(() => {
      expect(container.querySelector('.finale .lookup-result')).not.toBeNull()
    })
    // ...and nowhere else.
    expect(container.querySelector('.turn .lookup-result')).toBeNull()
    expect(within(container.querySelector('.finale')).getByText('2 Senators found.')).toBeTruthy()
  })

  it('routes the opening form’s result to the opening form', async () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    services.getDistrictFromAddress.mockResolvedValue({ state: 'MA', city: 'Boston' })

    const { container } = renderLanding()

    const turnForm = container.querySelector('.turn .lookup-form')
    fireEvent.change(turnForm.querySelector('input'), { target: { value: '02134' } })
    fireEvent.submit(turnForm)

    await waitFor(() => {
      expect(container.querySelector('.turn .lookup-result')).not.toBeNull()
    })
    expect(container.querySelector('.finale .lookup-result')).toBeNull()
  })

  it('keeps the floor feed to its five most recent rows', async () => {
    services.getRecentFloorVotes.mockResolvedValue({
      votes: [207, 208, 209, 206, 205, 204, 203, 202].map(untallied),
      recordedThrough: '2026-07-24',
    })

    const { container } = renderLanding()

    await waitFor(() => {
      expect(container.querySelectorAll('.floor-feed .floor-row').length).toBeGreaterThan(0)
    })
    expect(container.querySelectorAll('.floor-feed .floor-row').length).toBe(5)
  })
})
