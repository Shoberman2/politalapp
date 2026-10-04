import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { shapeMemberRecord } from '../../shared/memberRecord.js'

const { analytics, services, clipboard } = vi.hoisted(() => ({
  analytics: { track: vi.fn() },
  services: { getMemberRecord: vi.fn(), getAllCurrentMembers: vi.fn() },
  clipboard: { copy: vi.fn() },
}))
vi.mock('@vercel/analytics', () => ({ track: analytics.track }))
vi.mock('../../src/services/memberRecord', async (importOriginal) => ({ ...(await importOriginal()), getMemberRecord: services.getMemberRecord }))
vi.mock('../../src/utils/clipboard', () => ({ copyTextToClipboard: clipboard.copy }))
vi.mock('../../src/services/congress', () => ({ getAllCurrentMembers: services.getAllCurrentMembers }))
vi.mock('../../src/services/userService', () => ({ isFavorite: () => false, toggleFavorite: () => false }))

import MemberRecord from '../../src/components/MemberRecord'
import PoliticianCard from '../../src/components/PoliticianCard'
import AllPoliticians from '../../src/components/AllPoliticians'
import { recordShareLinks, canNativeShare } from '../../src/utils/recordShare'

const URL_ = 'https://www.ballotwatch.io/politician/P000197/record'
const TITLE = "Nancy Pelosi's record in 60 seconds"

const record = shapeMemberRecord({
  member: { id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', state: 'CA', district: '11', party: 'Democratic' },
  terms: [{ congress: 119, district: '11', term_start: '2025-01-03', term_end: null }],
  stats: { congress: 119, total_votes: 676, yea_count: 256, nay_count: 355, present_count: 4, not_voting_count: 61 },
  votes: [],
  voteCount: 676,
  updatedAt: '2026-10-02T12:12:53Z',
})

function Where() {
  const loc = useLocation()
  return <div data-testid="where">{loc.pathname}</div>
}

function renderAt(path, element, routePath = '*') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={<>{element}<Where /></>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  )
}

// Every analytics payload must be exactly { member: <bioguide id>, channel }:
// nothing about the reader, no share text, no URL.
function expectCleanPayloads() {
  for (const [name, payload] of analytics.track.mock.calls) {
    expect(name).toBe('record_shared')
    expect(Object.keys(payload).sort()).toEqual(['channel', 'member'])
    expect(payload.member).toMatch(/^[A-Z]\d{6}$/)
    expect(['native', 'copy', 'x', 'bluesky', 'facebook', 'email']).toContain(payload.channel)
  }
}

beforeEach(() => {
  analytics.track.mockReset()
  services.getMemberRecord.mockReset()
  services.getAllCurrentMembers.mockReset()
  clipboard.copy.mockReset()
})
afterEach(() => { cleanup(); delete navigator.share })

describe('recordShareLinks', () => {
  it('builds plain intent URLs with the canonical link and the card title', () => {
    const links = Object.fromEntries(recordShareLinks({ url: URL_, title: TITLE, text: 'One sentence & more.' }).map((l) => [l.channel, l.href]))
    expect(links.x).toBe(`https://x.com/intent/tweet?text=${encodeURIComponent(TITLE)}&url=${encodeURIComponent(URL_)}`)
    expect(new URL(links.bluesky).searchParams.get('text')).toBe(`${TITLE} ${URL_}`)
    expect(new URL(links.facebook).searchParams.get('u')).toBe(URL_)
    expect(links.email.startsWith('mailto:?subject=')).toBe(true)
    expect(decodeURIComponent(links.email)).toContain(`One sentence & more.\n\n${URL_}`)
    expect(canNativeShare({})).toBe(false)
    expect(canNativeShare({ share() {} })).toBe(true)
  })
})

