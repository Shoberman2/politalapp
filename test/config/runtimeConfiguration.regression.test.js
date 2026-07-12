import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Regression: local configuration previously launched only the Vite frontend,
// E2E targeted the wrong origin, and public services carried hardcoded keys.
// Found by full-stack configuration testing on 2026-07-10.

const root = process.cwd()
const read = (path) => readFileSync(resolve(root, path), 'utf8')

describe('full-stack runtime configuration', () => {
  it('provides separate frontend and full-stack development commands', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.scripts.dev).toBe('vite')
    expect(pkg.scripts['dev:fullstack']).toBe('vercel dev --listen 3000')
    expect(pkg.scripts['config:check']).toBe('node scripts/check-config.mjs')
  })

  it('targets the full-stack origin for local E2E tests', () => {
    expect(read('playwright.config.ts')).toContain("'http://localhost:3000'")
    expect(read('.env.example')).toContain('VITE_PUBLIC_ORIGIN=http://localhost:3000')
  })

  it.each([
    'src/services/congress.js',
    'src/services/district.js',
    'src/services/shutdown.js',
    'api/_lib/civicBriefing.js',
  ])('does not retain a hardcoded Congress.gov fallback in %s', (path) => {
    const source = read(path)
    const fallback = source.match(
      /(?:VITE_)?CONGRESS_API_KEY[\s\S]{0,160}\|\|\s*['"]([^'"]*)['"]/
    )
    expect(fallback?.[1] || '').toBe('')
  })

  it('does not document server secrets with public VITE prefixes', () => {
    const example = read('.env.example')
    for (const key of [
      'VITE_OPENAI_API_KEY',
      'VITE_SUPABASE_SERVICE_ROLE_KEY',
      'VITE_GOOGLE_CLIENT_SECRET',
      'VITE_STRIPE_SECRET_KEY',
    ]) {
      expect(example).not.toContain(key)
    }
  })
})
