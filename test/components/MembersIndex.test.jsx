import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'

const { services } = vi.hoisted(() => ({ services: { getMembersIndex: vi.fn() } }))
vi.mock('../../src/services/membersIndex', async (importOriginal) => ({ ...(await importOriginal()), getMembersIndex: services.getMembersIndex }))

import MembersIndex from '../../src/components/MembersIndex'

const members = [
  { id: 'S000148', name: 'Charles Schumer', chamber: 'senate', state: 'NY', district: null, party: 'Democratic', current: true },
  { id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', state: 'CA', district: '11', party: 'Democratic', current: true },
]

const renderPage = () => render(<HelmetProvider><MemoryRouter><MembersIndex /></MemoryRouter></HelmetProvider>)

beforeEach(() => { services.getMembersIndex.mockReset() })
afterEach(() => { cleanup(); document.getElementById('__bw_page')?.remove() })

describe('MembersIndex', () => {
  it('renders from the prerendered list without fetching, with slugged links', () => {
    const el = document.createElement('script')
    el.type = 'application/json'; el.id = '__bw_page'
    el.textContent = JSON.stringify({ kind: 'members', total: 2, members })
    document.body.appendChild(el)
    renderPage()
    expect(services.getMembersIndex).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1, name: 'Members of Congress' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Nancy Pelosi' }).getAttribute('href')).toBe('/politician/P000197-nancy-pelosi')
    expect(screen.getByRole('link', { name: 'Charles Schumer' }).getAttribute('href')).toBe('/politician/S000148-charles-schumer')
    expect(screen.getByRole('heading', { level: 2, name: 'Senate' })).toBeTruthy()
  })

  it('fetches the list after client-side navigation', async () => {
    services.getMembersIndex.mockResolvedValue({ members, total: 2 })
    renderPage()
    await waitFor(() => expect(screen.getByRole('link', { name: 'Nancy Pelosi' })).toBeTruthy())
    expect(services.getMembersIndex).toHaveBeenCalledTimes(1)
  })

  it('says so when the list cannot load', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let fail
    services.getMembersIndex.mockImplementation(() => new Promise((_, reject) => { fail = reject }))
    renderPage()
    expect(screen.getByText(/Loading the list/)).toBeTruthy()
    fail(new Error('down'))
    await waitFor(() => expect(screen.getByText(/could not be loaded/)).toBeTruthy())
    expect(spy).toHaveBeenCalled()
  })
})
