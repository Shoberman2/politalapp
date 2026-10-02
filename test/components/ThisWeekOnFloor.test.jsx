import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { services } = vi.hoisted(() => ({
  services: { getFloorSchedule: vi.fn(), getRecentFloorVotes: vi.fn() },
}))
vi.mock('../../src/lib/supabase', () => ({ supabase: {} }))
vi.mock('../../src/services/floorSchedule', async (importOriginal) => ({
  ...(await importOriginal()), getFloorSchedule: services.getFloorSchedule,
}))
vi.mock('../../src/services/floorVotes', async (importOriginal) => ({
  ...(await importOriginal()), getRecentFloorVotes: services.getRecentFloorVotes,
}))

import ThisWeekOnFloor, { weekLabel } from '../../src/components/ThisWeekOnFloor'

const SOURCE = 'https://docs.house.gov/floor/Default.aspx?date=2026-09-14'

function item(n, overrides = {}) {
  return {
    id: `2026-09-14:${n}`, label: `H.R. ${n}`, title: `Bill number ${n} Act`, category: 'Suspension',
    categoryType: 'Items that may be considered under suspension of the rules', billId: `119-hr-${n}`,
    billHref: `/bill/119/hr/${n}`, tellRepHref: `/bill/119/hr/${n}#tell-your-rep`, week: '2026-09-14', sourceUrl: SOURCE,
    ...overrides,
  }
}

const published = (items) => ({
  chamber: 'House',
  senateNote: 'House schedule; the Senate does not publish one in this format.',
  weeks: [
    { week: '2026-09-14', status: 'published', congress: 119, sourceUrl: SOURCE, updatedAt: null, items },
    { week: '2026-09-21', status: 'not_published', congress: null, sourceUrl: SOURCE.replace('14', '21'), updatedAt: null, items: [] },
  ],
})

const VOTES = {
  recordedThrough: '2026-09-18',
  votes: [
    { id: 'house-119-2-301', chamber: 'House', number: 301, question: 'On Passage', description: null, bill: { display: 'H.R. 4795', href: '/bill/119/hr/4795' }, yea: 380, nay: 40, result: 'Passed' },
    { id: 'senate-119-2-500', chamber: 'Senate', number: 500, question: 'On the Cloture Motion', description: 'A nomination', bill: null, yea: null, nay: null, result: null },
  ],
}

const pending = () => new Promise(() => {})

function renderIt(props) {
  return render(<MemoryRouter><ThisWeekOnFloor {...props} /></MemoryRouter>)
}

describe('ThisWeekOnFloor', () => {
  beforeEach(() => {
    services.getFloorSchedule.mockReset()
    services.getRecentFloorVotes.mockReset()
  })
  afterEach(cleanup)

  it('shows skeleton rows and no data rows while loading', () => {
    services.getFloorSchedule.mockReturnValue(pending())
    services.getRecentFloorVotes.mockReturnValue(pending())
    const { container } = renderIt()
    expect(screen.getByRole('heading', { name: 'Coming up, and just decided.' })).toBeInTheDocument()
    expect(container.querySelectorAll('.twof-row--skeleton').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.twof-row--scheduled, .twof-row--recorded')).toHaveLength(0)
    expect(screen.getByLabelText('Loading the House floor schedule')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByLabelText('Loading recorded votes')).toBeInTheDocument()
  })

  it('shows the honest empty state when no schedule is published, with no invented rows', async () => {
    services.getFloorSchedule.mockResolvedValue({
      ...published([]),
      weeks: [
        { week: '2026-09-28', status: 'not_published', items: [], sourceUrl: 'https://docs.house.gov/floor/Default.aspx?date=2026-09-28' },
        { week: '2026-10-05', status: 'not_published', items: [], sourceUrl: 'x' },
      ],
    })
    services.getRecentFloorVotes.mockResolvedValue(VOTES)
    const { container } = renderIt()
    expect(await screen.findByText(/No floor schedule published for this week/)).toBeInTheDocument()
    expect(screen.getByText('Sep 28')).toBeInTheDocument()
    expect(container.querySelectorAll('.twof-row--scheduled')).toHaveLength(0)
    expect(screen.getByText('House schedule; the Senate does not publish one in this format.')).toBeInTheDocument()
  })

  it('says the schedule could not be loaded when the service fails', async () => {
    services.getFloorSchedule.mockResolvedValue(null)
    services.getRecentFloorVotes.mockResolvedValue(null)
    const { container } = renderIt()
    expect(await screen.findByText(/couldn’t be loaded/)).toBeInTheDocument()
    expect(await screen.findByText('No recorded votes to show right now.')).toBeInTheDocument()
    expect(container.querySelectorAll('.twof-row--skeleton')).toHaveLength(0)
  })

  it('renders scheduled items up to the limit with bill and tell-your-rep links', async () => {
    services.getFloorSchedule.mockResolvedValue(published([1, 2, 3, 4].map((n) => item(n))))
    services.getRecentFloorVotes.mockResolvedValue(VOTES)
    const { container } = renderIt({ limit: 3 })
    await screen.findByText('H.R. 1')
    expect(container.querySelectorAll('.twof-row--scheduled')).toHaveLength(3)
    expect(screen.getByText('H.R. 1').closest('a')).toHaveAttribute('href', '/bill/119/hr/1')
    expect(screen.getAllByText('Tell your rep before the vote')[0].closest('a')).toHaveAttribute('href', '/bill/119/hr/1#tell-your-rep')
    expect(screen.getAllByText('Suspension')).toHaveLength(3)
    expect(screen.getByText('1 more on the official schedule')).toHaveAttribute('href', SOURCE)

    await screen.findByText('380–40')
    expect(screen.getByText('Passed')).toBeInTheDocument()
    expect(screen.getByText('House Roll 301').closest('a')).toHaveAttribute('href', '/vote/119/house/2/301')
    // A vote with no trustworthy tally shows no tally or result.
    expect(container.querySelectorAll('.twof-row--recorded')).toHaveLength(2)
    expect(container.querySelectorAll('.twof-tally')).toHaveLength(1)
  })

  it('omits the Recorded column and its query when showRecorded is false', async () => {
    services.getFloorSchedule.mockResolvedValue(published([item(7)]))
    renderIt({ showRecorded: false })
    await screen.findByText('H.R. 7')
    expect(screen.queryByText('Recorded')).toBeNull()
    expect(services.getRecentFloorVotes).not.toHaveBeenCalled()
  })

  it('shows a non-bill item without a bill or tell-your-rep link', async () => {
    services.getFloorSchedule.mockResolvedValue(published([item(9, { label: 'Motion', billHref: null, tellRepHref: null })]))
    services.getRecentFloorVotes.mockResolvedValue(VOTES)
    renderIt()
    await screen.findByText('Motion')
    expect(screen.getByText('Motion').closest('a')).toBeNull()
    await waitFor(() => expect(screen.queryByText('Tell your rep before the vote')).toBeNull())
  })

  it('formats week labels without a timezone shift', () => {
    expect(weekLabel('2026-09-14')).toBe('Sep 14')
    expect(weekLabel('2026-01-05')).toBe('Jan 5')
  })
})
