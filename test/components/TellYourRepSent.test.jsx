import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const { analytics, lookups } = vi.hoisted(() => ({
  analytics: { track: vi.fn() },
  lookups: { findMembersForAddress: vi.fn(), getMemberContact: vi.fn() },
}))
vi.mock('@vercel/analytics', () => ({ track: analytics.track }))
vi.mock('../../src/services/myMembers', () => lookups)

import TellYourRep from '../../src/components/TellYourRep'
import { SENT_KEY } from '../../src/utils/sentMessages'
import { POSITION_RE } from '../fixtures/positionLanguage.js'

const billContext = {
  kind: 'bill',
  ref: 'bill:119-hr-1',
  billId: '119-hr-1',
  label: 'H.R. 1 (119th Congress)',
  title: 'One Big Beautiful Bill Act',
  href: '/bill/119/hr/1',
}
const pelosi = { bioguideId: 'P000197', name: 'Nancy Pelosi', lastName: 'Pelosi', chamber: 'house', state: 'CA', district: '11', officialWebsiteUrl: 'https://pelosi.house.gov/' }

beforeEach(() => {
  analytics.track.mockReset()
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function openAndHandOff() {
  fireEvent.click(screen.getByRole('button', { name: 'Write to your representative about this' }))
  fireEvent.click(screen.getByRole('link', { name: /Open Nancy Pelosi’s official contact page/ }))
}

describe('TellYourRep "I sent it"', { timeout: 20000 }, () => {
  it('offers the confirmation only after the contact page is opened', () => {
    render(<TellYourRep context={billContext} members={[pelosi]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Write to your representative about this' }))
    expect(screen.queryByRole('button', { name: /I sent my message/ })).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: /Open Nancy Pelosi’s official contact page/ }))
    expect(screen.getByRole('button', { name: 'I sent my message to Nancy Pelosi' })).toBeTruthy()
    expect(localStorage.getItem(SENT_KEY)).toBeNull()
  })

  it('records the send on this device and counts an event with only ref and member', () => {
    const { container } = render(<TellYourRep context={billContext} members={[pelosi]} />)
    openAndHandOff()
    const mine = 'Please read section 4.'
    const box = screen.getByRole('textbox', { name: /Your message/ })
    fireEvent.change(box, { target: { value: `${box.value}\n${mine}` } })
    fireEvent.click(screen.getByRole('button', { name: 'I sent my message to Nancy Pelosi' }))

    const confirmed = analytics.track.mock.calls.filter(([name]) => name === 'message_sent_confirmed')
    expect(confirmed).toEqual([['message_sent_confirmed', { ref: 'bill:119-hr-1', member: 'P000197' }]])
    expect(Object.keys(confirmed[0][1]).sort()).toEqual(['member', 'ref'])

    const stored = JSON.parse(localStorage.getItem(SENT_KEY))
    expect(stored).toHaveLength(1)
    expect(Object.keys(stored[0]).sort()).toEqual(['at', 'billId', 'kind', 'member', 'memberName', 'ref'])
    expect(stored[0]).toMatchObject({ ref: 'bill:119-hr-1', kind: 'bill', member: 'P000197', memberName: 'Nancy Pelosi', billId: '119-hr-1' })
    expect(localStorage.getItem(SENT_KEY)).not.toContain(mine) // never the message text

    expect(container.querySelector('.tyr-sent-done').textContent).toBe('Marked as sent to Nancy Pelosi. Saved on this device only.')
    expect(screen.queryByRole('button', { name: /I sent my message/ })).toBeNull()
    expect(container.querySelector('.tyr-sent').textContent).not.toMatch(POSITION_RE)

    // "Forget this" removes it.
    fireEvent.click(screen.getByRole('button', { name: 'Forget this' }))
    expect(JSON.parse(localStorage.getItem(SENT_KEY))).toEqual([])
    expect(screen.getByRole('button', { name: 'I sent my message to Nancy Pelosi' })).toBeTruthy()
  })

  it('shows an earlier send as already saved', () => {
    localStorage.setItem(SENT_KEY, JSON.stringify([{ ref: 'bill:119-hr-1', kind: 'bill', member: 'P000197', memberName: 'Nancy Pelosi', billId: '119-hr-1', at: '2026-10-01T12:00:00.000Z' }]))
    render(<TellYourRep context={billContext} members={[pelosi]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Write to your representative about this' }))
    expect(document.querySelector('.tyr-sent-done').textContent).toContain('Marked as sent to Nancy Pelosi')
  })

  it('still works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    render(<TellYourRep context={billContext} members={[pelosi]} />)
    openAndHandOff()
    fireEvent.click(screen.getByRole('button', { name: 'I sent my message to Nancy Pelosi' }))
    expect(analytics.track.mock.calls.some(([name]) => name === 'message_sent_confirmed')).toBe(true)
    expect(screen.getByRole('button', { name: 'I sent my message to Nancy Pelosi' })).toBeTruthy()
  })
})
