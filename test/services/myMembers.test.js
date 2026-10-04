import { beforeEach, describe, expect, it, vi } from 'vitest'

const { district, congress } = vi.hoisted(() => ({
  district: {
    getDistrictFromAddress: vi.fn(),
    getCongressionalDistrict: vi.fn(),
    getHouseRepForDistrict: vi.fn(),
    getSenatorsForState: vi.fn(),
  },
  congress: { getMemberDetails: vi.fn() },
}))
vi.mock('../../src/services/district', () => district)
vi.mock('../../src/services/congress', () => congress)

import { findMembersForAddress, getMemberContact } from '../../src/services/myMembers'

const house = { bioguideId: 'H1', name: 'Rep, House', chamber: 'house', state: 'CA', district: '11' }
const sens = [{ bioguideId: 'S1', name: 'One, Sen', chamber: 'senate', state: 'CA' }, { bioguideId: 'S2', name: 'Two, Sen', chamber: 'senate', state: 'CA' }]

beforeEach(() => {
  Object.values(district).forEach((f) => f.mockReset())
  congress.getMemberDetails.mockReset()
  district.getHouseRepForDistrict.mockResolvedValue(house)
  district.getSenatorsForState.mockResolvedValue(sens)
})

describe('findMembersForAddress', () => {
  it('uses the Census match for a street address and returns the House member plus both senators', async () => {
    district.getDistrictFromAddress.mockResolvedValue({ state: 'CA', district: null, needsDistrict: true })
    district.getCongressionalDistrict.mockResolvedValue({ state: 'CA', district: '11' })
    const r = await findMembersForAddress({ street: '1 Main St', city: 'San Francisco', state: 'CA', zip: '94110' })
    expect(district.getCongressionalDistrict).toHaveBeenCalledWith('1 Main St', 'San Francisco', 'CA', '94110')
    expect(district.getHouseRepForDistrict).toHaveBeenCalledWith('CA', '11')
    expect(r).toEqual({ state: 'CA', district: '11', members: [house, ...sens] })
  })

  it('returns only senators when the House district is unknown (ZIP only, multi-district state)', async () => {
    district.getDistrictFromAddress.mockResolvedValue({ state: 'CA', district: null, needsDistrict: true })
    const r = await findMembersForAddress({ zip: '94110' })
    expect(district.getCongressionalDistrict).not.toHaveBeenCalled()
    expect(district.getHouseRepForDistrict).not.toHaveBeenCalled()
    expect(r).toEqual({ state: 'CA', district: null, members: sens })
  })

  it('resolves at-large states from the ZIP alone', async () => {
    district.getDistrictFromAddress.mockResolvedValue({ state: 'AK', district: '0' })
    await findMembersForAddress({ zip: '99501' })
    expect(district.getHouseRepForDistrict).toHaveBeenCalledWith('AK', '0')
  })

  // REGRESSION: Montana (two districts since 2023) was treated as at-large.
  it('a Wyoming ZIP returns the at-large House member plus both senators', async () => {
    const wyHouse = { bioguideId: 'H2', name: 'Rep, WY', chamber: 'house', state: 'WY', district: '0' }
    district.getDistrictFromAddress.mockResolvedValue({ state: 'WY', district: '0' })
    district.getHouseRepForDistrict.mockResolvedValue(wyHouse)
    const r = await findMembersForAddress({ zip: '82001' })
    expect(district.getHouseRepForDistrict).toHaveBeenCalledWith('WY', '0')
    expect(r).toEqual({ state: 'WY', district: '0', members: [wyHouse, ...sens] })
  })

  it('a Montana ZIP returns only the senators, even if a stale lookup claims district 0', async () => {
    district.getDistrictFromAddress.mockResolvedValue({ state: 'MT', district: '0' })
    const r = await findMembersForAddress({ zip: '59801' })
    expect(district.getHouseRepForDistrict).not.toHaveBeenCalled()
    expect(r).toEqual({ state: 'MT', district: null, members: sens })
  })

  it('a Montana street address resolves through the Census match to its district', async () => {
    district.getDistrictFromAddress.mockResolvedValue({ state: 'MT', district: null, needsDistrict: true, city: 'Billings' })
    district.getCongressionalDistrict.mockResolvedValue({ state: 'MT', district: '2' })
    const r = await findMembersForAddress({ street: '315 N 24th St', city: 'Billings', zip: '59101' })
    expect(district.getCongressionalDistrict).toHaveBeenCalledWith('315 N 24th St', 'Billings', 'MT', '59101')
    expect(district.getHouseRepForDistrict).toHaveBeenCalledWith('MT', '2')
    expect(r.district).toBe('2')
  })

  it('returns null without a usable location', async () => {
    district.getDistrictFromAddress.mockResolvedValue(null)
    expect(await findMembersForAddress({ zip: '00000' })).toBeNull()
    expect(await findMembersForAddress(null)).toBeNull()
  })
})

describe('getMemberContact', () => {
  it('reads the official website and phone from Congress.gov member details', async () => {
    congress.getMemberDetails.mockResolvedValue({ officialWebsiteUrl: 'https://x.house.gov/', addressInformation: { phoneNumber: '(202) 225-0000' }, directOrderName: 'Jane X' })
    expect(await getMemberContact('X1')).toEqual({ officialWebsiteUrl: 'https://x.house.gov/', phone: '(202) 225-0000', name: 'Jane X' })
  })
})
