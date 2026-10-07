import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'

// The hero floor ticker (2026-10-06): the latest recorded votes, newest
// first, as a strip that rolls left. Each item links to its roll call and
// shows the chamber and roll, the bill, what the vote was about (voteSubject),
// the tally and the result chip. The list renders as many copies as cover the
// strip plus one (at least two) for a seamless loop, every copy after the first
// hidden from assistive tech and the tab order. A Pause control stops it.
// Real data only.

const { services } = vi.hoisted(() => ({
  services: {
    getRecentFloorVotes: vi.fn(),
    getRecentBills: vi.fn(),
    getFeaturedMembers: vi.fn(),
    getTrendingBills: vi.fn(),
  },
}))

vi.mock('../../src/services/floorVotes', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRecentFloorVotes: services.getRecentFloorVotes }
})
vi.mock('../../src/services/memberRecord', () => ({ getMemberRecord: vi.fn().mockResolvedValue(null) }))
vi.mock('../../src/services/congress', () => ({
  getRecentBills: services.getRecentBills,
  getFeaturedMembers: services.getFeaturedMembers,
  getTrendingBills: services.getTrendingBills,
}))
vi.mock('../../src/services/userService', () => ({ saveUserAddress: vi.fn() }))

import Landing from '../../src/components/Landing'

const vote = (over = {}) => ({
  id: 'senate-119-2-500',
  chamber: 'Senate',
  number: 500,
  question: 'On Passage of the Bill',
  description: null,
  bill: null,
  votedAt: null,
  yea: null,
  nay: null,
  result: null,
  ...over,
})

function renderLanding() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    </HelmetProvider>,
  )
}

const mainGroup = (container) => container.querySelector('.hero .floor-ticker .ft-group:not([aria-hidden])')

async function renderTicker(votes) {
  services.getRecentFloorVotes.mockResolvedValue({ votes, recordedThrough: null })
  const { container } = renderLanding()
  await waitFor(() => expect(mainGroup(container)).not.toBeNull())
  return container
}

// The subject of the first item, for the voteSubject cases. Fillers keep the
// feed at three votes; the vote under test is first (newest).
async function subjectOf(v) {
  const filler = (n) => vote({ id: `senate-119-2-${n}`, number: n, question: 'On the Nomination', description: `Filler ${n}` })
  const container = await renderTicker([v, filler(498), filler(497)])
  return mainGroup(container).querySelector('.ft-item .ft-subject').textContent
}

beforeEach(() => {
  Object.values(services).forEach((m) => m.mockReset())
  services.getRecentBills.mockResolvedValue([])
  services.getFeaturedMembers.mockResolvedValue([])
  services.getTrendingBills.mockResolvedValue([])
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  window.IntersectionObserver = class {
    constructor(cb) { this.cb = cb }
    observe(el) { this.cb([{ isIntersecting: true, target: el }]) }
    unobserve() {}
    disconnect() {}
  }
})

afterEach(cleanup)

