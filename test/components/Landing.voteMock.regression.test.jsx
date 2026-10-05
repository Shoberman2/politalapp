import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

vi.mock('../../src/services/floorVotes', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRecentFloorVotes: services.getRecentFloorVotes }
})
vi.mock('../../src/services/memberRecord', () => ({
  getMemberRecord: vi.fn().mockResolvedValue(null),
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
  it('keeps both mobile ZIP submit buttons explicitly named', async () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    renderLanding()

    const buttons = await screen.findAllByRole('button', { name: 'Find my representatives' })
    expect(buttons).toHaveLength(2)
    buttons.forEach((button) => expect(button).toHaveAttribute('aria-label', 'Find my representatives'))
  })

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
    expect(container.querySelector('.hero .lookup-result')).toBeNull()
    expect(within(container.querySelector('.finale')).getByText('2 Senators found.')).toBeTruthy()
  })

  it('routes the opening form’s result to the opening form', async () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    services.getDistrictFromAddress.mockResolvedValue({ state: 'MA', city: 'Boston' })

    const { container } = renderLanding()

    const turnForm = container.querySelector('.hero .lookup-form')
    fireEvent.change(turnForm.querySelector('input'), { target: { value: '02134' } })
    fireEvent.submit(turnForm)

    await waitFor(() => {
      expect(container.querySelector('.hero .lookup-result')).not.toBeNull()
    })
    expect(container.querySelector('.finale .lookup-result')).toBeNull()
  })

  it('shows one section per platform feature, each with a text link', () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    const { container } = renderLanding()
    const features = container.querySelectorAll('.features .feature')
    expect(features.length).toBe(6)
    features.forEach((f) => {
      expect(f.querySelector('h2')).not.toBeNull()
      expect(f.querySelector('a.btn-text.btn-go')).not.toBeNull()
    })
    expect(container.querySelector('.features a[href="/this-week"]')).not.toBeNull()
  })

  it('answers common questions in an FAQ', () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    const { container } = renderLanding()
    expect(container.querySelectorAll('.faq details').length).toBeGreaterThanOrEqual(5)
    expect(container.querySelector('.faq').textContent).toMatch(/Does BallotWatch send messages for me\?/)
  })
})

describe('Landing — record-first hero (2026-10 redesign)', () => {
  it('shows the latest real tallied vote under the lookup, with links to the record and to Tell your rep', async () => {
    services.getRecentFloorVotes.mockResolvedValue({
      votes: [untallied(207), untallied(208), tallied(281, '8800', 216, 214)],
      recordedThrough: '2026-07-24',
    })

    const { container } = renderLanding()

    await waitFor(() => {
      expect(container.querySelector('.hero .hv-card .hv-bill')).not.toBeNull()
    })
    const card = container.querySelector('.hero .hv-card')
    expect(within(card).getByText('H.R. 8800')).toBeTruthy()
    expect(within(card).getByText('216–214')).toBeTruthy()
    const hrefs = [...card.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/vote/119/house/2/281')
    expect(hrefs).toContain('/vote/119/house/2/281#tell-your-rep')
  })

  it('renders no hero card at all when there is no recorded vote, never an invented one', async () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })

    const { container } = renderLanding()

    await waitFor(() => {
      expect(container.querySelector('.hero .hv-card .mk-skel')).toBeNull()
    })
    expect(container.querySelector('.hero .hv-card')).toBeNull()
  })

  it('has no video on the page', () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    const { container } = renderLanding()
    expect(container.querySelectorAll('video').length).toBe(0)
  })

  it('links offices to /offices and never offers a pilot, trial or price', () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    const { container } = renderLanding()
    const band = container.querySelector('.offices-band')
    expect(band.querySelector('a[href="/offices"]')).not.toBeNull()
    expect(band.textContent).not.toMatch(/free trial|pilot|\$\d|pricing/i)
  })

  it('frames AI as the concept: now, next and never', () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    const { container } = renderLanding()
    const ai = container.querySelector('.ai')
    expect(ai.textContent).toMatch(/what we’re building toward/i)
    expect([...ai.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Now', 'Next', 'Never'])
  })

  it('has no small labels above the feature headlines', () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    const { container } = renderLanding()
    expect(container.querySelectorAll('.features .section-kicker').length).toBe(0)
  })
})
