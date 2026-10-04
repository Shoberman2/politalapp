import { afterEach, describe, expect, it, vi } from 'vitest'
import { districtFromGeographies, geocodeAddress, geocodeZip } from '../../api/_lib/geocode.js'

// Server-side geocoder behind the MCP find_representatives tool. Montana has
// two districts; Wyoming is at-large (shared/atLargeStates.js).

const geos = (cd) => ({ '120th Congressional Districts': [cd] })
const MT2 = { CD120: '02', GEOID: '3002', STATE: '30', BASENAME: '2' }
const WY = { CD120: '00', GEOID: '5600', STATE: '56', BASENAME: 'Congressional District (at Large)' }

function mockFetch(routes) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const hit = routes.find(([re]) => re.test(String(url)))
    if (!hit) throw new Error(`unexpected fetch ${url}`)
    return { ok: true, status: 200, json: async () => hit[1] }
  })
}

afterEach(() => vi.restoreAllMocks())

describe('districtFromGeographies', () => {
  it('reads MT-02 and WY at-large from live-shaped Census rows', () => {
    expect(districtFromGeographies(geos(MT2))).toMatchObject({ state: 'MT', district: '2' })
    expect(districtFromGeographies(geos(WY))).toMatchObject({ state: 'WY', district: '0' })
  })
})

describe('geocodeAddress', () => {
  it('resolves a Billings, MT street address to district 2', async () => {
    mockFetch([[/onelineaddress/, { result: { addressMatches: [{ matchedAddress: '315 N 24TH ST, BILLINGS, MT, 59101', geographies: geos(MT2) }] } }]])
    const r = await geocodeAddress('315 N 24th St, Billings, MT 59101')
    expect(r).toMatchObject({ state: 'MT', district: '2', precision: 'address' })
  })
})

describe('geocodeZip', () => {
  it('flags a Montana ZIP as a centroid guess, never as the at-large seat', async () => {
    mockFetch([
      [/zippopotam/, { places: [{ 'state abbreviation': 'MT', 'place name': 'Billings', latitude: '45.78', longitude: '-108.5' }] }],
      [/coordinates/, { result: { geographies: geos(MT2) } }],
    ])
    const r = await geocodeZip('59101')
    expect(r.state).toBe('MT')
    expect(r.district).toBe('2')
    expect(r.note).toMatch(/ZIP centroid/)
  })

  it('resolves a Wyoming ZIP to the at-large seat exactly, without a centroid lookup', async () => {
    const f = mockFetch([[/zippopotam/, { places: [{ 'state abbreviation': 'WY', 'place name': 'Cheyenne', latitude: '41.1', longitude: '-104.8' }] }]])
    const r = await geocodeZip('82001')
    expect(r).toEqual({ state: 'WY', district: '0', precision: 'zip', city: 'Cheyenne', note: null })
    expect(f).toHaveBeenCalledTimes(1)
  })
})
