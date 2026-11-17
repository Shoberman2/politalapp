// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: () => { throw new Error('no db in this test') } } }))

import { build, cleanHtml, dropHidden, toMarkdown, PAGES, STATIC_TEXT_FILE } from '../../scripts/build-static-text.mjs'
import { STATIC_TEXT } from '../../api/_lib/staticText.generated.js'
import { STATIC_PAGES } from '../../api/_lib/staticPages.js'
import { FULL_TEXT_PATHS } from '../../api/_lib/staticContent.js'

describe('generated info-page text', () => {
  it('matches the page components (run node scripts/build-static-text.mjs)', async () => {
    expect(readFileSync(resolve(process.cwd(), STATIC_TEXT_FILE), 'utf8')).toBe(await build())
  }, 60000)

  it('covers every static info page between the generated text and the data builders', () => {
    expect(Object.keys(STATIC_TEXT).sort()).toEqual(Object.keys(PAGES).sort())
    expect([...FULL_TEXT_PATHS].sort()).toEqual(Object.keys(STATIC_PAGES).sort())
    for (const [path, page] of Object.entries(STATIC_TEXT)) {
      expect(page.html, path).toMatch(/<h2|<li/)
      expect(page.html, path).not.toMatch(/<h1|<script|<button|<svg|aria-hidden/)
      expect(page.markdown.length, path).toBeGreaterThan(200)
    }
    expect(JSON.stringify(STATIC_TEXT)).not.toMatch(/\/offices|congressional offices/i)
  })

  it('drops decorative elements, the hero and script-only controls', () => {
    expect(dropHidden('<p>a</p><div aria-hidden="true"><div>x</div><span>y</span></div><p>b</p>')).toBe('<p>a</p><p>b</p>')
    const html = cleanHtml('<div class="bw info-page"><section class="ip-hero"><h1 class="ip-title">T</h1></section><section><h2 style="x">H</h2><button>go</button><p>Body</p></section></div>')
    expect(html).toBe('<section><h2>H</h2><p>Body</p></section>')
  })

  it('turns headings, lists and links into Markdown', () => {
    const md = toMarkdown('<h2>Head</h2><p>See <a href="/about">about</a> &amp; <strong>more</strong>.</p><ul><li>One</li><li><h3>Two</h3><p>Body</p></li></ul>')
    expect(md).toBe('## Head\n\nSee [about](https://www.ballotwatch.io/about) & **more**.\n\n- One\n\n### Two\n\nBody')
  })
})