describe('MemberRecord sharing', () => {
  const path = '/politician/P000197/record'
  const route = '/politician/:bioguideId/record'

  it('offers X, Bluesky, Facebook and email links and counts each share without PII', async () => {
    services.getMemberRecord.mockResolvedValue(record)
    clipboard.copy.mockResolvedValue(true)
    renderAt(path, <MemberRecord />, route)
    await screen.findByRole('heading', { level: 1, name: 'Nancy Pelosi' })

    // No system share sheet in jsdom: no Share button.
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()

    const nav = screen.getByRole('navigation', { name: 'Share this record' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual(['X', 'Bluesky', 'Facebook', 'Email'])
    expect(links[0].getAttribute('href')).toContain(encodeURIComponent(URL_))
    expect(links[0].getAttribute('target')).toBe('_blank')
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer')
    expect(links[3].getAttribute('target')).toBeNull()
    // No third-party scripts are added for sharing.
    expect(document.querySelectorAll('script[src]').length).toBe(0)

    links.forEach((a) => {
      a.addEventListener('click', (e) => e.preventDefault())
      fireEvent.click(a)
    })
    expect(analytics.track.mock.calls.map((c) => c[1].channel)).toEqual(['x', 'bluesky', 'facebook', 'email'])
    expect(analytics.track).toHaveBeenCalledWith('record_shared', { member: 'P000197', channel: 'x' })

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await screen.findByText('Link copied')
    expect(analytics.track).toHaveBeenLastCalledWith('record_shared', { member: 'P000197', channel: 'copy' })
    expectCleanPayloads()
  })

  it('uses the native share sheet when available, with the card title and canonical URL', async () => {
    navigator.share = vi.fn().mockResolvedValue(undefined)
    services.getMemberRecord.mockResolvedValue(record)
    renderAt(path, <MemberRecord />, route)
    await screen.findByRole('heading', { level: 1, name: 'Nancy Pelosi' })

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await waitFor(() => expect(analytics.track).toHaveBeenCalledWith('record_shared', { member: 'P000197', channel: 'native' }))
    expect(navigator.share).toHaveBeenCalledWith({ title: TITLE, url: URL_ })

    // Dismissing the sheet is not a share.
    analytics.track.mockReset()
    navigator.share.mockRejectedValue(Object.assign(new Error('cancel'), { name: 'AbortError' }))
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await waitFor(() => expect(navigator.share).toHaveBeenCalledTimes(2))
    await Promise.resolve()
    expect(analytics.track).not.toHaveBeenCalled()
    expect(clipboard.copy).not.toHaveBeenCalled()
    expectCleanPayloads()
  })
})

describe('record links on member cards', () => {
  it('PoliticianCard links to the record without also opening the profile', () => {
    renderAt('/my-representative', <PoliticianCard politician={{ bioguideId: 'P000197', name: 'Nancy Pelosi', chamber: 'house', state: 'CA', district: '11', party: 'Democratic' }} />)
    const link = screen.getByRole('link', { name: 'Record in 60 seconds: Nancy Pelosi' })
    expect(link.getAttribute('href')).toBe('/politician/P000197/record')
    expect(link.textContent).toBe('Record in 60 seconds →')
    fireEvent.click(link)
    expect(screen.getByTestId('where').textContent).toBe('/politician/P000197/record')
  })

  it('PoliticianCard shows no record link without a valid bioguide id', () => {
    renderAt('/', <PoliticianCard politician={{ name: 'Someone', chamber: 'house', state: 'CA' }} />)
    expect(screen.queryByRole('link', { name: /Record in 60 seconds/ })).toBeNull()
  })

  it('members index cards open the profile and carry a separate record link', async () => {
    services.getAllCurrentMembers.mockImplementation(async (onBatch) => onBatch([
      { bioguideId: 'P000197', name: 'Pelosi, Nancy', chamber: 'house', state: 'CA', district: 11, party: 'Democratic' },
    ], true))
    renderAt('/all', <AllPoliticians />)
    const profile = await screen.findByRole('link', { name: 'Nancy Pelosi' })
    expect(profile.getAttribute('href')).toBe('/politician/P000197')
    const recordLink = screen.getByRole('link', { name: 'Record in 60 seconds: Nancy Pelosi' })
    expect(recordLink.getAttribute('href')).toBe('/politician/P000197/record')
    expect(recordLink.closest('article.member-card')).toBe(profile.closest('article.member-card'))
  })
})
