import { describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'

// Regression: ISSUE-002 — chamber routes disappeared when VITE_SHOW_CHAMBER
// was omitted, even though the feature is part of the public application.
// Found by /qa on 2026-07-10.

const emptyComponent = () => null

vi.mock('@vercel/analytics/react', () => ({ Analytics: emptyComponent }))
vi.mock('../../src/components/Navigation', () => ({ default: emptyComponent }))
vi.mock('../../src/components/ShutdownBanner', () => ({ default: emptyComponent }))
vi.mock('../../src/components/Landing', () => ({ default: () => <div>Landing route</div> }))
vi.mock('../../src/components/Auth', () => ({ default: emptyComponent }))
vi.mock('../../src/components/AuthCallback', () => ({ default: emptyComponent }))
vi.mock('../../src/components/ProtectedRoute', () => ({ default: ({ children }) => children }))
vi.mock('../../src/components/MyPolitician', () => ({ default: emptyComponent }))
vi.mock('../../src/components/CivicBriefing', () => ({ default: emptyComponent }))
vi.mock('../../src/components/AllPoliticians', () => ({ default: emptyComponent }))
vi.mock('../../src/components/BillsPage', () => ({ default: emptyComponent }))
vi.mock('../../src/components/BillDetail', () => ({ default: emptyComponent }))
vi.mock('../../src/components/PoliticianDetail', () => ({ default: emptyComponent }))
vi.mock('../../src/components/ShutdownTracker', () => ({ default: emptyComponent }))
vi.mock('../../src/components/DistrictMap', () => ({ default: emptyComponent }))
vi.mock('../../src/components/BlogPage', () => ({ default: emptyComponent }))
vi.mock('../../src/components/ArticlePage', () => ({ default: emptyComponent }))
vi.mock('../../src/components/AiCongress', () => ({ default: emptyComponent }))
vi.mock('../../src/components/AiCongressSession', () => ({ default: emptyComponent }))
vi.mock('../../src/components/DonationComparison', () => ({ default: emptyComponent }))
vi.mock('../../src/components/DeveloperPortal', () => ({ default: emptyComponent }))
vi.mock('../../src/components/ApiKeyManager', () => ({ default: emptyComponent }))
vi.mock('../../src/components/UsageDashboard', () => ({ default: emptyComponent }))
vi.mock('../../src/components/ApiDocs', () => ({ default: emptyComponent }))
vi.mock('../../src/components/CommitteePage', () => ({ default: emptyComponent }))
vi.mock('../../src/components/ChamberMethodology', () => ({ default: emptyComponent }))
vi.mock('../../src/components/OpenSourcePage', () => ({ default: emptyComponent }))
vi.mock('../../src/components/MethodologyPage', () => ({ default: emptyComponent }))
vi.mock('../../src/components/Pricing', () => ({ default: emptyComponent }))
vi.mock('../../src/components/ChamberPage', () => ({
  default: () => {
    const location = useLocation()
    return <div>Chamber route: {location.pathname}</div>
  },
}))

describe('public chamber route regression', () => {
  it('registers the chamber entry points when the flag is omitted', async () => {
    vi.stubEnv('VITE_SHOW_CHAMBER', '')
    vi.resetModules()
    const { default: App } = await import('../../src/App')

    for (const path of ['/chamber', '/chamber/house', '/chamber/107/desk/47']) {
      render(
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      )

      expect(screen.getByText(`Chamber route: ${path}`)).toBeInTheDocument()
      cleanup()
    }

    vi.unstubAllEnvs()
  })
})
