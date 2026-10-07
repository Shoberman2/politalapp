import { describe, expect, it } from 'vitest'
import { safeNextPath } from '../../src/utils/safeNextPath.js'

const FALLBACK = '/my-representative'

describe('safeNextPath', () => {
  it('keeps same-origin paths, with their query', () => {
    expect(safeNextPath('/bills')).toBe('/bills')
    expect(safeNextPath('/bills?x=1')).toBe('/bills?x=1')
    expect(safeNextPath('/bill/119/hr/1#votes')).toBe('/bill/119/hr/1#votes')
    // encoded slashes and backslashes stay inside the path: same origin
    expect(safeNextPath('/%2F%2Fevil.example')).toBe('/%2F%2Fevil.example')
    expect(safeNextPath('/%5Cevil')).toBe('/%5Cevil')
  })

  it('rejects anything that could leave the site', () => {
    for (const bad of [
      '//evil.example',
      '/\\evil.example',
      '/\\evil',               // '/%5Cevil' decoded
      '/a\\b',
      'https://evil.example',
      'javascript:alert(1)',
      '/\t/evil.example',      // '/%09/evil.example' decoded
      '/\n/evil.example',
      '/ /evil.example',
      '/ /evil',
      'JaVaScRiPt:alert(1)',
      ' /bills',
      `/${'a'.repeat(3000)}`,
      'bills',
      '',
      null,
      undefined,
      42,
    ]) expect(safeNextPath(bad), JSON.stringify(bad)).toBe(FALLBACK)
  })

  it('uses the given fallback', () => {
    expect(safeNextPath('//evil.example', '/')).toBe('/')
    expect(safeNextPath(null, '/all')).toBe('/all')
  })
})
