import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const root = process.cwd()

describe('OpenAPI spec is served unchanged', () => {
  it('public/openapi.yaml matches docs/api/openapi.yaml', () => {
    const src = readFileSync(resolve(root, 'docs/api/openapi.yaml'), 'utf8')
    const served = readFileSync(resolve(root, 'public/openapi.yaml'), 'utf8')
    expect(served).toBe(src)
  })

  it('declares the optional-auth and rate-limit contract', () => {
    const src = readFileSync(resolve(root, 'docs/api/openapi.yaml'), 'utf8')
    expect(src).toContain('security:\n  - {}\n  - bearerAuth: []')
    expect(src.match(/responses\/RateLimited"/g).length).toBeGreaterThanOrEqual(10)
    expect(src).toContain('headers/Link"')
  })
})
