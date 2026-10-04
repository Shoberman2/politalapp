import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { later } = vi.hoisted(() => ({ later: { getMemberVotesOnBillAfter: vi.fn() } }))
vi.mock('../../src/services/laterVotes', () => later)

import { YouWroteNotes, YourMessages } from '../../src/components/YouWrote'
import { SENT_KEY, recordSend } from '../../src/utils/sentMessages'
import { POSITION_RE } from '../fixtures/positionLanguage.js'

const at = new Date(2026, 9, 3, 12).toISOString() // Oct 3, local
const billSend = { ref: 'bill:119-hr-1', kind: 'bill', member: 'P000197', memberName: 'Nancy Pelosi', billId: '119-hr-1', at }
const voteSend = { ref: 'vote:119-house-2-295', kind: 'vote', member: 'A000055', memberName: 'Robert Aderholt', billId: '119-hr-4795', at }
const memberSend = { ref: 'member:P000145', kind: 'member', member: 'P000145', memberName: 'Alex Padilla', at }

const renderIn = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

beforeEach(() => {
  localStorage.clear()
  later.getMemberVotesOnBillAfter.mockReset()
})
afterEach(() => cleanup())

describe('YouWroteNotes', { timeout: 20000 }, () => {
  it('renders nothing when nothing was saved for this bill', () => {
    recordSend(billSend)
    const { container } = renderIn(<YouWroteNotes billId="119-hr-2" />)
    expect(container.innerHTML).toBe('')
    expect(later.getMemberVotesOnBillAfter).not.toHaveBeenCalled()
  })

  it('shows a skeleton, then the later vote linked to its roll call', async () => {
    recordSend(billSend)
    let resolve
    later.getMemberVotesOnBillAfter.mockReturnValue(new Promise((r) => { resolve = r }))
    const { container } = renderIn(<YouWroteNotes billId="119-hr-1" />)

    expect(screen.getByText('You wrote to Nancy Pelosi about H.R. 1 on Oct 3.')).toBeTruthy()
    expect(container.querySelector('.yw-skeleton')).not.toBeNull()
    expect(screen.queryByText(/No recorded vote/)).toBeNull()
    expect(later.getMemberVotesOnBillAfter).toHaveBeenCalledWith({ bioguideId: 'P000197', billId: '119-hr-1', afterDay: '2026-10-03' })

    await act(async () => {
      resolve([{ position: 'Yea', votedAt: '2026-10-08', rollCallId: 'house-119-2-301', rollNumber: 301, chamber: 'House', href: '/vote/119/house/2/301', question: 'On Passage' }])
    })
    expect(container.querySelector('.yw-skeleton')).toBeNull()
    expect(screen.getByText('Since the day you wrote:')).toBeTruthy()
    const link = screen.getByRole('link', { name: /Nancy Pelosi voted Yea on On Passage \(Roll Call 301, Oct 8(, 2026)?\)\./ })
    expect(link.getAttribute('href')).toBe('/vote/119/house/2/301')
    expect(screen.getByText(/Saved on this device only\./)).toBeTruthy()
    expect(container.textContent).not.toMatch(POSITION_RE)
  })

  it('says so when there is no later vote', async () => {
    recordSend(billSend)
    later.getMemberVotesOnBillAfter.mockResolvedValue([])
    const { container } = renderIn(<YouWroteNotes billId="119-hr-1" />)
    expect(await screen.findByText('No recorded vote by Nancy Pelosi on this bill on or after the day you wrote.')).toBeTruthy()
    expect(container.textContent).not.toMatch(POSITION_RE)
  })

  it('says the check failed instead of guessing', async () => {
    recordSend(billSend)
    later.getMemberVotesOnBillAfter.mockResolvedValue(null)
    renderIn(<YouWroteNotes billId="119-hr-1" />)
    expect(await screen.findByText(/couldn’t check the record/)).toBeTruthy()
    expect(screen.queryByText(/No recorded vote/)).toBeNull()
  })

  it('on a member page lists that member’s sends and forgets one', async () => {
    recordSend(billSend)
    recordSend({ ...billSend, ref: 'member:P000197', kind: 'member', billId: undefined })
    recordSend(voteSend)
    later.getMemberVotesOnBillAfter.mockResolvedValue([])
    renderIn(<YouWroteNotes member="p000197" />)

    const items = await screen.findAllByTestId('yw-item')
    expect(items).toHaveLength(2)
    expect(screen.queryByText(/Robert Aderholt/)).toBeNull()
    expect(screen.getByText('Not about a specific bill, so there’s no vote to follow.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'H.R. 1' }).getAttribute('href')).toBe('/bill/119/hr/1')

    const memberItem = items.find((li) => /no vote to follow/.test(li.textContent))
    fireEvent.click(within(memberItem).getByRole('button', { name: /Forget this/ }))
    await waitFor(() => expect(screen.getAllByTestId('yw-item')).toHaveLength(1))
    expect(JSON.parse(localStorage.getItem(SENT_KEY)).map((s) => s.ref).sort()).toEqual(['bill:119-hr-1', 'vote:119-house-2-295'])
  })
})

describe('YourMessages', { timeout: 20000 }, () => {
  it('explains itself when empty, and says where the data lives', () => {
    renderIn(<YourMessages />)
    expect(screen.getByRole('heading', { name: 'Your messages' })).toBeTruthy()
    expect(screen.getByText(/mark it sent/)).toBeTruthy()
    expect(screen.getByText(/Saved on this device only\./)).toBeTruthy()
  })

  it('lists every send with its follow-up, including a roll-call send followed on its bill', async () => {
    recordSend(billSend)
    recordSend(voteSend)
    recordSend(memberSend)
    later.getMemberVotesOnBillAfter.mockImplementation(async ({ bioguideId }) => (bioguideId === 'A000055'
      ? [{ position: 'Not Voting', votedAt: '2026-10-09', rollCallId: 'house-119-2-305', rollNumber: 305, chamber: 'House', href: '/vote/119/house/2/305', question: 'On Motion to Recommit' }]
      : []))
    const { container } = renderIn(<YourMessages />)

    expect(await screen.findByText(/Robert Aderholt did not vote on On Motion to Recommit \(Roll Call 305/)).toBeTruthy()
    expect(await screen.findByText('No recorded vote by Nancy Pelosi on this bill on or after the day you wrote.')).toBeTruthy()
    expect(screen.getByText(/You wrote to Alex Padilla on Oct 3\./)).toBeTruthy()
    expect(screen.getAllByTestId('yw-item')).toHaveLength(3)
    expect(later.getMemberVotesOnBillAfter).toHaveBeenCalledTimes(2)
    expect(container.textContent).not.toMatch(POSITION_RE)
  })

  it('shows only the 20 most recent sends, says so, and queries only those', async () => {
    for (let i = 0; i < 25; i++) {
      recordSend({ ...billSend, ref: `bill:119-hr-${i + 1}`, billId: `119-hr-${i + 1}`, at: new Date(2026, 8, 1 + i, 12).toISOString() })
    }
    later.getMemberVotesOnBillAfter.mockResolvedValue([])
    renderIn(<YourMessages />)
    expect(await screen.findByTestId('yw-truncated')).toHaveTextContent('Showing your 20 most recent messages')
    expect(screen.getAllByTestId('yw-item')).toHaveLength(20)
    // Newest first: H.R. 25 (Sep 25) is shown, H.R. 1-5 are not.
    expect(screen.getByRole('link', { name: 'H.R. 25' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'H.R. 5' })).toBeNull()
    await waitFor(() => expect(later.getMemberVotesOnBillAfter).toHaveBeenCalledTimes(20))
  })

  it('does not show the truncation note at 20 or fewer', () => {
    recordSend(billSend)
    later.getMemberVotesOnBillAfter.mockResolvedValue([])
    renderIn(<YourMessages />)
    expect(screen.queryByTestId('yw-truncated')).toBeNull()
  })
})
