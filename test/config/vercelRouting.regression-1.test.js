import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Regression: ISSUE-001 — SPA rewrite served index.html for root public assets
// Found by /qa on 2026-07-10
// Report: .gstack/qa-reports/qa-report-localhost-2026-07-10.md

const vercelConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')
)
const spaRewrite = vercelConfig.rewrites.find(
  (rewrite) => rewrite.destination === '/index.html'
)
const spaRoutePattern = new RegExp(`^${spaRewrite.source}$`)

describe('Vercel SPA routing regression', () => {
  it.each([
    '/capitol-logo.svg',
    '/og-default.png',
    '/clip.mp4',
    '/favicon.ico',
    '/site.webmanifest',
    '/data/datapackage.json',
  ])('does not rewrite the public file %s to index.html', (path) => {
    expect(spaRoutePattern.test(path)).toBe(false)
  })

  it.each(['/', '/bills', '/politician/S000033', '/developers/docs'])(
    'continues to rewrite the client route %s to index.html',
    (path) => {
      expect(spaRoutePattern.test(path)).toBe(true)
    }
  )

  it.each(['/api/v1/members', '/assets/app.js', '/s/bill/119/s/9'])(
    'continues to exclude the infrastructure route %s',
    (path) => {
      expect(spaRoutePattern.test(path)).toBe(false)
    }
  )
})

// politicalapp.vercel.app belongs to another Vercel account ("DCP Kenya
// Admin"); this project's default alias is
// politicalapp-shoberman2s-projects.vercel.app. A redirect keyed on a host we
// don't own never fires.
describe('canonical host redirects', () => {
  const hostRedirects = vercelConfig.redirects.filter((r) =>
    r.has?.some((h) => h.type === 'host')
  )

  it('sends every project alias to https://www.ballotwatch.io', () => {
    expect(hostRedirects.length).toBeGreaterThan(0)
    for (const r of hostRedirects) {
      expect(r.source).toBe('/:path*')
      expect(r.destination).toBe('https://www.ballotwatch.io/:path*')
      expect(r.permanent).toBe(true)
    }
  })

  it('only matches hosts under this team, never politicalapp.vercel.app', () => {
    for (const r of hostRedirects) {
      const host = r.has.find((h) => h.type === 'host').value
      expect(host).not.toBe('politicalapp.vercel.app')
      expect(host).toMatch(/-shoberman2s-projects\.vercel\.app$/)
    }
  })
})
