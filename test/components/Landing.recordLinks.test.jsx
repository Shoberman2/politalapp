import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'

// The landing ZIP lookup names the members it can honestly name and links each
// to their "record in 60 seconds" card. A ZIP alone names the House member
// only in an at-large state; elsewhere only the senators are shown.

const { services } = vi.hoisted(() => ({
  services: {
    getRecentFloorVotes: vi.fn(),
    getDistrictFromAddress: vi.fn(),
    findMembersForDistrict: vi.fn(),
  },
}))

vi.mock('../../src/services/floorVotes', async (importOriginal) => ({ ...(await importOriginal()), getRecentFloorVotes: services.getRecentFloorVotes }))
vi.mock('../../src/services/floorSchedule', async (importOriginal) => ({ ...(await importOriginal()), getFloorSchedule: vi.fn().mockResolvedValue(null) }))
vi.mock('../../src/services/congress', () => ({
  getRecentBills: vi.fn().mockResolvedValue([]),
  getFeaturedMembers: vi.fn().mockResolvedValue([]),
  getTrendingBills: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../src/services/userService', () => ({ saveUserAddress: vi.fn() }))
vi.mock('../../src/services/district', async (importOriginal) => ({ ...(await importOriginal()), getDistrictFromAddress: services.getDistrictFromAddress }))
vi.mock('../../src/services/myMembers', () => ({ findMembersForDistrict: services.findMembersForDistrict }))

import Landing from '../../src/components/Landing'

const senators = [
  { bioguideId: 'S000033', name: 'Sanders, Bernard', chamber: 'senate' },
  { bioguideId: 'W000800', name: 'Welch, Peter', chamber: 'senate' },
]

const memberList = () => waitFor(() => {
  const el = document.querySelector('.lookup-result .lr-members')
  if (!el) throw new Error('no member list yet')
  return el
})
const noMemberList = () => expect(document.querySelector('.lookup-result .lr-members')).toBeNull()

function lookUp(zip) {
  render(<HelmetProvider><MemoryRouter><Landing /></MemoryRouter></HelmetProvider>)
  const input = document.getElementById('zipInput-hero')
  fireEvent.change(input, { target: { value: zip } })
  fireEvent.submit(input.closest('form'))
}

beforeEach(() => {
  Object.values(services).forEach((m) => m.mockReset())
  services.getRecentFloorVotes.mockResolvedValue({ votes: [], recordedThrough: null })
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
})
afterEach(cleanup)

describe('Landing lookup: record links', () => {
  it('at-large state: names the House member and both senators, each linked to their record card', async () => {
    services.getDistrictFromAddress.mockResolvedValue({ state: 'VT', district: '0' })
    services.findMembersForDistrict.mockResolvedValue([{ bioguideId: 'B001318', name: 'Balint, Becca', chamber: 'house' }, ...senators])
    lookUp('05401')

    const list = await memberList()
    expect(services.findMembersForDistrict).toHaveBeenCalledWith('VT', '0')
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((r) => r.querySelector('.lr-m-name').textContent)).toEqual(['Becca Balint', 'Bernard Sanders', 'Peter Welch'])
    expect(within(list).getByRole('link', { name: 'Record in 60 seconds: Becca Balint' }).getAttribute('href')).toBe('/politician/B001318/record')
    expect(within(list).getByRole('link', { name: 'Record in 60 seconds: Peter Welch' }).getAttribute('href')).toBe('/politician/W000800/record')
    expect(screen.getByText('1 Representative and 2 Senators found.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'View profiles' })).toBeTruthy()
  })

  it('districted state: shows only the senators and the add-your-address path, never a guessed House member', async () => {
    services.getDistrictFromAddress.mockResolvedValue({ state: 'CA', district: null, needsDistrict: true })
    services.findMembersForDistrict.mockResolvedValue([
      { bioguideId: 'P000145', name: 'Padilla, Alex', chamber: 'senate' },
      { bioguideId: 'S001150', name: 'Schiff, Adam', chamber: 'senate' },
    ])
    lookUp('94110')

    const list = await memberList()
    expect(services.findMembersForDistrict).toHaveBeenCalledWith('CA', null)
    expect(within(list).getAllByRole('link')).toHaveLength(2)
    expect(list.textContent).not.toMatch(/Representative/)
    expect(screen.getByText('2 Senators found.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add your address' })).toBeTruthy()
  })

  it('says so when member names cannot be loaded, and never invents rows', async () => {
    services.getDistrictFromAddress.mockResolvedValue({ state: 'CA', district: null })
    services.findMembersForDistrict.mockRejectedValue(new Error('offline'))
    lookUp('94110')

    await screen.findByText('Member names could not be loaded right now.')
    noMemberList()
    expect(screen.getByRole('button', { name: 'Add your address' })).toBeTruthy()
  })

  it('reports the count actually found (DC has no senators)', async () => {
    services.getDistrictFromAddress.mockResolvedValue({ state: 'DC', district: null })
    services.findMembersForDistrict.mockResolvedValue([])
    lookUp('20001')
    await screen.findByText('No senators found for DC.')
    noMemberList()
  })
})
