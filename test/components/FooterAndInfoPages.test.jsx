import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

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
import DataSourcesPage from '../../src/components/DataSourcesPage'
import MethodologyPage from '../../src/components/MethodologyPage'
import OfficesPage from '../../src/components/OfficesPage'
import { DATA_SOURCES } from '../../src/data/infoPages'
import { METHODOLOGY_PAGES } from '../../src/data/openSource'
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
      '/my-representative', '/all', '/bills', '/this-week',
      '/how-it-works', '/data-sources', '/methodology', '/methodology/ai-explanations', '/methodology/corrections',
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
    ['/how-it-works', HowItWorksPage, /Read the record/],
    ['/data-sources', DataSourcesPage, /How we get our data/],
    ['/methodology', MethodologyPage, /How each number is made/],
    ['/methodology/corrections', MethodologyPage, /Corrections/],
    ['/about', AboutPage, /nonpartisan record of Congress/],
    ['/contact', ContactPage, /How to reach us/],
    ['/privacy', PrivacyPage, /Privacy notice/],
    ['/terms', TermsPage, /Terms of use/],
    ['/offices', OfficesPage, /Answer constituents/],
  ]

  // Methodology reads its slug from the route, so render it through Routes.
  function renderPage(path, Page) {
    return renderAt(path, (
      <Routes>
        <Route path="/methodology/:slug" element={<Page />} />
        <Route path="*" element={<Page />} />
      </Routes>
    ))
  }

  for (const [path, Page, heading] of pages) {
    it(`${path} uses the shared info-page layout, one .ip-title H1, and never says "Plainfloor"`, () => {
      const { container } = renderPage(path, Page)
      expect(container.querySelector('.info-page')).not.toBeNull()
      const h1s = container.querySelectorAll('h1')
      expect(h1s).toHaveLength(1)
      expect(h1s[0].classList.contains('ip-title')).toBe(true)
      expect(h1s[0].textContent).toMatch(heading)
      expect(container.textContent).not.toMatch(/plainfloor/i)
    })
  }

  it('how it works shows the four-step loop and labels the future step', () => {
    const { container } = renderAt('/how-it-works', <HowItWorksPage />)
    const steps = container.querySelectorAll('.ip-steps > li')
    expect(steps).toHaveLength(4)
    expect(steps[2].textContent).toMatch(/Where we’re headed/)
    for (const step of steps) expect(step.querySelector('a.btn-text.btn-go')).not.toBeNull()
    expect(container.querySelector('a[href="/data-sources"]')).not.toBeNull()
  })

  it('data sources lists every source with a cadence and an external link', () => {
    const { container } = renderAt('/data-sources', <DataSourcesPage />)
    const rows = container.querySelectorAll('.ip-sources > li')
    expect(rows).toHaveLength(DATA_SOURCES.length)
    const text = container.textContent
    for (const name of ['Congress.gov API', 'Office of the Clerk', 'U.S. Senate', 'docs.house.gov', 'Census Bureau', 'Federal Election Commission']) {
      expect(text).toContain(name)
    }
    for (const row of rows) {
      expect(row.querySelector('.ip-cadence').textContent).toMatch(/^(Daily|Live|On request)$/)
      expect(row.querySelector('a[href^="https://"]')).not.toBeNull()
    }
    expect(text).toMatch(/What we compute/)
    expect(text).toMatch(/What AI does here/)
    expect(container.querySelector('a[href="/methodology/corrections"]')).not.toBeNull()
  })

  it('the /data-sources route is registered in the app', () => {
    const { container } = renderAt('/data-sources')
    expect(container.querySelector('h1.ip-title').textContent).toMatch(/How we get our data/)
  })

  it('methodology index lists every topic and topic pages link back', () => {
    const index = renderPage('/methodology', MethodologyPage)
    const links = [...index.container.querySelectorAll('.ip-index a')].map((a) => a.getAttribute('href'))
    expect(links).toEqual(METHODOLOGY_PAGES.map((p) => `/methodology/${p.slug}`))
    cleanup()
    const topic = renderPage('/methodology/ai-explanations', MethodologyPage)
    const back = [...topic.container.querySelectorAll('a[href="/methodology"]')]
    expect(back.some((a) => /Back to methodology/.test(a.textContent))).toBe(true)
  })

  it('llms.txt lists the data sources page', () => {
    expect(readFileSync(resolve(process.cwd(), 'public/llms.txt'), 'utf8')).toContain('https://www.ballotwatch.io/data-sources')
  })

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
