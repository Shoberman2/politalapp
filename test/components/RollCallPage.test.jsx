import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { services } = vi.hoisted(() => ({ services: { getRollCall: vi.fn() } }))
// Keep the real fromPrerender: the page hydrates from the server-rendered record through it.
vi.mock('../../src/services/rollCall', async (importOriginal) => ({ ...(await importOriginal()), getRollCall: services.getRollCall }))

import RollCallPage from '../../src/components/RollCallPage'

const rollCall = {
  id: 'house-119-2-295', chamberKey: 'house', chamber: 'House', congress: 119, session: 2, number: 295,
  question: 'On Passage', description: null, votedAt: '2026-09-03',
  bill: { id: '119-hr-4795', label: 'H.R. 4795', href: '/bill/119/hr/4795', title: 'Water Resources Development Act of 2026', source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/4795' },
  tally: { yea: 380, nay: 40, present: 0, notVoting: 15 },
  party: { dem: { yea: 200, nay: 10 }, rep: { yea: 180, nay: 30 }, ind: { yea: 0, nay: 0 } },
  result: 'Passed',
  sourceUrl: 'https://clerk.house.gov/Votes/2026295',
  votes: [
    { position: 'Not Voting', member: { id: 'B001314', name: 'Aaron Bean', party: 'Republican', state: 'FL', district: '4' } },
    { position: 'Nay', member: { id: 'P000197', name: 'Nancy Pelosi', party: 'Democratic', state: 'CA', district: '11' } },
    { position: 'Yea', member: { id: 'A000055', name: 'Robert Aderholt', party: 'Republican', state: 'AL', district: '4' } },
  ],
}

function renderAt(path) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/vote/:congress/:chamber/:session/:roll" element={<RollCallPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  )
}

const rowNames = (container) => [...container.querySelectorAll('.rc-table tbody tr td:first-child')].map((td) => td.textContent)

beforeEach(() => services.getRollCall.mockReset())
afterEach(cleanup)

