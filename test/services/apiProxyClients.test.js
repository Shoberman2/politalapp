import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The browser must reach Congress.gov and OpenFEC only through the same-origin
// proxy, so no API key is ever embedded in the bundle.

const { create } = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock('axios', () => ({
  default: {
    create,
    get: vi.fn(),
  },
}))

vi.mock('../../src/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

beforeEach(() => {
  vi.resetModules()
  create.mockReset()
  create.mockImplementation(() => ({
    get: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  }))
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

const importers = {
  'src/services/congress.js': () => import('../../src/services/congress.js'),
  'src/services/district.js': () => import('../../src/services/district.js'),
  'src/services/shutdown.js': () => import('../../src/services/shutdown.js'),
  'src/services/donations.js': () => import('../../src/services/donations.js'),
}

describe('browser services use the same-origin proxy', () => {
  it.each([
    ['src/services/congress.js', '/api/proxy/congress'],
    ['src/services/district.js', '/api/proxy/congress'],
    ['src/services/shutdown.js', '/api/proxy/congress'],
    ['src/services/donations.js', '/api/proxy/fec'],
  ])('%s creates its client against %s without an api_key', async (path, base) => {
    await importers[path]()
    expect(create).toHaveBeenCalled()
    for (const [config] of create.mock.calls) {
      expect(config.baseURL).toBe(base)
      expect(config.params?.api_key).toBeUndefined()
    }
  })

  it('getMemberDetails (used by myMembers) goes through the proxy client', async () => {
    const get = vi.fn(async () => ({ data: { member: { name: 'Test' } } }))
    create.mockImplementation(() => ({
      get,
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    }))
    const { getMemberDetails } = await import('../../src/services/congress.js')
    await getMemberDetails('O000172')
    expect(create.mock.calls[0][0].baseURL).toBe('/api/proxy/congress')
    expect(get).toHaveBeenCalledWith('/member/O000172')
  })
})

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

describe('browser source', () => {
  it('never references the Congress.gov or FEC key env vars, or api_key', () => {
    const offenders = []
    for (const dir of ['src', 'shared']) {
      for (const file of walk(resolve(process.cwd(), dir))) {
        if (!/\.(jsx?|tsx?)$/.test(file)) continue
        const text = readFileSync(file, 'utf8')
        if (/VITE_CONGRESS_API_KEY|VITE_FEC_API_KEY|CONGRESS_API_KEY|FEC_API_KEY|api_key\s*[:=]/.test(text)) offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })
})
