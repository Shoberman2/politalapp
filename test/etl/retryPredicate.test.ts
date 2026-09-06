import { describe, expect, it, vi } from 'vitest'

vi.mock('../../etl/utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../etl/utils.js')>()),
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  sleep: async () => {},
}))

// The repair script walks up to 2,000 bills an hour against a 5,000-call
// quota. retry() used to try every failure three times, so a stretch of
// 404s cost triple; a 4xx other than 429 is a definitive answer.
describe('retry with a should-retry predicate', () => {
  it('stops after the first attempt when the predicate says the error is final', async () => {
    const { retry, isTransientCongressError } = await import('../../etl/utils.js')
    const fn = vi.fn(async () => { throw new Error('Congress API error: 404 Not Found') })
    await expect(retry(fn, 3, 1, isTransientCongressError)).rejects.toThrow('404')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('still retries rate limits, server errors, and network failures', async () => {
    const { retry, isTransientCongressError } = await import('../../etl/utils.js')
    for (const message of ['Congress API error: 429 Too Many Requests', 'Congress API error: 503 Service Unavailable', 'fetch failed']) {
      const fn = vi.fn(async () => { throw new Error(message) })
      await expect(retry(fn, 3, 1, isTransientCongressError)).rejects.toThrow(message)
      expect(fn).toHaveBeenCalledTimes(3)
    }
  })

  it('defaults to retrying everything, as before', async () => {
    const { retry } = await import('../../etl/utils.js')
    const fn = vi.fn(async () => { throw new Error('Congress API error: 404 Not Found') })
    await expect(retry(fn, 2, 1)).rejects.toThrow('404')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
