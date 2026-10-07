import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Branches of the hero floor ticker not covered by Landing.floorTicker.test:
// the reduced-motion hook following the setting live and its fallbacks, a
// rejected or null feed, rows with nothing to show, labels with a missing
// chamber or roll number, the duration boundary, and the CSS-only pause and
// reduced-motion rules.

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

const votes = [
  vote({ id: 'senate-119-2-500', number: 500, description: 'First' }),
  vote({ id: 'house-119-2-281', chamber: 'House', number: 281, description: 'Second' }),
  vote({ id: 'senate-119-2-499', number: 499, description: 'Third' }),
]

function renderLanding() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    </HelmetProvider>,
  )
}

const ticker = (container) => container.querySelector('.hero .floor-ticker')
const mainGroup = (container) => container.querySelector('.hero .floor-ticker .ft-group:not([aria-hidden])')

async function renderTicker(list) {
  services.getRecentFloorVotes.mockResolvedValue({ votes: list, recordedThrough: null })
  const utils = renderLanding()
  await waitFor(() => expect(mainGroup(utils.container)).not.toBeNull())
  return utils
}

// A controllable MediaQueryList: fire(true/false) flips the setting live.
function liveMediaQuery(initial) {
  const listeners = new Set()
  const mq = {
    matches: initial,
    addEventListener: vi.fn((type, fn) => { if (type === 'change') listeners.add(fn) }),
    removeEventListener: vi.fn((type, fn) => { if (type === 'change') listeners.delete(fn) }),
  }
  const fire = (matches) => { mq.matches = matches; listeners.forEach((fn) => fn({ matches })) }
  return { mq, fire, listeners }
}

let originalMatchMedia
beforeEach(() => {
  Object.values(services).forEach((m) => m.mockReset())
  services.getRecentBills.mockResolvedValue([])
  services.getFeaturedMembers.mockResolvedValue([])
  services.getTrendingBills.mockResolvedValue([])
  originalMatchMedia = window.matchMedia
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  window.IntersectionObserver = class {
    constructor(cb) { this.cb = cb }
    observe(el) { this.cb([{ isIntersecting: true, target: el }]) }
    unobserve() {}
    disconnect() {}
  }
})

afterEach(() => {
  cleanup()
  window.matchMedia = originalMatchMedia
})