describe('Landing hero floor ticker', () => {
  const votes = [
    vote({
      id: 'senate-119-2-500', number: 500, bill: { display: 'H.R. 9340', href: '/bill/119/hr/9340' },
      question: 'On the Cloture Motion',
      description: 'Motion to Invoke Cloture on the Motion to Proceed to H.R. 9340; A bill to fund the parks.',
      yea: 57, nay: 43, result: 'Cloture Motion Agreed to',
    }),
    vote({ id: 'house-119-2-281', chamber: 'House', number: 281, description: 'Some resolution', yea: 200, nay: 220, result: 'Failed' }),
    vote({ id: 'senate-119-2-499', number: 499, question: 'On the Nomination', description: 'Confirmation: Jane Doe' }),
  ]

  it('renders one item per vote, newest first, with roll, bill, subject, tally and result chip', async () => {
    const container = await renderTicker(votes)
    const ticker = container.querySelector('.hero .floor-ticker')
    expect(ticker.getAttribute('role')).toBe('region')
    expect(ticker.getAttribute('aria-label')).toBe('Latest recorded votes')
    expect(ticker.getAttribute('aria-live')).toBeNull()
    expect(ticker.querySelector('.ft-label').textContent).toMatch(/Latest recorded votes/)

    const items = mainGroup(container).querySelectorAll('.ft-item')
    expect(items.length).toBe(3)
    const first = items[0]
    expect(first.querySelector('.ft-roll').textContent).toBe('Senate · Roll 500')
    expect(first.querySelector('.ft-bill').textContent).toBe('H.R. 9340')
    expect(first.querySelector('.ft-subject').textContent).toBe('A bill to fund the parks.')
    expect(first.querySelector('.ft-tally').textContent).toBe('57–43')
    const chip = first.querySelector('.fr-result')
    expect(chip.textContent).toBe('Cloture Motion Agreed to')
    expect(chip.className).toBe('fr-result pass')
    expect(items[1].querySelector('.ft-roll').textContent).toBe('House · Roll 281')
    expect(items[1].querySelector('.ft-bill')).toBeNull()
    expect(items[1].querySelector('.fr-result').className).toBe('fr-result fail')
    expect(items[2].querySelector('.ft-tally')).toBeNull()
    expect(items[2].querySelector('.fr-result')).toBeNull()
  })

  it('gives each link a spoken label with the missing parts left out', async () => {
    const container = await renderTicker([
      ...votes,
      vote({ id: 'senate-119-2-498', chamber: null, number: null, bill: { display: 'S. 12', href: '/bill/119/s/12' }, description: 'A bill.' }),
    ])
    const labels = [...mainGroup(container).querySelectorAll('a.ft-item')].map((a) => a.getAttribute('aria-label'))
    expect(labels).toEqual([
      'Senate roll call 500, H.R. 9340: A bill to fund the parks, 57 to 43, Cloture Motion Agreed to',
      'House roll call 281, Some resolution, 200 to 220, Failed',
      'Senate roll call 499, Confirmation: Jane Doe',
      'S. 12: A bill',
    ])
    // no chamber and no roll number: no empty .ft-roll span
    expect(mainGroup(container).querySelectorAll('.ft-item')[3].querySelector('.ft-roll')).toBeNull()
  })

  it('pauses and plays from the Pause control in the label', async () => {
    const container = await renderTicker(votes)
    const ticker = container.querySelector('.hero .floor-ticker')
    const button = ticker.querySelector('.ft-label button.ft-pause')
    expect(button.getAttribute('type')).toBe('button')
    expect(button.textContent).toBe('Pause')
    expect(button.hasAttribute('aria-pressed')).toBe(false)
    expect(ticker.className).not.toMatch(/is-paused/)
    act(() => { button.click() })
    expect(button.textContent).toBe('Play')
    expect(ticker.className).toMatch(/is-paused/)
    act(() => { button.click() })
    expect(button.textContent).toBe('Pause')
    expect(ticker.className).not.toMatch(/is-paused/)
  })

  it('stops the strip while a ticker link has keyboard focus and resets the scroll on leaving', async () => {
    const container = await renderTicker(votes)
    const ticker = container.querySelector('.hero .floor-ticker')
    const viewport = ticker.querySelector('.ft-viewport')
    const [a, b] = mainGroup(container).querySelectorAll('a.ft-item')
    act(() => { a.focus() })
    expect(ticker.className).toMatch(/is-focused/)
    act(() => { b.focus() })
    expect(ticker.className).toMatch(/is-focused/)
    viewport.scrollLeft = 120
    act(() => { b.blur() })
    expect(ticker.className).not.toMatch(/is-focused/)
    expect(viewport.scrollLeft).toBe(0)
    // a mouse press on a link must not stop the strip (the click would be lost)
    act(() => { fireEvent.mouseDown(a); a.focus() })
    expect(ticker.className).not.toMatch(/is-focused/)
    act(() => { a.blur() })
    // the Pause control is not a link: focusing it does not stop the strip
    act(() => { ticker.querySelector('.ft-pause').focus() })
    expect(ticker.className).not.toMatch(/is-focused/)
  })

  it('links each item to its roll-call page', async () => {
    const container = await renderTicker(votes)
    const hrefs = [...mainGroup(container).querySelectorAll('a.ft-item')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/vote/119/senate/2/500', '/vote/119/house/2/281', '/vote/119/senate/2/499'])
  })

  it('renders the list twice, the second copy aria-hidden and out of the tab order', async () => {
    const container = await renderTicker(votes)
    const groups = container.querySelectorAll('.hero .floor-ticker .ft-track .ft-group')
    expect(groups.length).toBe(2)
    expect(groups[0].getAttribute('aria-hidden')).toBeNull()
    expect(groups[1].getAttribute('aria-hidden')).toBe('true')
    expect(groups[1].textContent).toBe(groups[0].textContent)
    groups[0].querySelectorAll('a').forEach((a) => expect(a.getAttribute('tabindex')).toBeNull())
    groups[1].querySelectorAll('a').forEach((a) => expect(a.getAttribute('tabindex')).toBe('-1'))
    // 3 items: the 40s floor wins over 7s per item.
    expect(container.querySelector('.ft-track').style.animationDuration).toBe('40s')
    expect(container.querySelector('.ft-track').style.getPropertyValue('--ft-shift')).toBe('-50%')
  })

  it('renders at least two copies when nothing can be measured (jsdom widths are 0)', async () => {
    const container = await renderTicker([votes[0]])
    expect(container.querySelectorAll('.hero .floor-ticker .ft-group').length).toBeGreaterThanOrEqual(2)
  })

  it('adds copies so a one-vote list still covers a wide strip', async () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
      const width = this.classList.contains('ft-viewport') ? 1200 : this.classList.contains('ft-group') ? 300 : 0
      return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON() {} }
    })
    try {
      const container = await renderTicker([votes[0]])
      // ceil(1200 / 300) + 1 = 5 copies, shifting by one copy (-20%)
      await waitFor(() => expect(container.querySelectorAll('.hero .floor-ticker .ft-group').length).toBe(5))
      const groups = container.querySelectorAll('.hero .floor-ticker .ft-group')
      expect(groups[0].getAttribute('aria-hidden')).toBeNull()
      ;[...groups].slice(1).forEach((g) => {
        expect(g.getAttribute('aria-hidden')).toBe('true')
        g.querySelectorAll('a').forEach((a) => expect(a.getAttribute('tabindex')).toBe('-1'))
      })
      expect(container.querySelector('.ft-track').style.getPropertyValue('--ft-shift')).toBe('-20%')
      // the duration stays per copy: one item, the 40s floor
      expect(container.querySelector('.ft-track').style.animationDuration).toBe('40s')
    } finally {
      spy.mockRestore()
    }
  })

  it('renders the list once and stays still when the reader prefers reduced motion', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    const container = await renderTicker(votes)
    expect(container.querySelectorAll('.hero .floor-ticker .ft-group').length).toBe(1)
    expect(container.querySelector('.ft-track').className).toMatch(/ft-static/)
  })

  it('flips to a single still copy when the reduced-motion setting changes, and drops the listener on unmount', async () => {
    const listeners = new Set()
    const mq = {
      matches: false,
      addEventListener: vi.fn((type, fn) => listeners.add(fn)),
      removeEventListener: vi.fn((type, fn) => listeners.delete(fn)),
    }
    window.matchMedia = vi.fn().mockReturnValue(mq)
    services.getRecentFloorVotes.mockResolvedValue({ votes, recordedThrough: null })
    const { container, unmount } = renderLanding()
    await waitFor(() => expect(mainGroup(container)).not.toBeNull())
    expect(container.querySelectorAll('.ft-group').length).toBe(2)
    act(() => { mq.matches = true; listeners.forEach((fn) => fn({ matches: true })) })
    expect(container.querySelectorAll('.ft-group').length).toBe(1)
    expect(container.querySelector('.ft-track').className).toMatch(/ft-static/)
    expect(container.querySelector('.ft-pause')).toBeNull()
    act(() => { mq.matches = false; listeners.forEach((fn) => fn({ matches: false })) })
    expect(container.querySelectorAll('.ft-group').length).toBe(2)
    unmount()
    expect(listeners.size).toBe(0)
  })

  it('falls back to addListener/removeListener on older MediaQueryList implementations', async () => {
    const listeners = new Set()
    const mq = {
      matches: false,
      addListener: vi.fn((fn) => listeners.add(fn)),
      removeListener: vi.fn((fn) => listeners.delete(fn)),
    }
    window.matchMedia = vi.fn().mockReturnValue(mq)
    services.getRecentFloorVotes.mockResolvedValue({ votes, recordedThrough: null })
    const { container, unmount } = renderLanding()
    await waitFor(() => expect(mainGroup(container)).not.toBeNull())
    expect(mq.addListener).toHaveBeenCalledTimes(1)
    act(() => { listeners.forEach((fn) => fn({ matches: true })) })
    expect(container.querySelectorAll('.ft-group').length).toBe(1)
    unmount()
    expect(mq.removeListener).toHaveBeenCalledTimes(1)
    expect(listeners.size).toBe(0)
  })

  it('caps the strip at 12 votes and paces the loop at 7s per item', async () => {
    const many = Array.from({ length: 16 }, (_, i) => vote({ id: `senate-119-2-${600 - i}`, number: 600 - i, description: `Vote ${i}` }))
    const container = await renderTicker(many)
    expect(mainGroup(container).querySelectorAll('.ft-item').length).toBe(12)
    expect(mainGroup(container).querySelector('.ft-roll').textContent).toBe('Senate · Roll 600')
    expect(container.querySelector('.ft-track').style.animationDuration).toBe('84s')
  })

  it('skips votes with no roll-call page to link to', async () => {
    const container = await renderTicker([vote({ id: 'not-an-id', description: 'Orphan' }), ...votes])
    expect(mainGroup(container).textContent).not.toMatch(/Orphan/)
    expect(mainGroup(container).querySelectorAll('.ft-item').length).toBe(3)
  })

  it('shows three skeleton items before the votes resolve', async () => {
    let resolve
    services.getRecentFloorVotes.mockReturnValue(new Promise((r) => { resolve = r }))
    const { container } = renderLanding()
    const ticker = container.querySelector('.hero .floor-ticker')
    expect(ticker.querySelectorAll('.ft-skel').length).toBe(3)
    expect(ticker.querySelector('.ft-track').className).toMatch(/ft-static/)
    expect(ticker.querySelector('a')).toBeNull()
    await act(async () => { resolve({ votes, recordedThrough: null }) })
    await waitFor(() => expect(ticker.querySelector('.ft-skel')).toBeNull())
  })

  it('shows the unavailable line when there are no recorded votes, never an invented one', async () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
    const { container } = renderLanding()
    await waitFor(() => expect(container.querySelector('.hero .floor-ticker .mk-unavailable')).not.toBeNull())
    const ticker = container.querySelector('.hero .floor-ticker')
    expect(ticker.querySelector('.mk-unavailable').textContent).toBe('No recorded vote available right now.')
    expect(ticker.querySelector('.ft-item')).toBeNull()
  })
})

