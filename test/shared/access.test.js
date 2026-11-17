import { describe, expect, it } from 'vitest'
import { GATED_PATHS as SHARED, isGatedPath as sharedIsGated } from '../../shared/access.js'
import { GATED_PATHS as APP, isGatedPath } from '../../src/config/access.js'

describe('account gate list', () => {
  it('is the same list in the app and on the server', () => {
    expect(APP).toEqual(SHARED)
    expect(isGatedPath).toBe(sharedIsGated)
  })

  it('gates the app surfaces: my reps, the Bills index and tools', () => {
    for (const p of [
      '/my-representative', '/bills', '/bills/', '/map', '/shutdown-tracker', '/compare', '/ai-congress',
      '/ai-congress/abc', '/committee/HSAG', '/briefings', '/alerts',
    ]) expect(isGatedPath(p), p).toBe(true)
  })

  it('matches case-insensitively, like react-router', () => {
    for (const p of ['/Bills', '/MY-REPRESENTATIVE', '/Map/', '/AI-Congress/abc'])
      expect(isGatedPath(p), p).toBe(true)
  })

  it('keeps the public record public', () => {
    for (const p of [
      '/', '/politician/P000197', '/politician/P000197/', '/politician/P000197/record',
      '/bill/119/hr/1', '/bill/119/s/42/', '/vote/119/house/2/295', '/how-it-works', '/government',
      '/developers', '/developers/docs', '/developers/keys', '/developers/usage', '/open',
      '/methodology', '/methodology/votes', '/data-sources', '/about', '/contact', '/privacy', '/terms',
      '/blog', '/blog/a-post', '/chamber', '/chamber/119/house', '/auth', '/auth/callback', '/billsx',
    ]) expect(isGatedPath(p), p).toBe(false)
  })

  it('puts the members list behind an account and leaves This Week public (2026-11-17)', () => {
    for (const p of ['/all', '/all/', '/All']) expect(isGatedPath(p), p).toBe(true)
    for (const p of ['/this-week', '/This-Week', '/this-week/']) expect(isGatedPath(p), p).toBe(false)
  })
})
