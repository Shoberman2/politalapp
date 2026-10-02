import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const { analytics, lookups } = vi.hoisted(() => ({
  analytics: { track: vi.fn() },
  lookups: { findMembersForAddress: vi.fn(), getMemberContact: vi.fn() },
}))
vi.mock('@vercel/analytics', () => ({ track: analytics.track }))
vi.mock('../../src/services/myMembers', () => lookups)

import TellYourRep from '../../src/components/TellYourRep'

const voteContext = {
  kind: 'vote',
  ref: 'vote:119-house-2-295',
  label: 'House roll call 295 (119th Congress, session 2)',
  title: 'On Passage on H.R. 4795: Water Resources Development Act of 2026',
  sourceUrl: 'https://clerk.house.gov/Votes/2026295',
  href: '/vote/119/house/2/295',
  chamber: 'house',
  date: '2026-09-03',
  result: 'Passed',
  memberVotes: { P000197: 'Nay', A000055: 'Yea' },
}

const pelosi = { bioguideId: 'P000197', name: 'Pelosi, Nancy', chamber: 'house', state: 'CA', district: '11' }
const padilla = { bioguideId: 'P000145', name: 'Padilla, Alex', chamber: 'senate', state: 'CA' }
const schiff = { bioguideId: 'S001150', name: 'Schiff, Adam', chamber: 'senate', state: 'CA' }

const ADVOCACY_RE = /\b(support|oppose|urge|demand|thank|disappoint\w*|should|must|vote (yes|no)|agree|disagree)\b/i
const ADDRESS = { street: '1 Main St', city: 'San Francisco', state: 'CA', zip: '94110' }

let fetchSpy
let xhrOpen

beforeEach(() => {
  analytics.track.mockReset()
  lookups.findMembersForAddress.mockReset()
  lookups.getMemberContact.mockReset()
  lookups.getMemberContact.mockResolvedValue({ officialWebsiteUrl: 'https://pelosi.house.gov', phone: '(202) 225-4965', name: 'Nancy Pelosi' })
  localStorage.clear()
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('no network in tests')))
  xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open')
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const textarea = () => screen.getByRole('textbox', { name: /Your message/ })

function expectNoSubmissionAnywhere(container) {
  // No outbound request was made by the component, and nothing on the page can post a form.
  expect(fetchSpy).not.toHaveBeenCalled()
  expect(xhrOpen).not.toHaveBeenCalled()
  for (const form of container.querySelectorAll('form')) {
    expect(form.getAttribute('action')).toBeNull()
    expect(form.getAttribute('method')).toBeNull()
  }
}

function expectAnonymousEvents(typedText = '') {
  for (const [name, props] of analytics.track.mock.calls) {
    expect(['draft_opened', 'contact_page_opened']).toContain(name)
    expect(Object.keys(props).sort()).toEqual(['member', 'ref'])
    const blob = JSON.stringify(props)
    expect(blob).not.toMatch(/Main St|94110|San Francisco|Dear|record/i)
    if (typedText) expect(blob).not.toContain(typedText)
  }
}

