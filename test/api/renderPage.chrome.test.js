import { describe, expect, it, vi } from 'vitest'

vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: vi.fn() } }))

import { chrome } from '../../api/_lib/renderPage.js'

// The server-rendered masthead mirrors Navigation.jsx signed out: the four
// public pages, a Sign in link, and "Find my reps" through sign-in.

describe('renderPage chrome', () => {
  it('mirrors the signed-out Navigation masthead', () => {
    const html = chrome('<p>x</p>')
    const nav = html.match(/<nav class="topnav">([\s\S]*?)<\/nav>/)[1]
    expect([...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(['/how-it-works', '/this-week', '/all', '/offices'])
    expect(html).toContain('<a class="nav-account" href="/auth" rel="nofollow">Sign in</a>')
    expect(html).toContain(`href="/auth?next=${encodeURIComponent('/my-representative')}"`)
    expect(html).not.toMatch(/href="\/(bills|map|blog)"/)
    expect(html).toContain('<main class="main-content"><p>x</p></main>')
  })

  it('has one CTA label, the same markup as Navigation.jsx', () => {
    const html = chrome('<p>x</p>')
    expect(html).toContain('<a class="btn-primary btn-sm nav-cta" href="/auth?next=%2Fmy-representative">Find my reps</a>')
    expect(html.split('Find my reps')).toHaveLength(2)
    expect(html).not.toContain('nav-cta-short')
    expect(html).not.toContain('nav-cta-full')
  })
})
