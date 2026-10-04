import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@vercel/analytics/react', () => ({ Analytics: () => null }))
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null, profile: null, loading: false, isSubscribed: false }),
}))

import App from '../../src/App'
import HowItWorksPage from '../../src/components/HowItWorksPage'
import AboutPage from '../../src/components/AboutPage'
import ContactPage from '../../src/components/ContactPage'
import PrivacyPage from '../../src/components/PrivacyPage'
import TermsPage from '../../src/components/TermsPage'
import { BRAND } from '../../src/config/brand'

afterEach(cleanup)

function renderAt(path, ui = <App />) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </HelmetProvider>
  )
}

describe('site-wide footer', () => {
  it('renders once on a non-landing route with the expected links', () => {
    const { container } = renderAt('/about')
    const footers = container.querySelectorAll('footer.footer')
    expect(footers).toHaveLength(1)
    const hrefs = [...footers[0].querySelectorAll('a')].map((a) => a.getAttribute('href'))
    for (const href of [
      '/my-representative', '/all', '/bills', '/this-week', '/alerts',
      '/how-it-works', '/methodology', '/methodology/ai-explanations', '/methodology/corrections',
      '/developers', '/developers/docs', '/open', '/llms.txt', '/developers#mcp',
      '/about', '/offices', '/contact', '/privacy', '/terms',
      'https://github.com/Shoberman2/politalapp',
    ]) {
      expect(hrefs).toContain(href)
    }
    expect(footers[0].textContent).toMatch(/Not affiliated with the U\.S\. Congress/)
    expect(footers[0].textContent).toContain('© 2026')
    expect(footers[0].textContent).toContain(BRAND.name)
    expect(footers[0].textContent).not.toMatch(/From the Desk/i)
  })
})

describe('information pages', () => {
  const pages = [
    ['/how-it-works', HowItWorksPage, /The public record/],
    ['/about', AboutPage, /nonpartisan record of Congress/],
    ['/contact', ContactPage, /How to reach us/],
    ['/privacy', PrivacyPage, /Privacy notice/],
    ['/terms', TermsPage, /Terms of use/],
  ]

  for (const [path, Page, heading] of pages) {
    it(`${path} renders its H1 and never says "Plainfloor"`, () => {
      const { container } = renderAt(path, <Page />)
      const h1s = container.querySelectorAll('h1')
      expect(h1s).toHaveLength(1)
      expect(h1s[0].textContent).toMatch(heading)
      expect(container.textContent).not.toMatch(/plainfloor/i)
    })
  }

  it('privacy notice says Tell your rep text is not sent or stored', () => {
    const { container } = renderAt('/privacy', <PrivacyPage />)
    expect(container.textContent).toMatch(/Tell your rep messages are never sent to or stored by us/)
    expect(container.textContent).toMatch(/Last updated: October 4, 2026/)
  })

  it('contact page falls back to GitHub issues while no email is set', () => {
    const { container } = renderAt('/contact', <ContactPage />)
    if (!BRAND.contactEmail) {
      expect(container.querySelector('a[href^="mailto:"]')).toBeNull()
      expect(container.querySelector('a[href$="/issues"]')).not.toBeNull()
    }
  })

  it('about page carries the mission line', () => {
    const { container } = renderAt('/about', <AboutPage />)
    expect(container.textContent).toContain(BRAND.mission)
  })
})
