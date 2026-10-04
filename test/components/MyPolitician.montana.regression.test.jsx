import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'

// REGRESSION: /my-representative kept its own at-large list that still
// included Montana. When the Census match failed for a Montana address, the
// page fell back to district "0" and asked for a House member who does not
// exist. Montana has had two districts since 2023; the list now comes from
// shared/atLargeStates.js.

const { district, user } = vi.hoisted(() => ({
  district: {
    getHouseRepForDistrict: vi.fn(),
    getSenatorsForState: vi.fn(),
    getCongressionalDistrict: vi.fn(),
    getDistrictsByState: vi.fn(),
  },
  user: {
    saveUserAddress: vi.fn(),
    getUserAddress: vi.fn(),
    clearUserAddress: vi.fn(),
    getFavorites: vi.fn(() => []),
    isFavorite: vi.fn(() => false),
    toggleFavorite: vi.fn(),
  },
}))
vi.mock('../../src/services/district', async (importOriginal) => ({ ...(await importOriginal()), ...district }))
vi.mock('../../src/services/userService', () => user)

import MyPolitician from '../../src/components/MyPolitician'

const sens = [
  { bioguideId: 'S1', name: 'One, Sen', chamber: 'senate', party: 'R', state: 'X' },
  { bioguideId: 'S2', name: 'Two, Sen', chamber: 'senate', party: 'R', state: 'X' },
]

beforeEach(() => {
  Object.values(district).forEach((f) => f.mockReset())
  district.getSenatorsForState.mockResolvedValue(sens)
  district.getHouseRepForDistrict.mockResolvedValue({ bioguideId: 'H1', name: 'Rep, House', chamber: 'house', party: 'R' })
})
afterEach(cleanup)

const renderWithSaved = (address) => {
  user.getUserAddress.mockReturnValue(address)
  return render(<HelmetProvider><MemoryRouter><MyPolitician /></MemoryRouter></HelmetProvider>)
}

describe('MyPolitician — Montana is not at-large', () => {
  it('uses the Census district for a Montana street address', async () => {
    district.getCongressionalDistrict.mockResolvedValue({ state: 'MT', district: '2' })
    renderWithSaved({ street: '315 N 24th St', city: 'Billings', state: 'MT', zip: '59101' })
    await waitFor(() => expect(district.getHouseRepForDistrict).toHaveBeenCalledWith('MT', '2'))
  })

  it('does not fall back to an at-large seat when the Montana match fails', async () => {
    district.getCongressionalDistrict.mockResolvedValue(null)
    district.getDistrictsByState.mockResolvedValue(['1', '2'])
    renderWithSaved({ street: '1 Nowhere Rd', city: 'Missoula', state: 'MT', zip: '59801' })
    await waitFor(() => expect(district.getSenatorsForState).toHaveBeenCalledWith('MT'))
    await waitFor(() => expect(district.getDistrictsByState).toHaveBeenCalledWith('MT'))
    expect(district.getHouseRepForDistrict).not.toHaveBeenCalled()
  })

  it('still falls back to the at-large seat for Wyoming', async () => {
    district.getCongressionalDistrict.mockResolvedValue(null)
    renderWithSaved({ street: '1 Nowhere Rd', city: 'Cheyenne', state: 'WY', zip: '82001' })
    await waitFor(() => expect(district.getHouseRepForDistrict).toHaveBeenCalledWith('WY', '0'))
    expect(district.getSenatorsForState).toHaveBeenCalledWith('WY')
    expect(district.getDistrictsByState).not.toHaveBeenCalled()
  })
})
