import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: vi.fn() } }))

import { renderHomePage } from '../../api/_lib/renderHome.js'
import { canonicalRedirect, forwardedQuery } from '../../api/prerender.js'
import { shell } from '../fixtures/pages.js'

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')
const vercel = JSON.parse(read('vercel.json'))

describe('vercel.json routing for the members index and member aliases', () => {
  const rewrite = (source) => vercel.rewrites.find((r) => r.source === source)
  const catchAll = vercel.rewrites.findIndex((r) => r.destination === '/index.html')

  it('serves /members and /member/:id from the prerender function, ahead of the SPA catch-all', () => {
    expect(rewrite('/members').destination).toBe('/api/prerender?kind=members')
    expect(rewrite('/member/:bioguideId').destination).toBe('/api/prerender?kind=member&id=:bioguideId&alias=1')
    expect(vercel.rewrites.indexOf(rewrite('/members'))).toBeLessThan(catchAll)
    expect(vercel.rewrites.indexOf(rewrite('/member/:bioguideId'))).toBeLessThan(catchAll)
  })

  it('301s /politicians to /members', () => {
    expect(vercel.redirects).toContainEqual({ source: '/politicians', destination: '/members', permanent: true })
  })

  it('still hands the whole /politician segment (id and slug) to the prerender function', () => {
    expect(rewrite('/politician/:bioguideId').destination).toBe('/api/prerender?kind=member&id=:bioguideId')
    expect(rewrite('/politician/:bioguideId/record').destination).toBe('/api/prerender?kind=record&id=:bioguideId')
  })
})

describe('robots.txt', () => {
  it('lets preview crawlers fetch /api/og', () => {
    const robots = read('public/robots.txt')
    expect(robots).not.toMatch(/^Disallow: \/api\/og\s*$/m)
    expect(robots).toMatch(/^Allow: \/api\/og\s*$/m)
    // Everything else under /api that should stay closed still is.
    expect(robots).toMatch(/^Disallow: \/api\/prerender\s*$/m)
  })
})

describe('llms.txt', () => {
  it('documents the members index and slugged member URLs', () => {
    const llms = read('public/llms.txt')
    expect(llms).toContain('https://www.ballotwatch.io/members')
    expect(llms).toContain('/politician/P000197-nancy-pelosi')
    expect(llms).toContain('/politician/P000197-nancy-pelosi/record')
  })
})

describe('homepage prerender', () => {
  it('links the public members index', () => {
    const html = renderHomePage(shell, { kind: 'home', votes: null, updatedAt: null, indexable: true })
    expect(html).toContain('<a href="/members">Members of Congress</a>')
  })
})

describe('canonicalRedirect', () => {
  const data = { id: 'P000197', name: 'Nancy Pelosi' }
  const member = (segment, extra = {}) => ({ kind: 'member', id: 'P000197', segment, alias: false, ...extra })
  it('returns null only for the exact canonical segment', () => {
    expect(canonicalRedirect(member('P000197-nancy-pelosi'), data)).toBeNull()
    expect(canonicalRedirect(member('P000197'), data)).toBe('/politician/P000197-nancy-pelosi')
    expect(canonicalRedirect(member('P000197-pelosi'), data)).toBe('/politician/P000197-nancy-pelosi')
    expect(canonicalRedirect(member('p000197-nancy-pelosi'), data)).toBe('/politician/P000197-nancy-pelosi')
    expect(canonicalRedirect(member('P000197-nancy-pelosi', { alias: true }), data)).toBe('/politician/P000197-nancy-pelosi')
  })
  it('keeps /record on the redirect', () => {
    expect(canonicalRedirect({ kind: 'record', id: 'P000197', segment: 'P000197', alias: false }, data)).toBe('/politician/P000197-nancy-pelosi/record')
  })
  it('ignores other kinds', () => {
    expect(canonicalRedirect({ kind: 'bill', id: '119-hr-1' }, data)).toBeNull()
  })
  it('redirects to the bare id when the member has no usable name', () => {
    expect(canonicalRedirect(member('P000197-whatever'), { id: 'P000197', name: '' })).toBe('/politician/P000197')
  })
})

describe('forwardedQuery', () => {
  it('drops the rewrite parameters and keeps the visitor\'s', () => {
    expect(forwardedQuery({ kind: 'member', id: 'P000197', alias: '1', utm_source: 'x', tag: ['a', 'b'] })).toBe('?utm_source=x&tag=a&tag=b')
    expect(forwardedQuery({ kind: 'member', id: 'P000197' })).toBe('')
    expect(forwardedQuery(undefined)).toBe('')
  })
})