// This one test walks many renders; under load it has exceeded the 5 s default.
describe('RollCallPage', { timeout: 30000 }, () => {
  it('renders the record, filters members by name, state, and position, and handles missing roll calls', async () => {
    services.getRollCall.mockResolvedValue(rollCall)
    const { container } = renderAt('/vote/119/house/2/295')

    expect(screen.getByText('Loading the roll call…')).toBeTruthy()
    await screen.findByRole('heading', { level: 1 })
    expect(services.getRollCall).toHaveBeenCalledWith({ congress: '119', chamber: 'house', session: '2', roll: '295' })

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('On Passage on H.R. 4795')
    expect(screen.getByRole('link', { name: 'H.R. 4795' }).getAttribute('href')).toBe('/bill/119/hr/4795')
    expect(screen.getByText('380 Yea')).toBeTruthy()
    expect(screen.getByText('40 Nay')).toBeTruthy()
    expect(container.querySelector('.rc-result').className).toContain('rc-result-passed')
    expect(container.querySelector('.rc-party').textContent).toBe('D 200–10 · R 180–30')
    expect(screen.getByRole('link', { name: 'Official record ↗' }).getAttribute('href')).toBe('https://clerk.house.gov/Votes/2026295')
    expect(screen.getByRole('link', { name: 'Nancy Pelosi' }).getAttribute('href')).toBe('/politician/P000197')
    expect(rowNames(container)).toEqual(['Aaron Bean', 'Nancy Pelosi', 'Robert Aderholt'])
    expect(container.querySelector('.rc-position-not-voting').textContent).toBe('Not Voting')
    // The "Tell your rep" hand-off sits on the page, closed until asked for.
    expect(container.querySelector('#tell-your-rep')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Write to your representative about this' }).getAttribute('aria-expanded')).toBe('false')

    const search = screen.getByRole('searchbox', { name: 'Filter members by name or state' })
    fireEvent.change(search, { target: { value: '  PEL ' } })
    expect(rowNames(container)).toEqual(['Nancy Pelosi'])

    fireEvent.change(search, { target: { value: 'al' } })          // a state code matches exactly, not as a substring
    expect(rowNames(container)).toEqual(['Robert Aderholt'])

    fireEvent.change(search, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Yea' }))
    expect(rowNames(container)).toEqual(['Robert Aderholt'])
    expect(screen.getByRole('button', { name: 'Yea' }).className).toBe('btn-toggle is-active')

    fireEvent.click(screen.getByRole('button', { name: 'Not Voting' }))
    expect(rowNames(container)).toEqual(['Aaron Bean'])

    fireEvent.click(screen.getByRole('button', { name: 'Present' }))
    expect(rowNames(container)).toEqual([])
    expect(screen.getByText('No members match that filter.')).toBeTruthy()

    // Name and position filters combine.
    fireEvent.click(screen.getByRole('button', { name: 'Nay' }))
    fireEvent.change(search, { target: { value: 'aderholt' } })
    expect(rowNames(container)).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(rowNames(container)).toEqual(['Robert Aderholt'])

    // Unknown roll call, or a failed fetch: the not-found page, never a crash.
    cleanup()
    services.getRollCall.mockResolvedValue(null)
    renderAt('/vote/119/senate/1/9999')
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Roll call not found')
    expect(screen.getByText(/senate roll call 9999 for session 1 of the 119th Congress/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse bills' }).getAttribute('href')).toBe('/bills')

    cleanup()
    services.getRollCall.mockRejectedValue(new Error('network'))
    renderAt('/vote/119/house/2/1')
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Roll call not found')

    // A server-rendered page embeds its record: when it matches the route there is no fetch and no spinner.
    cleanup()
    services.getRollCall.mockReset()
    const script = document.createElement('script')
    script.id = '__bw_page'
    script.type = 'application/json'
    script.textContent = JSON.stringify({ kind: 'vote', id: 'house-119-2-295', question: 'On Passage', description: null, voted_at: '2026-09-03', bill: { id: '119-hr-4795', title: 'Water Resources Development Act of 2026', source_url: null }, tally: { yea: 380, nay: 40, present: 0, notVoting: 15 }, party: null, result: 'Passed', source_url: 'https://clerk.house.gov/Votes/2026295', votes: [{ position: 'Yea', member: { id: 'A000055', name: 'Robert Aderholt', party: 'Republican', state: 'AL', district: '4' } }] })
    document.body.appendChild(script)
    try {
      const { container: embedded } = renderAt('/vote/119/house/2/295')
      expect(screen.queryByText('Loading the roll call…')).toBeNull()
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('On Passage on H.R. 4795')
      expect(rowNames(embedded)).toEqual(['Robert Aderholt'])
      expect(services.getRollCall).not.toHaveBeenCalled()

      // A different roll call ignores the embedded record and fetches its own.
      cleanup()
      services.getRollCall.mockResolvedValue(rollCall)
      renderAt('/vote/119/house/2/296')
      expect(screen.getByText('Loading the roll call…')).toBeTruthy()
      await screen.findByRole('heading', { level: 1 })
      expect(services.getRollCall).toHaveBeenCalledWith({ congress: '119', chamber: 'house', session: '2', roll: '296' })
    } finally {
      script.remove()
    }

    // A roll call with no tally and no member rows says so instead of inventing numbers.
    cleanup()
    services.getRollCall.mockResolvedValue({ ...rollCall, tally: null, party: null, result: null, bill: null, description: 'Motion to adjourn', votes: [], sourceUrl: null })
    const { container: bare } = renderAt('/vote/119/house/2/294')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('Tally not yet recorded.')).toBeTruthy()
    expect(screen.getByText('Member-level votes for this roll call have not been ingested yet.')).toBeTruthy()
    expect(bare.querySelector('.rc-standfirst').textContent).toBe('Motion to adjourn')
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('link', { name: /Official record/ })).toBeNull()
  })
})
