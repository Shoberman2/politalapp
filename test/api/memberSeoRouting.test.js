import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')
const vercel = JSON.parse(read('vercel.json'))

describe('member SEO routing config', () => {
  const idx = (src) => vercel.rewrites.findIndex((r) => r.source === src)
  const catchAll = vercel.rewrites.findIndex((r) => r.destination === '/index.html')

  it('serves /members and /member/:id from the prerender function ahead of the SPA catch-all', () => {
    expect(vercel.rewrites[idx('/members')].destination).toBe('/api/prerender?kind=members')
    expect(vercel.rewrites[idx('/member/:bioguideId')].destination).toBe('/api/prerender?kind=member&id=:bioguideId&alias=1')
    expect(idx('/members')).toBeLessThan(catchAll)
    expect(idx('/member/:bioguideId')).toBeLessThan(catchAll)
  })

  it('301s /politicians to /members', () => {
    expect(vercel.redirects).toContainEqual({ source: '/politicians', destination: '/members', permanent: true })
  })

  it('lets crawlers fetch /api/og and lists /members on llms.txt and the homepage links', () => {
    const robots = read('public/robots.txt')
    expect(robots).toMatch(/^Allow: \/api\/og$/m)
    expect(robots).not.toMatch(/^Disallow: \/api\/og\b/m)
    expect(read('public/llms.txt')).toContain('https://www.ballotwatch.io/members')
  })
})
