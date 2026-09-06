import { describe, it, expect } from 'vitest'
import { buildSitemapIndex, buildUrlset, toDateOnly, chunk } from '../../api/_lib/sitemapXml.js'

describe('sitemapXml', () => {
  it('builds an index and a urlset on the given origin', () => {
    const idx = buildSitemapIndex('https://www.ballotwatch.io', [{ name: 'members', lastmod: '2026-09-04' }, { name: 'bills-2', lastmod: null }])
    expect(idx).toContain('<loc>https://www.ballotwatch.io/sitemap-members.xml</loc><lastmod>2026-09-04</lastmod>')
    expect(idx).toContain('<loc>https://www.ballotwatch.io/sitemap-bills-2.xml</loc></sitemap>')

    const set = buildUrlset('https://www.ballotwatch.io', [{ path: '/vote/119/house/2/295', lastmod: '2026-09-03', changefreq: 'monthly' }, { path: '/politician/P000197' }])
    expect(set).toContain('<url><loc>https://www.ballotwatch.io/vote/119/house/2/295</loc><lastmod>2026-09-03</lastmod><changefreq>monthly</changefreq></url>')
    expect(set).toContain('<url><loc>https://www.ballotwatch.io/politician/P000197</loc></url>')
    expect(set).not.toContain('politicalapp.vercel.app')
  })

  it('normalizes dates and chunks arrays', () => {
    expect(toDateOnly('2026-09-03T10:00:00Z')).toBe('2026-09-03')
    expect(toDateOnly(null)).toBeNull()
    expect(toDateOnly('bad')).toBeNull()
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})
