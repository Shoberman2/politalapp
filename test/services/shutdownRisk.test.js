import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({ get: vi.fn() })),
  },
}))

describe('calculateShutdownRisk', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not report a shutdown from the resolved March 2026 deadline', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T12:00:00Z'))

    const { calculateShutdownRisk } = await import('../../src/services/shutdown.js')

    const risk = calculateShutdownRisk()

    expect(risk.level).not.toBe('shutdown')
    expect(risk.nextDeadline?.date).toBe('2026-09-30')
    expect(risk.daysUntilDeadline).toBeGreaterThan(0)
  })
})
