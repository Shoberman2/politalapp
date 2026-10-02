import { describe, expect, it } from 'vitest'
import {
  CONTACT_URL_OVERRIDES,
  deriveContactUrl,
  isOfficialCongressHost,
  resolveContact,
} from '../../src/utils/contactUrl'

describe('deriveContactUrl', () => {
  it('appends /contact to house.gov and senate.gov sites, normalized to https with no query or hash', () => {
    expect(deriveContactUrl('https://bean.house.gov/')).toBe('https://bean.house.gov/contact')
    expect(deriveContactUrl('http://www.cruz.senate.gov')).toBe('https://www.cruz.senate.gov/contact')
    expect(deriveContactUrl('https://Pelosi.House.gov/about?x=1#top')).toBe('https://pelosi.house.gov/contact')
    expect(deriveContactUrl('aderholt.house.gov')).toBe('https://aderholt.house.gov/contact')
  })

  it('does not guess a path on other hosts or on lookalike domains', () => {
    expect(deriveContactUrl('https://example.com')).toBeNull()
    expect(deriveContactUrl('https://house.gov.evil.example')).toBeNull()
    expect(deriveContactUrl('https://nothouse.gov')).toBeNull()
    expect(deriveContactUrl('javascript:alert(1)')).toBeNull()
    expect(deriveContactUrl('')).toBeNull()
    expect(deriveContactUrl(null)).toBeNull()
  })

  it('recognises official hosts', () => {
    expect(isOfficialCongressHost('https://www.warren.senate.gov')).toBe(true)
    expect(isOfficialCongressHost('https://example.org')).toBe(false)
  })
})

describe('resolveContact', () => {
  it('prefers a curated override, keyed by bioguide id (case-insensitive)', () => {
    const overrides = { X000001: 'https://x.house.gov/email-me' }
    const r = resolveContact({ bioguideId: 'x000001', officialWebsiteUrl: 'https://x.house.gov' }, overrides)
    expect(r).toEqual({ kind: 'contact', url: 'https://x.house.gov/email-me', website: 'https://x.house.gov', phone: null })
  })

  it('ships with a frozen override map', () => {
    expect(Object.isFrozen(CONTACT_URL_OVERRIDES)).toBe(true)
  })

  it('falls back to <site>/contact, then the website, then the phone, then nothing', () => {
    expect(resolveContact({ bioguideId: 'B001314', officialWebsiteUrl: 'https://bean.house.gov/', phone: '(202) 225-0123' }))
      .toEqual({ kind: 'contact', url: 'https://bean.house.gov/contact', website: 'https://bean.house.gov', phone: '(202) 225-0123' })

    expect(resolveContact({ bioguideId: 'Z1', officialWebsiteUrl: 'https://www.someoffice.example/home' }))
      .toEqual({ kind: 'website', url: 'https://www.someoffice.example/home', website: 'https://www.someoffice.example/home', phone: null })

    expect(resolveContact({ bioguideId: 'Z1', phone: '(202) 224-3121' }))
      .toEqual({ kind: 'phone', url: 'tel:2022243121', website: null, phone: '(202) 224-3121' })

    expect(resolveContact({ bioguideId: 'Z1' })).toEqual({ kind: 'none', url: null, website: null, phone: null })
    expect(resolveContact(null)).toEqual({ kind: 'none', url: null, website: null, phone: null })
  })

  it('ignores an invalid override and keeps falling back', () => {
    const r = resolveContact({ bioguideId: 'B1', officialWebsiteUrl: 'https://b.senate.gov' }, { B1: 'not a url at all ::' })
    expect(r.url).toBe('https://b.senate.gov/contact')
  })
})
