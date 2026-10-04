import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
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

// The privacy notice must name every custom analytics event and every
// localStorage key the app writes. The hardcoded lists are the reviewed
// truth; the source scan fails when code adds one the notice doesn't mention.
const TRACKED_EVENTS = ['draft_opened', 'contact_page_opened', 'message_sent_confirmed', 'record_shared']
const STORAGE_KEYS = ['userData', 'wrote:v1', 'bw-theme', 'chamber_scrubber_taught_v1', 'fec_', 'vpa_', 'vpa_index', 'nb_editorial_', 'shutdownBannerDismissed']

function sourceFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(jsx?|tsx?)$/.test(name)) out.push(full)
  }
  return out
}

describe('privacy notice matches what the code does', () => {
  const srcRoot = resolve(process.cwd(), 'src')
  const sources = sourceFiles(srcRoot).map((f) => [f, readFileSync(f, 'utf8')])

  it('names every tracked event in the analytics section', () => {
    const { getByTestId } = renderAt('/privacy', <PrivacyPage />)
    const analytics = getByTestId('analytics-events').textContent
    for (const name of TRACKED_EVENTS) expect(analytics).toContain(name)
  })

  it('every event name sent from src/ is in the reviewed list (and so on the page)', () => {
    const found = new Set()
    for (const [, text] of sources) {
      // Direct calls, plus TellYourRep's countEvent wrapper around track().
      for (const m of text.matchAll(/\b(?:track|countEvent|countShare)\(\s*['"]([a-z0-9_]+)['"]/g)) found.add(m[1])
    }
    expect(found.size).toBeGreaterThan(0)
    for (const name of found) expect(TRACKED_EVENTS).toContain(name)
    // Any track( call whose name is not a string literal must be a known wrapper.
    for (const [file, text] of sources) {
      for (const m of text.matchAll(/\btrack\(\s*([^'"\s)][^,)]*)/g)) {
        expect([file.endsWith('TellYourRep.jsx') && m[1] === 'name', file.endsWith('MemberRecord.jsx')]).toContain(true)
      }
    }
    const { container } = renderAt('/privacy', <PrivacyPage />)
    for (const name of found) expect(container.textContent).toContain(name)
  })

  it('describes every localStorage key the app writes', () => {
    const { getByTestId, container } = renderAt('/privacy', <PrivacyPage />)
    const storage = getByTestId('storage-keys').textContent
    for (const key of STORAGE_KEYS.filter((k) => k !== 'shutdownBannerDismissed')) expect(storage).toContain(key)
    expect(container.textContent).toContain('shutdownBannerDismissed')
    expect(storage).toMatch(/Never the message text/)
  })

  it('every literal storage key in src/ is in the reviewed list', () => {
    const found = new Set()
    for (const [, text] of sources) {
      for (const m of text.matchAll(/(?:_KEY|_PREFIX|STORAGE_KEY)\s*=\s*['"]([^'"]+)['"]/g)) found.add(m[1])
      for (const m of text.matchAll(/(?:local|session)Storage\.setItem\(\s*['"`]([A-Za-z_:-]+)/g)) found.add(m[1])
    }
    // SENT_EVENT-style names are not storage keys.
    const keys = [...found].filter((k) => !/:changed$/.test(k))
    for (const key of keys) expect(STORAGE_KEYS.some((k) => key === k || key.startsWith(k))).toBe(true)
  })
})
