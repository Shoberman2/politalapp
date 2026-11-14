import { describe, expect, it } from 'vitest'
import { GATED_PATHS, isGatedPath } from '../../shared/access.js'

// Edge cases of the pattern matcher behind the account gate and the sitemap.

describe('isGatedPath edge cases', () => {
  it('handles empty and non-string input, strips query and hash, and matches whole segments only', () => {
    for (const bad of [undefined, null, '', 42, {}]) expect(isGatedPath(bad)).toBe(false)
    expect(isGatedPath('/alerts?page=2')).toBe(true)
    expect(isGatedPath('/briefings#top')).toBe(true)
    expect(isGatedPath('/bills?page=2')).toBe(false)
    expect(isGatedPath('/map#top')).toBe(false)
    expect(isGatedPath('/bill/119/hr/1/text')).toBe(false)    // bill pages are public
    expect(isGatedPath('/politician/P1')).toBe(false)         // full profiles are public
    expect(isGatedPath('/ai-congress/a/b')).toBe(false)       // ':id' is one segment
    expect(isGatedPath('/politician/P1/record?x=1')).toBe(false)
    expect(isGatedPath('/committee')).toBe(false)
    expect(isGatedPath('/ALERTS')).toBe(true)                 // case-insensitive like the router
    expect(Object.isFrozen(GATED_PATHS)).toBe(true)
  })

  it('normalises like the router: percent-decoded segments, repeated and trailing slashes', () => {
    for (const p of ['/%61lerts', '/%62riefings', '/al%65rts', '/alerts//', '/briefings///', '/ai-congress/a%2Fb',
      '/ai-congress/x//']) {
      expect(isGatedPath(p), p).toBe(true)
    }
    for (const p of ['/%62ills', '/my-representative//', '/compare///', '/committee/a%2Fb']) expect(isGatedPath(p), p).toBe(false)
    expect(isGatedPath('/politician/P000197/record')).toBe(false)
    expect(isGatedPath('/billsx')).toBe(false)
    expect(isGatedPath('/%E0%A4%A')).toBe(false)              // malformed escape stays raw
  })
})
