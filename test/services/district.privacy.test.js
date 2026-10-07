import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { getDistrictFromAddress } from '../../src/services/district'
import { saveUserAddress } from '../../src/services/userService'

// Privacy audit (2026-10-06): the ZIP or address a reader types is never
// written to the console, including inside an axios error (its config.url
// carries the ZIP).

afterEach(() => vi.restoreAllMocks())

describe('district lookup logging', () => {
  it('logs only the error message on failure and never prints the ZIP or address', async () => {
    const err = Object.assign(new Error('Request failed with status code 404'), { config: { url: 'https://api.zippopotam.us/us/90210' } })
    vi.spyOn(axios, 'get').mockRejectedValue(err)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await getDistrictFromAddress('1 Main St, Beverly Hills, CA 90210')
    saveUserAddress({ street: '1 Main St', city: 'Beverly Hills', state: 'CA', zip: '90210' })

    expect(error).toHaveBeenCalledWith('[District API] Error looking up district:', 'Request failed with status code 404')
    const printed = [...log.mock.calls, ...error.mock.calls, ...warn.mock.calls].flat().map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join('\n')
    expect(printed).not.toMatch(/90210|Main St/)
  })
})