// jsdom renders of the full panel are slow on loaded machines; the default
// 5 s budget has timed out locally with nothing wrong.
describe('TellYourRep', { timeout: 20000 }, () => {
  it('opens a factual outline for a page-provided member, copies it, and hands off to the official contact page', async () => {
    const { container } = render(
      <TellYourRep
        context={{ ...voteContext, memberVotes: undefined, memberVote: 'Nay' }}
        members={[{ ...pelosi, name: 'Nancy Pelosi', lastName: 'Pelosi', officialWebsiteUrl: 'https://pelosi.house.gov/', phone: '(202) 225-4965' }]}
      />
    )

    expect(container.querySelector('#tell-your-rep')).not.toBeNull()
    const toggle = screen.getByRole('button', { name: 'Write to your representative about this' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(analytics.track).not.toHaveBeenCalled()

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const heading = screen.getByRole('heading', { level: 2 })
    expect(document.activeElement).toBe(heading)

    // Required disclosures.
    expect(screen.getByText("Plainfloor doesn't send this for you. Copy your message and send it through your representative's official contact page.")).toBeTruthy()
    expect(screen.getByText(/Not affiliated with Congress\./)).toBeTruthy()

    // Factual scaffold, no position.
    const draft = textarea().value
    expect(draft).toContain('Dear Representative Pelosi,')
    expect(draft).toContain('Your recorded vote: Nay.')
    expect(draft).toContain('Result: Passed.')
    expect(draft).toContain('Official record: https://clerk.house.gov/Votes/2026295')
    expect(draft).toContain('[Write your message here, in your own words.]')
    expect(draft).not.toMatch(ADVOCACY_RE)
    expect(draft).not.toContain('constituent') // page-provided member, not resolved from the person's location

    // The person writes; copy sends exactly their text to the clipboard.
    const mine = 'This vote matters to my family.'
    fireEvent.change(textarea(), { target: { value: draft.replace('[Write your message here, in your own words.]', mine) } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy message' })) })
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1)
    expect(navigator.clipboard.writeText.mock.calls[0][0]).toContain(mine)
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()

    // Hand-off: a plain link to the office's own page, opened in a new tab.
    const link = screen.getByRole('link', { name: /Open Nancy Pelosi’s official contact page/ })
    expect(link.getAttribute('href')).toBe('https://pelosi.house.gov/contact')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    fireEvent.click(link)

    expect(analytics.track.mock.calls).toEqual([
      ['draft_opened', { ref: 'vote:119-house-2-295', member: 'P000197' }],
      ['contact_page_opened', { ref: 'vote:119-house-2-295', member: 'P000197' }],
    ])
    expectAnonymousEvents(mine)
    expect(lookups.getMemberContact).not.toHaveBeenCalled()
    expect(lookups.findMembersForAddress).not.toHaveBeenCalled()
    expect(localStorage.getItem('userData')).toBeNull() // nothing stored, least of all the message
    expectNoSubmissionAnywhere(container)

    // Reset restores the outline; closing returns focus to the button.
    fireEvent.click(screen.getByRole('button', { name: 'Reset to the factual outline' }))
    expect(textarea().value).toBe(draft)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(toggle)
  })

  it('selects the text and explains when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    document.execCommand = vi.fn(() => false)
    render(<TellYourRep context={voteContext} members={[{ ...pelosi, officialWebsiteUrl: 'https://pelosi.house.gov' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /Write to your representative/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy message' })) })
    expect(screen.getByText(/Couldn’t copy automatically/)).toBeTruthy()
    expect(document.activeElement).toBe(textarea())
    expect(textarea().selectionStart).toBe(0)
    expect(textarea().selectionEnd).toBe(textarea().value.length)
    delete document.execCommand
  })

  it('resolves the person’s own members from the saved address and shows how each voted', async () => {
    localStorage.setItem('userData', JSON.stringify({ address: ADDRESS }))
    lookups.findMembersForAddress.mockResolvedValue({ state: 'CA', district: '11', members: [padilla, pelosi, schiff] })
    const { container } = render(<TellYourRep context={voteContext} />)

    fireEvent.click(screen.getByRole('button', { name: /Write to your representative/ }))
    await screen.findByRole('radio', { name: /Nancy Pelosi/ })
    expect(lookups.findMembersForAddress).toHaveBeenCalledWith(ADDRESS)

    // The House member is listed first for a House vote and is selected.
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.value)).toEqual(['P000197', 'P000145', 'S001150'])
    expect(radios[0].checked).toBe(true)
    const group = screen.getByRole('group', { name: 'Choose a member of Congress' })
    expect(within(group).getByText('Voted Nay')).toBeTruthy()
    expect(within(group).getAllByText('Senate: not part of this vote')).toHaveLength(2)

    await waitFor(() => expect(textarea().value).toContain('I am a constituent in CA-11.'))
    await waitFor(() => expect(lookups.getMemberContact).toHaveBeenCalledWith('P000197'))
    expect((await screen.findByRole('link', { name: /official contact page/ })).getAttribute('href')).toBe('https://pelosi.house.gov/contact')

    // Switching member rebuilds an untouched outline.
    fireEvent.click(screen.getByRole('radio', { name: /Alex Padilla/ }))
    expect(textarea().value).toContain('Dear Senator Padilla,')
    expect(textarea().value).toContain('This was a House vote, so you did not vote on it.')

    // Once edited, switching member keeps the person's words.
    fireEvent.change(textarea(), { target: { value: 'My own words only.' } })
    fireEvent.click(screen.getByRole('radio', { name: /Adam Schiff/ }))
    expect(textarea().value).toBe('My own words only.')

    expect(analytics.track.mock.calls.map((c) => c[0])).toEqual(['draft_opened', 'draft_opened', 'draft_opened'])
    expect(analytics.track.mock.calls.map((c) => c[1].member)).toEqual(['P000197', 'P000145', 'S001150'])
    expectAnonymousEvents('My own words only.')
    expectNoSubmissionAnywhere(container)
  })

  it('asks for a ZIP when nothing is saved, then remembers the location on this device', async () => {
    lookups.findMembersForAddress.mockResolvedValue({ state: 'AK', district: '0', members: [{ bioguideId: 'B001323', name: 'Begich, Nick', chamber: 'house', state: 'AK', district: '0' }] })
    const { container } = render(<TellYourRep context={{ kind: 'bill', ref: 'bill:119-hr-1', label: 'H.R. 1 (119th Congress)', title: 'One Big Beautiful Bill Act', href: '/bill/119/hr/1' }} />)

    fireEvent.click(screen.getByRole('button', { name: /Write to your representative/ }))
    const zip = await screen.findByRole('textbox', { name: 'ZIP code' })
    await waitFor(() => expect(document.activeElement).toBe(zip))

    fireEvent.change(zip, { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find my members' }))
    expect(screen.getByRole('alert').textContent).toBe('Enter a 5-digit ZIP code.')
    expect(lookups.findMembersForAddress).not.toHaveBeenCalled()

    fireEvent.change(zip, { target: { value: '99501' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find my members' }))
    await screen.findByRole('radio', { name: /Nick Begich/ })
    expect(lookups.findMembersForAddress).toHaveBeenCalledWith({ zip: '99501', street: '', city: '', state: '' })
    expect(JSON.parse(localStorage.getItem('userData')).address).toEqual({ street: '', city: '', state: 'AK', zip: '99501' })
    expect(textarea().value).toContain('I am a constituent in AK-AL.')
    expect(analytics.track).toHaveBeenCalledWith('draft_opened', { ref: 'bill:119-hr-1', member: 'B001323' })
    expectAnonymousEvents()
    expectNoSubmissionAnywhere(container)
  })

  it('falls back to the website, then the phone, when no contact page can be derived', () => {
    const { unmount } = render(<TellYourRep context={{ kind: 'member', ref: 'member:X1', label: 'Jane Doe' }} members={[{ bioguideId: 'X1', name: 'Jane Doe', chamber: 'Senate', state: 'ZZ', officialWebsiteUrl: 'https://janedoe.example' }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Write to Senator Doe' }))
    expect(screen.getByRole('link', { name: /Open Jane Doe’s official website/ }).getAttribute('href')).toBe('https://janedoe.example')
    expect(screen.getByText(/Offices usually reply only to people who live in their state or district/)).toBeTruthy()
    unmount()

    render(<TellYourRep context={{ kind: 'member', ref: 'member:X2', label: 'John Roe' }} members={[{ bioguideId: 'X2', name: 'John Roe', chamber: 'house', state: 'ZZ', district: '1', phone: '(202) 225-0000' }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Write to Representative Roe' }))
    expect(screen.getByRole('link', { name: /Call John Roe’s office/ }).getAttribute('href')).toBe('tel:2022250000')
  })
})
