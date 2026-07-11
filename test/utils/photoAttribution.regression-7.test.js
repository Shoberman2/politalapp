import { describe, expect, it } from 'vitest'
import { parsePhotoAttribution } from '../../src/utils/photoAttribution'

// Regression: ISSUE-007 — Congress.gov attribution HTML was rendered as raw
// text, exposing markup and forcing the mobile profile to 720px wide.
// Found by /qa on 2026-07-10.

describe('photo attribution parsing regression', () => {
  it('extracts a normal attribution link into safe display data', () => {
    expect(parsePhotoAttribution(
      '<a href="http://www.senate.gov/history/photos">Courtesy U.S. Senate Historical Office</a>'
    )).toEqual({
      text: 'Courtesy U.S. Senate Historical Office',
      href: 'http://www.senate.gov/history/photos',
    })
  })

  it('keeps plain-text attributions as plain text', () => {
    expect(parsePhotoAttribution('Official congressional portrait &amp; archive')).toEqual({
      text: 'Official congressional portrait & archive',
      href: null,
    })
  })

  it('rejects executable link schemes while preserving the credit', () => {
    expect(parsePhotoAttribution(
      '<a href="javascript:alert(1)"><strong>Official archive</strong></a>'
    )).toEqual({
      text: 'Official archive',
      href: null,
    })
  })
})