describe('Landing hero floor ticker — reduced motion follows the setting live', () => {
  it('stops and drops the copy when reduced motion turns on, and rolls again when it turns off', async () => {
    const { mq, fire } = liveMediaQuery(false)
    window.matchMedia = vi.fn().mockReturnValue(mq)
    const { container } = await renderTicker(votes)
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
    expect(container.querySelectorAll('.ft-group').length).toBe(2)
    expect(container.querySelector('.ft-track').className).not.toMatch(/ft-static/)

    act(() => fire(true))
    expect(container.querySelectorAll('.ft-group').length).toBe(1)
    expect(container.querySelector('.ft-track').className).toMatch(/ft-static/)
    expect(container.querySelector('.ft-track').style.animationDuration).toBe('')

    act(() => fire(false))
    expect(container.querySelectorAll('.ft-group').length).toBe(2)
    expect(container.querySelector('.ft-track').style.animationDuration).toBe('40s')
  })

  it('removes its change listener on unmount', async () => {
    const { mq, listeners } = liveMediaQuery(false)
    window.matchMedia = vi.fn().mockReturnValue(mq)
    const { unmount } = await renderTicker(votes)
    expect(listeners.size).toBe(1)
    unmount()
    expect(listeners.size).toBe(0)
    expect(mq.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('rolls (two copies) when matchMedia is unavailable', async () => {
    window.matchMedia = undefined
    const { container } = await renderTicker(votes)
    expect(container.querySelectorAll('.ft-group').length).toBe(2)
    expect(container.querySelector('.ft-track').className).not.toMatch(/ft-static/)
  })

  it('honours the initial setting when the query list has no addEventListener', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    const { container } = await renderTicker(votes)
    expect(container.querySelectorAll('.ft-group').length).toBe(1)
    expect(container.querySelector('.ft-track').className).toMatch(/ft-static/)
  })
})

describe('Landing hero floor ticker — data edges', () => {
  it('shows the unavailable line, not skeletons, when the feed rejects', async () => {
    services.getRecentFloorVotes.mockRejectedValue(new Error('offline'))
    const { container } = renderLanding()
    await waitFor(() => expect(ticker(container).querySelector('.mk-unavailable')).not.toBeNull())
    expect(ticker(container).querySelector('.mk-unavailable').textContent).toBe('No recorded vote available right now.')
    expect(ticker(container).querySelector('.ft-skel')).toBeNull()
    expect(ticker(container).querySelector('.ft-item')).toBeNull()
  })

  it('shows the unavailable line when no vote has a roll-call page', async () => {
    services.getRecentFloorVotes.mockResolvedValue({
      votes: [vote({ id: 'bad-1', description: 'A' }), vote({ id: 'bad-2', description: 'B' })],
      recordedThrough: null,
    })
    const { container } = renderLanding()
    await waitFor(() => expect(ticker(container).querySelector('.mk-unavailable')).not.toBeNull())
    expect(ticker(container).querySelector('.ft-item')).toBeNull()
  })

  it('skips rows with nothing to show (no description, question or bill)', async () => {
    const empty = vote({ id: 'senate-119-2-501', number: 501, question: null, description: null, bill: null })
    const { container } = await renderTicker([empty, ...votes])
    const rolls = [...mainGroup(container).querySelectorAll('.ft-roll')].map((r) => r.textContent)
    expect(rolls).toEqual(['Senate · Roll 500', 'House · Roll 281', 'Senate · Roll 499'])
  })

  it('labels an item with only the chamber or only the roll when the other is missing', async () => {
    const { container } = await renderTicker([
      vote({ id: 'senate-119-2-510', number: null, description: 'No number' }),
      vote({ id: 'senate-119-2-509', chamber: null, number: 509, description: 'No chamber' }),
      ...votes,
    ])
    const rolls = [...mainGroup(container).querySelectorAll('.ft-roll')].map((r) => r.textContent)
    expect(rolls.slice(0, 2)).toEqual(['Senate', 'Roll 509'])
  })

  it('switches from the 40s floor to 7s per item just past six items', async () => {
    const make = (n) => Array.from({ length: n }, (_, i) => vote({ id: `senate-119-2-${700 - i}`, number: 700 - i, description: `V${i}` }))
    let { container } = await renderTicker(make(5))
    expect(container.querySelector('.ft-track').style.animationDuration).toBe('40s')
    cleanup()
    ;({ container } = await renderTicker(make(6)))
    expect(container.querySelector('.ft-track').style.animationDuration).toBe('42s')
  })
})

describe('Landing hero floor ticker — CSS-only behaviour', () => {
  const css = readFileSync(resolve(__dirname, '../../src/styles/Landing.css'), 'utf8')

  it('pauses on hover and focus, and is static with the copy hidden under reduced motion', () => {
    expect(css).toMatch(/\.ft-viewport:hover \.ft-track,\s*\.landing \.ft-viewport:focus-within \.ft-track \{ animation-play-state: paused; \}/)
    expect(css).toMatch(/\.ft-track\.ft-static \{ animation: none; \}/)
    const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(rm).toMatch(/\.ft-track \{ animation: none; \}/)
    expect(rm).toMatch(/\.ft-group\[aria-hidden="true"\] \{ display: none; \}/)
    expect(css).toMatch(/\.floor-ticker\.is-paused \.ft-track \{ animation-play-state: paused; \}/)
    expect(css).toMatch(/\.floor-ticker\.is-focused \.ft-track \{ animation: none; transform: none; \}/)
    expect(css).toMatch(/\.floor-ticker\.is-focused \.ft-viewport \{ overflow-x: auto; \}/)
    // the track shifts by one copy of the list, set per render as --ft-shift
    expect(css).toMatch(/@keyframes ft-roll \{\s*from \{ transform: translateX\(0\); \}\s*to \{ transform: translateX\(var\(--ft-shift, -50%\)\); \}/)
  })
})
