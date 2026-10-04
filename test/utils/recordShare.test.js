import { describe, expect, it } from 'vitest'
import { canNativeShare, recordShareLinks } from '../../src/utils/recordShare.js'

describe('utils/recordShare', () => {
  const url = 'https://www.ballotwatch.io/politician/P000197/record'
  const title = "Nancy Pelosi's record in 60 seconds & more"

  it('encodes the title and URL in every intent link, and covers every non-browser channel', () => {
    const links = recordShareLinks({ url, title })
    expect(links.map((l) => l.channel)).toEqual(['x', 'bluesky', 'facebook', 'email'])
    for (const l of links) {
      expect(l.href).not.toContain(' ')
      expect(l.href).not.toContain('& more')
    }
    const x = new URL(links.find((l) => l.channel === 'x').href)
    expect(x.searchParams.get('text')).toBe(title)
    expect(x.searchParams.get('url')).toBe(url)
    const bsky = new URL(links.find((l) => l.channel === 'bluesky').href)
    expect(bsky.searchParams.get('text')).toBe(`${title} ${url}`)
  })

  it('puts only the URL in the email body without text, and text then URL with it', () => {
    const plain = recordShareLinks({ url, title }).find((l) => l.channel === 'email').href
    expect(decodeURIComponent(plain.split('body=')[1])).toBe(url)
    const withText = recordShareLinks({ url, title, text: 'Cast 615 votes.' }).find((l) => l.channel === 'email').href
    expect(decodeURIComponent(withText.split('body=')[1])).toBe(`Cast 615 votes.\n\n${url}`)
    expect(decodeURIComponent(withText.split('subject=')[1].split('&')[0])).toBe(title)
  })

  it('detects the native share sheet only when navigator.share is a function', () => {
    expect(canNativeShare({ share: () => {} })).toBe(true)
    expect(canNativeShare({ share: 'yes' })).toBe(false)
    expect(canNativeShare({})).toBe(false)
    expect(canNativeShare(null)).toBe(false)
  })
})
