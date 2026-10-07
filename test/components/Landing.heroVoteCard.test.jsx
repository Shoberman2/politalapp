import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'

// The hero card splits a roll call into what it was about (the bill's own
// words, via voteSubject) and a plain line for the procedural step (plainStep),
// and only draws the yea/nay bar when both counts are known.

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

async function renderCard(v) {
  // Landing needs three presentable votes before it uses the feed. The fillers
  // carry no bill, so the hero picks the first vote: the one under test.
  const filler = (n) => vote({ id: `senate-119-2-${n}`, number: n, question: 'On the Nomination', description: `Filler ${n}` })
  services.getRecentFloorVotes.mockResolvedValue({ votes: [v, filler(498), filler(497)], recordedThrough: null })
  const { container } = render(
    <HelmetProvider>
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    </HelmetProvider>,
  )
  await waitFor(() => expect(container.querySelector('.hero .hv-card .hv-step')).not.toBeNull())
  return container.querySelector('.hero .hv-card')
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

describe('Landing hero card — plainStep', () => {
  // One test per case: each case mounts the whole Landing, and thirteen
  // mounts inside a single test overran the 5s timeout under full-suite load.
  it.each([
    ['On the Cloture Motion to Proceed', 'Vote to end debate on taking up the bill'],
    ['On the Cloture Motion', 'Vote to end debate'],
    ['On Motion to Suspend the Rules and Pass', 'Vote to pass under a fast-track rule (two-thirds needed)'],
    ['On Overriding the Veto', 'Vote to override a veto'],
    ['On the Motion to Proceed', 'Vote to take up the bill'],
    ['On Motion to Recommit', 'Vote to send the bill back to committee'],
    ['On Passage', 'Vote on final passage'],
    ['On the Bill', 'Vote on final passage'],
    ['On the Nomination', 'Vote on a nomination'],
    ['On the Amendment', 'Vote on an amendment'],
    ['On the Resolution', 'Vote on the resolution'],
    ['On the Motion to Table', 'On the Motion to Table'],   // unknown: original text
    [null, 'Recorded vote'],                                // no question at all
  ])('turns %j into a plain step, in priority order', async (question, expected) => {
    const card = await renderCard(vote({ question, description: 'Something' }))
    expect(card.querySelector('.hv-step').textContent).toBe(expected)
  })

  it('shows the result chip inside the step line with its result kind', async () => {
    const card = await renderCard(vote({ question: 'On Passage', result: 'Passed', yea: 60, nay: 40 }))
    const chip = card.querySelector('.hv-step .fr-result')
    expect(chip.textContent).toBe('Passed')
    expect(chip.className).toMatch(/fr-result \S+/)
  })
})

describe('Landing hero card — voteSubject', () => {
  it('uses the bill words after the semicolon rather than the procedural prefix', async () => {
    const card = await renderCard(vote({
      question: 'On the Cloture Motion',
      description: 'Motion to Invoke Cloture on the Motion to Proceed to H.R. 9340; A bill to fund the parks.',
    }))
    expect(card.querySelector('.hv-text').textContent).toBe('A bill to fund the parks.')
  })

  it('falls back to the whole description, then to the question', async () => {
    let card = await renderCard(vote({ question: 'On the Nomination', description: 'Confirmation: Jane Doe' }))
    expect(card.querySelector('.hv-text').textContent).toBe('Confirmation: Jane Doe')
    cleanup()
    card = await renderCard(vote({ question: 'On the Nomination', description: null }))
    expect(card.querySelector('.hv-text').textContent).toBe('On the Nomination')
  })

  it('cuts a long subject on a word boundary, drops trailing punctuation, and adds an ellipsis', async () => {
    const words = 'alpha beta gamma, '.repeat(10)   // 180 chars, commas at word ends
    const card = await renderCard(vote({ description: `Prefix; ${words}` }))
    const text = card.querySelector('.hv-text').textContent
    expect(text.endsWith('…')).toBe(true)
    expect(text.length).toBeLessThanOrEqual(111)
    expect(text).not.toMatch(/[,;:]…$/)
    expect(words.trim().startsWith(text.slice(0, -1))).toBe(true)
  })

  it('keeps a subject of exactly 110 characters whole', async () => {
    const exact = 'x'.repeat(110)
    const card = await renderCard(vote({ description: exact }))
    expect(card.querySelector('.hv-text').textContent).toBe(exact)
  })
})

describe('Landing hero card — meta line and tally bar', () => {
  it('joins chamber, vote date and roll label with dots, skipping a missing date', async () => {
    let card = await renderCard(vote({ votedAt: '2026-07-24T16:00:00Z' }))
    const meta = card.querySelector('.hv-meta').textContent
    expect(meta).toMatch(/^Senate · Jul 24, 2026 · /)
    cleanup()
    card = await renderCard(vote({ votedAt: null }))
    expect(card.querySelector('.hv-meta').textContent).not.toMatch(/2026/)
    expect(card.querySelector('.hv-meta').textContent).not.toMatch(/·\s*·/)
  })

  it('draws the bar with the yea share as its width', async () => {
    const card = await renderCard(vote({ yea: 75, nay: 25 }))
    expect(card.querySelector('.hv-yea').style.width).toBe('75%')
    expect(card.querySelector('.hv-tally').getAttribute('aria-label')).toBe('75 yea, 25 nay')
  })

  it('draws no bar when either count is unknown or both are zero, never an invented tally', async () => {
    for (const counts of [{ yea: null, nay: null }, { yea: 50, nay: null }, { yea: null, nay: 50 }, { yea: 0, nay: 0 }]) {
      const card = await renderCard(vote(counts))
      expect(card.querySelector('.hv-tally')).toBeNull()
      cleanup()
    }
  })
})
