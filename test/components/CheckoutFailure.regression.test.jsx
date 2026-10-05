import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'

// Regression: when the checkout API failed, Pricing and Civic Briefings sent
// the reader to a hosted Stripe Payment Link. That checkout carries no user id,
// so the webhook could never activate what it charged for. A failure now shows
// a message and leaves the reader on the page.

const mocks = vi.hoisted(() => ({
  auth: { user: null, session: null, isSubscribed: false, loading: false, signOut: () => {} },
  startConsumerCheckout: vi.fn(),
}))

vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => mocks.auth }))
vi.mock('../../src/services/civicBriefing', () => ({
  startConsumerCheckout: mocks.startConsumerCheckout,
  getBriefingSettings: vi.fn().mockResolvedValue({ isSubscribed: false, gmail: { connected: false }, preferences: [] }),
  disconnectGmail: vi.fn(),
  generateBriefingPreview: vi.fn(),
  saveBriefingPreference: vi.fn(),
  sendBriefingNow: vi.fn(),
  startGmailConnect: vi.fn(),
}))

import Pricing from '../../src/components/Pricing'
import CivicBriefing from '../../src/components/CivicBriefing'

let hrefSets
const originalLocation = window.location

beforeEach(() => {
  mocks.startConsumerCheckout.mockReset()
  mocks.auth.user = { id: 'u1', email: 'reader@example.com' }
  mocks.auth.session = { access_token: 't' }
  hrefSets = []
  // Record every navigation attempt instead of letting jsdom try it.
  delete window.location
  window.location = {
    origin: 'https://www.ballotwatch.io',
    pathname: '/',
    search: '',
    hash: '',
    get href() { return 'https://www.ballotwatch.io/' },
    set href(v) { hrefSets.push(v) },
  }
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  window.location = originalLocation
  vi.restoreAllMocks()
})

const wrap = (el) => render(<HelmetProvider><MemoryRouter initialEntries={['/briefings']}>{el}</MemoryRouter></HelmetProvider>)

describe('Pricing checkout', () => {
  it('shows an error and never redirects to a Stripe payment link when checkout fails', async () => {
    mocks.startConsumerCheckout.mockRejectedValue(new Error('checkout down'))
    wrap(<Pricing />)
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe Now' }))
    expect(await screen.findByText('Subscriptions are not open yet. Everything else on BallotWatch is free.')).toBeInTheDocument()
    expect(hrefSets).toEqual([])
    // The button is usable again, so the reader is not stuck.
    expect(screen.getByRole('button', { name: 'Subscribe Now' })).not.toBeDisabled()
  })

  it('still sends the reader to the checkout URL the API returns', async () => {
    mocks.startConsumerCheckout.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
    wrap(<Pricing />)
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe Now' }))
    await vi.waitFor(() => expect(hrefSets).toEqual(['https://checkout.stripe.com/c/pay/cs_test_1']))
    expect(mocks.startConsumerCheckout).toHaveBeenCalledWith(mocks.auth.session, 'https://www.ballotwatch.io/briefings')
  })
})

describe('Civic Briefing checkout', () => {
  it('shows an error, re-enables the button, and never redirects to a Stripe payment link when checkout fails', async () => {
    mocks.startConsumerCheckout.mockRejectedValue(new Error('checkout down'))
    wrap(<CivicBriefing />)
    const button = await screen.findByRole('button', { name: 'Subscribe for $2/mo' })
    fireEvent.click(button)
    expect(await screen.findByText('Briefing subscriptions are not open yet. The sample below shows what they will look like.')).toBeInTheDocument()
    expect(hrefSets.some((h) => /buy\.stripe\.com/.test(h))).toBe(false)
    expect(hrefSets).toEqual([])
    expect(screen.getByRole('button', { name: 'Subscribe for $2/mo' })).not.toBeDisabled()
  })
})
