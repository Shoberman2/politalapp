import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import axios from 'axios'

// An input that is not five digits never leaves the browser: the lookup answers
// in place and says what a ZIP finds versus what a street address finds.

vi.mock('../../src/services/floorVotes', async (importOriginal) => ({
  ...(await importOriginal()),
  getRecentFloorVotes: vi.fn().mockResolvedValue({ votes: [], recordedThrough: null }),
}))
vi.mock('../../src/services/congress', () => ({
  getRecentBills: vi.fn().mockResolvedValue([]),
  getFeaturedMembers: vi.fn().mockResolvedValue([]),
  getTrendingBills: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../src/services/userService', () => ({ saveUserAddress: vi.fn() }))

import Landing from '../../src/components/Landing'

let get
beforeEach(() => {
  get = vi.spyOn(axios, 'get')
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
})
afterEach(() => { cleanup(); get.mockRestore() })

describe('Landing ZIP lookup — invalid input', () => {
  it('explains ZIP versus street address and makes no network call for a non-ZIP', () => {
    const { container } = render(<HelmetProvider><MemoryRouter><Landing /></MemoryRouter></HelmetProvider>)
    const form = container.querySelector('.hero .lookup-form')
    fireEvent.change(form.querySelector('input'), { target: { value: '123a' } })
    fireEvent.submit(form)
    const result = container.querySelector('.hero .lookup-result')
    expect(result.querySelector('.lr-district').textContent).toBe('· · ·')
    expect(result.querySelector('.lr-body').textContent).toMatch('Enter a five-digit ZIP code to find your district.')
    expect(result.querySelector('small').textContent).toBe('A ZIP code finds your state and senators. A street address finds your House district.')
    expect(get).not.toHaveBeenCalled()
  })
})
