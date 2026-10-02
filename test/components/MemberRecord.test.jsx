import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { shapeMemberRecord } from '../../shared/memberRecord.js'

const { services, clipboard } = vi.hoisted(() => ({ services: { getMemberRecord: vi.fn() }, clipboard: { copy: vi.fn() } }))
// Keep the real recordFromPrerender: the page hydrates from the server-rendered record through it.
vi.mock('../../src/services/memberRecord', async (importOriginal) => ({ ...(await importOriginal()), getMemberRecord: services.getMemberRecord }))
vi.mock('../../src/utils/clipboard', () => ({ copyTextToClipboard: clipboard.copy }))

import MemberRecord from '../../src/components/MemberRecord'

const record = shapeMemberRecord({
  member: { id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', state: 'CA', district: '11', party: 'Democratic' },
  terms: [{ congress: 119, district: '11', term_start: '2025-01-03', term_end: null }],
  stats: { congress: 119, total_votes: 676, yea_count: 256, nay_count: 355, present_count: 4, not_voting_count: 61 },
  votes: [{ roll_call_id: 'house-119-2-295', position: 'Nay', voted_at: '2026-09-03', source_url: 'https://clerk.house.gov/Votes/2026295', bill_id: '119-hr-4795', bills: { id: '119-hr-4795', title: 'Water Resources Development Act of 2026' } }],
  voteCount: 676,
  rollCalls: [{ id: 'house-119-2-295', question: 'On Passage' }],
  rollCallStats: [{ roll_call_id: 'house-119-2-295', dem_yea: 200, dem_nay: 10, rep_yea: 180, rep_nay: 30 }],
  updatedAt: '2026-10-02T12:12:53Z',
})

function renderAt(path) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/politician/:bioguideId/record" element={<MemberRecord />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  )
}

beforeEach(() => { services.getMemberRecord.mockReset(); clipboard.copy.mockReset() })
afterEach(() => { cleanup(); document.getElementById('__bw_page')?.remove() })

describe('MemberRecord', () => {
  it('shows a skeleton, then the card with counts, linked votes, sources, and a copy-link control', async () => {
    services.getMemberRecord.mockResolvedValue(record)
    clipboard.copy.mockResolvedValue(true)
    const { container } = renderAt('/politician/p000197/record')

    expect(container.querySelector('.rec[aria-busy="true"]')).toBeTruthy()
    expect(container.querySelector('.rec-table')).toBeNull()   // no placeholder rows while loading
    await screen.findByRole('heading', { level: 1, name: 'Nancy Pelosi' })
    expect(services.getMemberRecord).toHaveBeenCalledWith('P000197')

    expect(container.querySelector('.rec-party').textContent).toBe('D')
    expect(container.querySelector('.rec-facts').textContent).toContain('615')
    expect(screen.getByRole('link', { name: 'On Passage' }).getAttribute('href')).toBe('/vote/119/house/2/295')
    expect(screen.getByRole('link', { name: 'H.R. 4795' }).getAttribute('href')).toBe('/bill/119/hr/4795')
    expect(screen.getByText('Passed').className).toContain('rc-result-passed')
    expect(screen.getByRole('link', { name: 'Full record →' }).getAttribute('href')).toBe('/politician/P000197')
    expect(screen.getByRole('link', { name: 'Congress.gov' }).getAttribute('href')).toBe('https://www.congress.gov/member/P000197')
    expect(screen.getByText(/Data recorded through October 2, 2026/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await screen.findByText('Link copied')
    expect(clipboard.copy).toHaveBeenCalledWith('https://www.ballotwatch.io/politician/P000197/record')
  })

  it('renders from the prerendered record without fetching, and says so honestly when a member has no votes', async () => {
    const el = document.createElement('script')
    el.type = 'application/json'
    el.id = '__bw_page'
    el.textContent = JSON.stringify({ ...record, voteCount: 0, recentVotes: [], stats: null, thin: true })
    document.body.appendChild(el)
    const { container } = renderAt('/politician/P000197/record')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Nancy Pelosi')
    expect(services.getMemberRecord).not.toHaveBeenCalled()
    expect(screen.getByText(/No recorded votes for Nancy Pelosi in BallotWatch data yet/)).toBeTruthy()
    expect(container.querySelector('.rec-table')).toBeNull()
  })

  it('handles unknown members and load failures', async () => {
    services.getMemberRecord.mockResolvedValue(null)
    renderAt('/politician/Z999999/record')
    await screen.findByRole('heading', { name: 'Member not found' })
    cleanup()

    vi.spyOn(console, 'error').mockImplementation(() => {})
    services.getMemberRecord.mockRejectedValue(new Error('offline'))
    renderAt('/politician/P000197/record')
    await screen.findByRole('heading', { name: 'The record could not be loaded' })
  })
})
