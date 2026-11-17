// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { INDEXNOW_KEY, locsFromSitemap, recentLocs, submit } from '../../scripts/indexnow.mjs'

describe('IndexNow', () => {
  it('serves the key file the submission points at', () => {
    const file = resolve(process.cwd(), `public/${INDEXNOW_KEY}.txt`)
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe(INDEXNOW_KEY)
  })

  it('reads sitemap entries and keeps only records changed in the last week', () => {
    const xml = '<urlset><url><loc>https://www.ballotwatch.io/vote/119/house/2/1</loc><lastmod>2026-11-15</lastmod></url><url><loc>https://www.ballotwatch.io/vote/119/house/1/9</loc><lastmod>2025-01-14</lastmod></url></urlset>'
    expect(locsFromSitemap(xml)).toHaveLength(2)
    expect(recentLocs(xml, 7, new Date('2026-11-17T12:00:00Z'))).toEqual(['https://www.ballotwatch.io/vote/119/house/2/1'])
  })

  it('posts the host, key, key location and URL list', async () => {
    let sent
    const status = await submit(['https://www.ballotwatch.io/'], async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return { status: 202 } })
    expect(status).toBe(202)
    expect(sent.url).toBe('https://api.indexnow.org/indexnow')
    expect(sent.body).toEqual({ host: 'www.ballotwatch.io', key: INDEXNOW_KEY, keyLocation: `https://www.ballotwatch.io/${INDEXNOW_KEY}.txt`, urlList: ['https://www.ballotwatch.io/'] })
  })
})
