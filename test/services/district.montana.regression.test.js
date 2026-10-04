import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { getDistrictFromAddress, getCongressionalDistrict } from '../../src/services/district'

// REGRESSION: the web app treated Montana as an at-large state, so every
// Montana ZIP resolved to district "0", which matches no sitting member.
// Montana has had two districts (MT-01, MT-02) since the 118th Congress.
// The at-large list now lives in shared/atLargeStates.js.

const zippo = (state, place) => ({ data: { places: [{ 'state abbreviation': state, 'place name': place }] } })

describe('getDistrictFromAddress (ZIP only)', () => {
  let get
  beforeEach(() => { get = vi.spyOn(axios, 'get') })
  afterEach(() => get.mockRestore())

  it('asks for a street address for a Montana ZIP instead of claiming an at-large seat', async () => {
    get.mockResolvedValue(zippo('MT', 'Missoula'))
    const info = await getDistrictFromAddress('59801')
    expect(get).toHaveBeenCalledWith('https://api.zippopotam.us/us/59801')
    expect(info).toEqual({ state: 'MT', district: null, needsDistrict: true, city: 'Missoula' })
  })

  it('still resolves a Wyoming ZIP to the at-large seat', async () => {
    get.mockResolvedValue(zippo('WY', 'Cheyenne'))
    const info = await getDistrictFromAddress('82001')
    expect(info).toMatchObject({ state: 'WY', district: '0' })
    expect(info.needsDistrict).toBeUndefined()
  })
})

// The browser geocoder uses JSONP: it appends a <script> whose src names a
// global callback. Stand in for the Census server by answering that callback.
function answerJsonp(payload) {
  const real = document.head.appendChild.bind(document.head)
  return vi.spyOn(document.head, 'appendChild').mockImplementation((el) => {
    const cb = el.src ? new URL(el.src).searchParams.get('callback') : null
    if (cb && typeof window[cb] === 'function') {
      queueMicrotask(() => window[cb](payload))
      return el
    }
    return real(el)
  })
}

// Shapes copied from live Census Geocoder responses (2026-10-04).
const censusMatch = (cd) => ({
  result: { addressMatches: [{ matchedAddress: 'x', geographies: { '120th Congressional Districts': [cd] } }] },
})
const BILLINGS_MT = { CD120: '02', GEOID: '3002', STATE: '30', BASENAME: '2', NAME: 'Congressional District 2' }
const MISSOULA_MT = { CD120: '01', GEOID: '3001', STATE: '30', BASENAME: '1', NAME: 'Congressional District 1' }
const CHEYENNE_WY = { CD120: '00', GEOID: '5600', STATE: '56', BASENAME: 'Congressional District (at Large)', NAME: 'Congressional District (at Large)' }

describe('getCongressionalDistrict (street address)', () => {
  let spy
  afterEach(() => spy?.mockRestore())

  it('resolves a Billings street address to MT-02', async () => {
    spy = answerJsonp(censusMatch(BILLINGS_MT))
    const r = await getCongressionalDistrict('315 N 24th St', 'Billings', 'MT', '59101')
    expect(r).toEqual({ state: 'MT', district: '2' })
  })

  it('resolves a Missoula street address to MT-01', async () => {
    spy = answerJsonp(censusMatch(MISSOULA_MT))
    const r = await getCongressionalDistrict('200 W Broadway', 'Missoula', 'MT', '59802')
    expect(r).toEqual({ state: 'MT', district: '1' })
  })

  it('maps an at-large match to "0" even though Census BASENAME is display text', async () => {
    // BASENAME for an at-large seat is "Congressional District (at Large)", not
    // "00"; reading it raw handed that string to the House-member lookup.
    spy = answerJsonp(censusMatch(CHEYENNE_WY))
    const r = await getCongressionalDistrict('2308 Capitol Ave', 'Cheyenne', 'WY', '82001')
    expect(r).toEqual({ state: 'WY', district: '0' })
  })
})