describe('Landing hero floor ticker — voteSubject', () => {
  it('uses the bill words after the semicolon rather than the procedural prefix', async () => {
    expect(await subjectOf(vote({
      question: 'On the Cloture Motion',
      description: 'Motion to Invoke Cloture on the Motion to Proceed to H.R. 9340; A bill to fund the parks.',
    }))).toBe('A bill to fund the parks.')
  })

  it('falls back to the whole description, then to the question', async () => {
    expect(await subjectOf(vote({ question: 'On the Nomination', description: 'Confirmation: Jane Doe' }))).toBe('Confirmation: Jane Doe')
    cleanup()
    expect(await subjectOf(vote({ question: 'On the Nomination', description: null }))).toBe('On the Nomination')
  })

  it('cuts a long subject at a word boundary to 72 characters with an ellipsis', async () => {
    const words = 'alpha beta gamma, '.repeat(10)
    const text = await subjectOf(vote({ description: `Prefix; ${words}` }))
    expect(text.endsWith('…')).toBe(true)
    expect(text.length).toBeLessThanOrEqual(72)
    const body = text.slice(0, -1)
    expect(words.trim().startsWith(body)).toBe(true)
    // ends on a whole word: the next source character is a space or comma
    expect(words[body.length]).toMatch(/[ ,]/)
    expect(text).not.toMatch(/[,;:]…$/)
    expect(text).not.toMatch(/\s…$/)
  })

  it('keeps a short subject whole', async () => {
    const exact = 'x'.repeat(72)
    expect(await subjectOf(vote({ description: exact }))).toBe(exact)
  })
})
