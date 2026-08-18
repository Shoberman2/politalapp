import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('production feature defaults', () => {
  it('ships the in-app bill watchlist by default while email remains opt-in', async () => {
    const features = await import('../../src/config/features.js')
    expect(features.SHOW_BILL_ALERTS).toBe(true)
    expect(features.BILL_ALERT_EMAIL_ENABLED).toBe(false)
  })

  it('retains an explicit alerts kill switch', async () => {
    vi.stubEnv('VITE_BILL_ALERTS_ENABLED', 'false')
    const features = await import('../../src/config/features.js')
    expect(features.SHOW_BILL_ALERTS).toBe(false)
  })
})
