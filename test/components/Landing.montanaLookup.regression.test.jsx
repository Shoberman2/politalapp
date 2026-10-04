import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import axios from 'axios'

// REGRESSION: a Montana ZIP in the Landing lookup said "1 Representative and 2
// Senators found" and labelled it MT-AL. Montana has had two House districts
// since 2023, so a ZIP alone cannot pick the representative. This drives the
// real getDistrictFromAddress (only the ZIP service is stubbed).

vi.mock('../../src/services/floorVotes', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRecentFloorVotes: vi.fn().mockResolvedValue({ votes: [], recordedThrough: null }) }
})
vi.mock('../../src/services/floorSchedule', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getFloorSchedule: vi.fn().mockResolvedValue(null) }
})
vi.mock('../../src/services/congress', () => ({
  getRecentBills: vi.fn().mockResolvedValue([]),
  getFeaturedMembers: vi.fn().mockResolvedValue([]),
  getTrendingBills: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../src/services/userService', () => ({ saveUserAddress: vi.fn() }))

import Landing from '../../src/components/Landing'

const zippo = { '59801': ['MT', 'Missoula'], '82001': ['WY', 'Cheyenne'] }
let get

beforeEach(() => {
  get = vi.spyOn(axios, 'get').mockImplementation(async (url) => {
    const z = String(url).match(/zippopotam\.us\/us\/(\d{5})/)?.[1]
    if (!z || !zippo[z]) throw new Error(`unexpected GET ${url}`)
    const [state, place] = zippo[z]
    return { data: { places: [{ 'state abbreviation': state, 'place name': place }] } }
  })
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  window.IntersectionObserver = class {
    constructor(cb) { this.cb = cb }
    observe(el) { this.cb([{ isIntersecting: true, target: el }]) }
    unobserve() {}
    disconnect() {}
  }
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

afterEach(() => { cleanup(); get.mockRestore() })

async function lookUp(zip) {
  const { container } = render(
    <HelmetProvider><MemoryRouter><Landing /></MemoryRouter></HelmetProvider>
  )
  const form = container.querySelector('.hero .lookup-form')
  fireEvent.change(form.querySelector('input'), { target: { value: zip } })
  fireEvent.submit(form)
  let result
  await waitFor(() => {
    result = container.querySelector('.hero .lookup-result')
    expect(result?.querySelector('.lr-body')?.textContent).not.toMatch(/Matching/)
  })
  return result
}

describe('Landing ZIP lookup — at-large vs. multi-district states', () => {
  it('a Montana ZIP finds the senators and asks for a street address', async () => {
    const result = await lookUp('59801')
    expect(within(result).getByText('2 Senators found.')).toBeTruthy()
    expect(result.textContent).toMatch(/Add your street address/)
    expect(result.textContent).not.toMatch(/1 Representative/)
    expect(result.querySelector('.lr-district').textContent).toBe('MT')
  })

  it('a Wyoming ZIP still finds 1 Representative and 2 Senators', async () => {
    const result = await lookUp('82001')
    expect(within(result).getByText('1 Representative and 2 Senators found.')).toBeTruthy()
    expect(result.querySelector('.lr-district').textContent).toBe('WY-AL')
  })
})
