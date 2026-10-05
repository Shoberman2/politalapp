// SEO.jsx and server-rendered JSON-LD: on the page the server rendered, the
// client must not add a second copy of each block; after client navigation the
// server's blocks describe another page and must be removed. Also pins the
// static info pages' client <title>/description to api/_lib/staticPages.js,
// which the comments there say to keep in step by hand.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('@vercel/analytics/react', () => ({ Analytics: () => null }))
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null, profile: null, loading: false, signOut: vi.fn() }),
}))

import SEO from '../../src/components/SEO'
import HowItWorksPage from '../../src/components/HowItWorksPage'
import MethodologyPage from '../../src/components/MethodologyPage'
import DataSourcesPage from '../../src/components/DataSourcesPage'
import AboutPage from '../../src/components/AboutPage'
import OfficesPage from '../../src/components/OfficesPage'
import ContactPage from '../../src/components/ContactPage'
import PrivacyPage from '../../src/components/PrivacyPage'
import TermsPage from '../../src/components/TermsPage'
import { STATIC_PAGES, staticPageTitle } from '../../api/_lib/staticPages.js'

afterEach(() => {
  cleanup()
  document.head.querySelectorAll('script[type="application/ld+json"]').forEach((el) => el.remove())
  window.history.pushState({}, '', '/')
})

function addServerBlock(path) {
  const el = document.createElement('script')
  el.type = 'application/ld+json'
  el.setAttribute('data-bw-ssr', path)
  el.textContent = '{"@type":"FAQPage"}'
  document.head.appendChild(el)
  return el
}

const clientBlocks = () => [...document.head.querySelectorAll('script[type="application/ld+json"]:not([data-bw-ssr])')]

describe('SEO and server-rendered JSON-LD', () => {
  it('skips its own schema on the server-rendered page, drops stale blocks after navigation, and honors fullTitle', async () => {
    // First mount on `/`, which the server rendered: keep its block, add none.
    window.history.pushState({}, '', '/')
    const home = addServerBlock('/')
    const stale = addServerBlock('/about')
    render(<HelmetProvider><SEO fullTitle="Whole Title" path="/" schema={{ '@type': 'WebSite' }} /></HelmetProvider>)
    await waitFor(() => expect(document.title).toBe('Whole Title'))
    expect(home.isConnected).toBe(true)
    expect(stale.isConnected).toBe(false)
    expect(clientBlocks()).toHaveLength(0)
    cleanup()

    // Client navigation to /bills: the `/` block is stale; the client renders its own.
    window.history.pushState({}, '', '/bills')
    render(<HelmetProvider><SEO title="Bills" path="/bills" schema={{ '@type': 'CollectionPage' }} /></HelmetProvider>)
    await waitFor(() => expect(document.title).toBe('Bills | BallotWatch'))
    expect(home.isConnected).toBe(false)
    await waitFor(() => expect(clientBlocks()).toHaveLength(1))
    expect(JSON.parse(clientBlocks()[0].textContent)).toEqual({ '@context': 'https://schema.org', '@type': 'CollectionPage' })
  })

  it('static info pages set the same title and description the server renders, and an unknown methodology slug redirects to the index', async () => {
    const pages = {
      '/how-it-works': HowItWorksPage,
      '/methodology': MethodologyPage,
      '/data-sources': DataSourcesPage,
      '/about': AboutPage,
      '/offices': OfficesPage,
      '/contact': ContactPage,
      '/privacy': PrivacyPage,
      '/terms': TermsPage,
    }
    for (const [path, Page] of Object.entries(pages)) {
      window.history.pushState({}, '', path)
      render(<HelmetProvider><MemoryRouter initialEntries={[path]}><Page /></MemoryRouter></HelmetProvider>)
      const want = STATIC_PAGES[path]
      await waitFor(() => expect(document.title).toBe(staticPageTitle(want)))
      expect(document.querySelector('meta[name="description"]').getAttribute('content')).toBe(want.description)
      cleanup()
    }

    const { container } = render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/methodology/not-a-topic']}>
          <Routes>
            <Route path="/methodology/:slug" element={<MethodologyPage />} />
            <Route path="/methodology" element={<MethodologyPage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    )
    await waitFor(() => expect(container.querySelector('h1').textContent).toBe('How each number is made'))
    expect(container.querySelectorAll('.ip-index a').length).toBeGreaterThan(0)
  })
})
