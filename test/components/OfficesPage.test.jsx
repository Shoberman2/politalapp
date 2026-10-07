import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'

const services = vi.hoisted(() => ({ getRecentFloorVotes: vi.fn() }))
vi.mock('../../src/services/floorVotes', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRecentFloorVotes: services.getRecentFloorVotes }
})

import OfficesPage from '../../src/components/OfficesPage'

// Compliance research (2026-10): House rules require a technology vendor to be
// authorized before marketing or selling to offices, and offices can't accept
// free in-kind services for official work. The page may describe the product
// and ask for sponsorship of a review; it must never offer a trial, pilot or
// price.

const vote = (over = {}) => ({
  id: 'house-119-2-312',
  chamber: 'House',
  number: 312,
  question: 'On Passage',
  description: null,
  bill: { display: 'H.R. 4410' },
  votedAt: '2026-10-01',
  yea: 231,
  nay: 198,
  result: 'Passed',
  ...over,
})

beforeEach(() => {
  services.getRecentFloorVotes.mockReset()
  services.getRecentFloorVotes.mockResolvedValue(null)
})
afterEach(cleanup)

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <OfficesPage />
      </MemoryRouter>
    </HelmetProvider>
  )
}

describe('OfficesPage', () => {
  it('states its status plainly', () => {
    const { container } = renderPage()
    const status = container.querySelector('.of-status')
    expect(status.getAttribute('role')).toBe('note')
    expect(status.textContent).toMatch(/not yet authorized/i)
    expect(status.textContent).toMatch(/not selling it or offering trials/i)
  })

  it('never offers a trial, a pilot, or a price', () => {
    const { container } = renderPage()
    const text = container.textContent
    expect(text).not.toMatch(/free trial|start (a|your) (trial|pilot)|request a pilot|\$\d|per month|pricing/i)
  })

  it('cites the CAO testimony it quotes', () => {
    const { container } = renderPage()
    const source = container.querySelector('blockquote footer a')
    expect(source.getAttribute('href')).toMatch(/^https:\/\/www\.congress\.gov\//)
  })

  it('disclaims affiliation with Congress', () => {
    const { container } = renderPage()
    expect(container.textContent).toMatch(/not affiliated with the U\.S\. Congress/i)
  })

  it('has its own dossier layout, not the shared info-page one', () => {
    const { container } = renderPage()
    expect(container.querySelector('.offices-page')).not.toBeNull()
    expect(container.querySelector('.info-page')).toBeNull()
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect([...container.querySelectorAll('.of-num')].map((n) => n.textContent)).toEqual(['01', '02', '03'])
    expect(container.querySelectorAll('.of-never > li')).toHaveLength(5)
    expect(container.querySelector('h1 em, h2 em, h3 em')).toBeNull()
  })

  it('keeps the inbox visual decorative and on skeletons until a vote loads', () => {
    services.getRecentFloorVotes.mockReturnValue(new Promise(() => {}))
    const { container } = renderPage()
    const stack = container.querySelector('.of-stack')
    expect(stack.getAttribute('aria-hidden')).toBe('true')
    expect(stack.querySelectorAll('.of-skel')).toHaveLength(2)
    expect(stack.textContent).toMatch(/A constituent in your district/)
    expect(stack.textContent).toMatch(/Draft answer · from approved sources/)
    expect(stack.textContent).toMatch(/Issue page/)
    expect(stack.textContent).toMatch(/Floor statement/)
    expect(stack.textContent).toMatch(/Reviewed and sent by staff · 2 actions logged/)
  })

  it('fills Re and Vote from the latest real recorded vote', async () => {
    services.getRecentFloorVotes.mockResolvedValue({
      votes: [vote({ id: 'house-119-2-313', number: 313, bill: null, yea: null, nay: null, result: null }), vote()],
    })
    const { container } = renderPage()
    await waitFor(() => expect(container.querySelector('.of-stack .of-skel')).toBeNull())
    const text = container.querySelector('.of-stack').textContent
    expect(text).toMatch(/H\.R\. 4410/)
    expect(text).toMatch(/231–198 · Passed/)
  })

  it('says "Not available" when no real vote comes back, inventing nothing', async () => {
    services.getRecentFloorVotes.mockResolvedValue(null)
    const { container } = renderPage()
    await waitFor(() => expect(container.querySelector('.of-stack .of-skel')).toBeNull())
    const dds = [...container.querySelectorAll('.of-card--message .of-field dd')].map((d) => d.textContent)
    expect(dds).toEqual(['A constituent in your district', 'Not available', 'Not available', 'Received'])
  })
})
