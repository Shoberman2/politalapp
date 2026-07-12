import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Regression: the main configuration used the full-stack port while the E2E
// guide still instructed contributors to start frontend-only Vite on 5173.

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('E2E configuration documentation', () => {
  it('uses the full-stack command and port everywhere', () => {
    const guide = read('test/e2e/README.md')
    const config = read('playwright.config.ts')

    expect(guide).toContain('npm run dev:fullstack')
    expect(guide).toContain('http://localhost:3000')
    expect(guide).not.toContain('http://localhost:5173')
    expect(config).toContain("'http://localhost:3000'")
  })

  it('documents the installed Playwright dependency accurately', () => {
    const pkg = JSON.parse(read('package.json'))
    const config = read('playwright.config.ts')

    expect(pkg.devDependencies).toHaveProperty('@playwright/test')
    expect(config).not.toContain('intentionally NOT in the default devDependencies')
  })
})
