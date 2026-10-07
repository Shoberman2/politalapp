import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'

// The /offices hero inbox picks its vote like the landing does: a bill with a
// tally first, else the latest recorded vote of any kind. A failed fetch shows
// "Not available" rather than a skeleton; nothing is invented.

const services = vi.hoisted(() => ({ getRecentFloorVotes: vi.fn() }))
vi.mock('../../src/services/floorVotes', async (importOriginal) => ({
  ...(await importOriginal()),
  getRecentFloorVotes: services.getRecentFloorVotes,
}))

import OfficesPage from '../../src/components/OfficesPage'

function renderPage() {
  return render(<HelmetProvider><MemoryRouter><OfficesPage /></MemoryRouter></HelmetProvider>)
}

const fields = (c) => Object.fromEntries([...c.querySelectorAll('.of-card--message .of-field')]
  .map((d) => [d.querySelector('dt').textContent, d.querySelector('dd').textContent]))

beforeEach(() => { services.getRecentFloorVotes.mockReset() })
afterEach(cleanup)

describe('OfficesPage inbox vote', () => {
  it('shows "Not available", not a skeleton, when the vote fetch fails', async () => {
    // The service never rejects: a failed query resolves to null.
    services.getRecentFloorVotes.mockResolvedValue(null)
    const { container } = renderPage()
    await waitFor(() => expect(services.getRecentFloorVotes).toHaveBeenCalledWith(16))
    await waitFor(() => expect(container.querySelector('.of-stack .of-skel')).toBeNull())
    expect(fields(container).Re).toBe('Not available')
    expect(fields(container).Vote).toBe('Not available')
  })

  it('prefers a bill with a tally, else falls back to chamber and roll with the result only', async () => {
    services.getRecentFloorVotes.mockResolvedValue({ votes: [
      { id: 'senate-119-2-501', chamber: 'Senate', number: 501, question: 'On the Nomination', bill: null, yea: 51, nay: 49, result: 'Confirmed' },
      { id: 'house-119-2-300', chamber: 'House', number: 300, question: 'On Passage', bill: { display: 'H.R. 12' }, yea: 220, nay: 210, result: 'Passed' },
    ] })
    const { container } = renderPage()
    await waitFor(() => expect(fields(container).Re).toBe('H.R. 12'))
    expect(fields(container).Vote).toBe('220–210 · Passed')
    cleanup()

    services.getRecentFloorVotes.mockResolvedValue({ votes: [
      { id: 'senate-119-2-501', chamber: 'Senate', number: 501, question: 'On the Nomination', bill: null, yea: null, nay: null, result: 'Confirmed' },
    ] })
    const second = renderPage().container
    await waitFor(() => expect(fields(second).Re).toBe('Senate Roll Call 501'))
    expect(fields(second).Vote).toBe('Confirmed')
  })
})
