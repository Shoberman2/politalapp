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
    buttons.forEach((button) => {
      expect(button).toHaveAttribute('aria-label', 'Find my representatives')
      // A word button on every screen size: no arrow-only state.
      expect(button.textContent).toBe('Find my reps')
      expect(button.querySelector('svg')).toBeNull()
    })
  })

  it('shows the vote record feature as a member record card, not a second list of the ticker’s votes', () => {
    // 2026-11-14: the three-row vote list repeated the hero ticker, and the
    // "Any record in 60 seconds" section repeated this one. They are one
    // section now, illustrated by the record card (skeleton until it loads).
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    const { container } = renderLanding()
    expect(container.querySelector('.mock-votes')).toBeNull()
    const card = container.querySelector('.feature-votes .mock-record')
    expect(card).not.toBeNull()
    expect(card.querySelectorAll('.mk-skel').length).toBeGreaterThan(0)
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
    expect(features.length).toBe(4)
    expect([...features].map((f) => f.className.replace('feature feature-', ''))).toEqual(
      ['find', 'bills', 'votes', 'write'])
    expect(container.querySelector('a[href="/alerts"]')).toBeNull()
    features.forEach((f) => {
      expect(f.querySelector('h2')).not.toBeNull()
      const link = f.querySelector('a.btn-text')
      expect(link).not.toBeNull()
      // Word links: no arrow class, no arrow glyph, no icon.
      expect(link.className).not.toMatch(/btn-go/)
      expect(link.textContent).not.toMatch(/[→↗›]/)
      expect(link.querySelector('svg')).toBeNull()
    })
  })

  it('answers common questions in an FAQ', () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    const { container } = renderLanding()
    // Each question opens its answer in place (2026-11-16); one group, so
    // opening one closes the last.
    const items = [...container.querySelectorAll('.faq details.faq-item')]
    expect(items.length).toBeGreaterThanOrEqual(5)
    items.forEach((d) => {
      expect(d.getAttribute('name')).toBe('landing-faq')
      expect(d.querySelector('summary').textContent.trim()).toMatch(/\?$/)
      expect(d.querySelector('p').textContent.length).toBeGreaterThan(20)
    })
    expect(container.querySelector('.faq').textContent).toMatch(/Can I contact my representative from here\?/)
    // No link in the section head: links sit at the foot of a section.
    expect(container.querySelector('.faq a')).toBeNull()
  })
})

describe('Landing — record-first hero (2026-10 redesign)', () => {
  it('shows the latest real votes under the lookup as a ticker, each linking to its roll call', async () => {
    services.getRecentFloorVotes.mockResolvedValue({
      votes: [untallied(207), untallied(208), tallied(281, '8800', 216, 214)],
      recordedThrough: '2026-07-24',
    })

    const { container } = renderLanding()

    await waitFor(() => {
      expect(container.querySelector('.hero .floor-ticker .ft-bill')).not.toBeNull()
    })
    const group = container.querySelector('.hero .floor-ticker .ft-group:not([aria-hidden])')
    expect(within(group).getByText('H.R. 8800')).toBeTruthy()
    expect(within(group).getByText('216–214')).toBeTruthy()
    const hrefs = [...group.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/vote/119/house/2/281')
  })

  it('renders no ticker items when there is no recorded vote, never an invented one', async () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })

    const { container } = renderLanding()

    await waitFor(() => {
      expect(container.querySelector('.hero .floor-ticker .mk-skel')).toBeNull()
    })
    expect(container.querySelector('.hero .floor-ticker .ft-item')).toBeNull()
    expect(container.querySelector('.hero .floor-ticker .mk-unavailable')).not.toBeNull()
  })

  it('has no video in the hero; the one film on the page is silent and never loops', () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    const { container } = renderLanding()
    expect(container.querySelectorAll('.hero video').length).toBe(0)
    const films = container.querySelectorAll('video')
    expect(films.length).toBe(1)
    expect(films[0].closest('.gov-ladder')).not.toBeNull()
    expect(films[0].muted).toBe(true)
    expect(films[0].hasAttribute('loop')).toBe(false)
    expect(films[0].hasAttribute('autoplay')).toBe(false)
  })

  it('never mentions offices, the members list or a price (2026-11-17)', () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    const { container } = renderLanding()
    expect(container.querySelector('.feature-offices')).toBeNull()
    expect(container.querySelector('a[href="/offices"]')).toBeNull()
    expect(container.querySelector('a[href="/all"]')).toBeNull()
    expect(container.textContent).not.toMatch(/free trial|pilot|\$\d|pricing/i)
  })

  it('has no dark concept band, no offices band and no italic headline accents', () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    const { container } = renderLanding()
    expect(container.querySelector('.ai')).toBeNull()
    expect(container.querySelector('.offices-band')).toBeNull()
    expect(container.querySelectorAll('h1 em, h2 em, h3 em').length).toBe(0)
    expect(container.textContent).not.toMatch(/what we’re building toward/i)
  })

  it('keeps the ZIP privacy claim in the FAQ, not under the hero lookup', () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    const { container } = renderLanding()
    expect(container.querySelector('.lookup-hint')).toBeNull()
    const faq = container.querySelector('.faq').textContent
    expect(faq.match(/Your ZIP code never reaches our servers\./g)).toHaveLength(1)
  })

  it('shows a real photograph beside each primer fact, with the glossary link at the foot', () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    const { container } = renderLanding()
    const items = [...container.querySelectorAll('.primer-list li')]
    expect(items).toHaveLength(5)
    items.forEach((li) => {
      const img = li.querySelector('img')
      expect(img.getAttribute('src')).toMatch(/^\/gov\/primer-[a-z]+\.jpg$/)
      expect(img.getAttribute('alt').length).toBeGreaterThan(5)
    })
    const primer = container.querySelector('.primer-inner')
    expect(primer.lastElementChild.getAttribute('href')).toBe('/glossary')
  })

  it('explains who runs the government and links to the departments', () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    const { container } = renderLanding()
    const gov = container.querySelector('.gov-ladder')
    expect(gov.querySelector('h2').textContent).toBe('Who Runs The Government')
    expect(gov.querySelectorAll('.gov-rungs li')).toHaveLength(3)
    expect(gov.querySelector('a.gov-ladder-link').getAttribute('href')).toBe('/government')
  })

  it('has no small labels above the feature headlines', () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    const { container } = renderLanding()
    expect(container.querySelectorAll('.features .section-kicker').length).toBe(0)
    expect(container.querySelector('.primer-kicker')).toBeNull()
  })
})
