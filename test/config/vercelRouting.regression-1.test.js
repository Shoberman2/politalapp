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
    '/hero-run.jpg',
    '/hero-run.mp4',
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
