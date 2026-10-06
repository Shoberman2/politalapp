import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('production feature defaults', () => {
  it('keeps bill alerts and email briefings off until email delivery works', async () => {
    const features = await import('../../src/config/features.js')
    expect(features.SHOW_BILL_ALERTS).toBe(false)
    expect(features.SHOW_BRIEFINGS).toBe(false)
    expect(features.BILL_ALERT_EMAIL_ENABLED).toBe(false)
  })

  it('cannot be switched back on by an environment variable alone', async () => {
    vi.stubEnv('VITE_BILL_ALERTS_ENABLED', 'true')
    const features = await import('../../src/config/features.js')
    expect(features.SHOW_BILL_ALERTS).toBe(false)
  })
})
