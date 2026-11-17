// Builds api/_lib/staticText.generated.js: the full text of the info pages
// whose words live inside React components (how it works, methodology, about,
// open data, contact, privacy, terms), so the server can send it to
// crawlers and AI agents that do not run JavaScript.
//
// Each page is rendered from its real component with react-dom/server, so the
// text cannot drift from what a visitor reads. A test fails when the generated
// file is stale (test/api/staticText.test.js). Output is deterministic.
//
//   node scripts/build-static-text.mjs           write if changed
//   node scripts/build-static-text.mjs --check   exit 1 if the file is stale

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const SITE = 'https://www.ballotwatch.io'
export const STATIC_TEXT_FILE = 'api/_lib/staticText.generated.js'

// path -> the component that renders it
export const PAGES = {
  '/how-it-works': 'HowItWorksPage',
  '/methodology': 'MethodologyPage',
  '/about': 'AboutPage',
  '/open': 'OpenSourcePage',
  '/contact': 'ContactPage',
  '/privacy': 'PrivacyPage',
  '/terms': 'TermsPage',
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'", '&nbsp;': ' ' }
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#x27|#39|nbsp);/g, (m) => ENTITIES[m])
const squash = (s) => s.replace(/\s+/g, ' ').trim()

// The page's sections, without the hero (the server prints the H1 and lede
// from staticPages.js) and without anything that only works with JavaScript.
// Removes every element carrying aria-hidden="true" (decorative mock-ups a
// screen reader skips too), matching its closing tag by depth.
export function dropHidden(html) {
  for (;;) {
    const m = /<([a-z0-9]+)\b[^>]*aria-hidden="true"[^>]*>/.exec(html)
    if (!m) return html
    const tag = m[1]
    const walker = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'g')
    walker.lastIndex = m.index + m[0].length
    let depth = 1
    let end = html.length
    for (let t; depth > 0 && (t = walker.exec(html));) {
      depth += t[0].startsWith('</') ? -1 : (t[0].endsWith('/>') ? 0 : 1)
      if (depth === 0) end = walker.lastIndex
    }
    html = html.slice(0, m.index) + html.slice(end)
  }
}

export function cleanHtml(markup) {
  let html = dropHidden(markup)
    .replace(/<section class="ip-hero"[\s\S]*?<\/section>/, '')
    .replace(/<h1[\s\S]*?<\/h1>/g, '')
    .replace(/<(svg|button|form|script|style)\b[\s\S]*?<\/\1>/g, '')
    .replace(/<(input|img)\b[^>]*>/g, '')
    .replace(/\s(style|aria-[a-z]+|role|tabindex|data-[a-z-]+)="[^"]*"/g, '')
  // The outer wrapper is the component's root <div class="bw info-page …">.
  html = html.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '')
  return html.replace(/>\s+</g, '><').trim()
}

// A small HTML-to-Markdown pass for the tags these pages use.
export function toMarkdown(html) {
  const inline = (s) => squash(decode(s
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_, href, text) => {
      const label = squash(text.replace(/<[^>]+>/g, ''))
      if (!label) return ''
      const url = href.startsWith('/') ? `${SITE}${href}` : href
      return /^(https?:|mailto:)/.test(url) ? `[${label}](${url})` : label
    })
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/g, '**$2**')
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/g, '`$1`')
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, ' ')))
  const out = []
  const block = /<(h2|h3|h4|p|li|dt|dd|th|td)\b[^>]*>([\s\S]*?)<\/\1>/g
  // Blocks nest (a <li> holding <h3> and <p>); take the innermost ones.
  const leaf = (tag, body) => !/<(h2|h3|h4|p|li|dt|dd)\b/.test(body)
  let m
  while ((m = block.exec(html))) {
    const [whole, tag, body] = m
    if (!leaf(tag, body)) { block.lastIndex = m.index + whole.indexOf('>') + 1; continue }
    const text = inline(body)
    if (!text) continue
    if (tag === 'h2') out.push('', `## ${text}`, '')
    else if (tag === 'h3' || tag === 'h4') out.push('', `### ${text}`, '')
    else if (tag === 'li') {
      if (out.length && !out[out.length - 1].startsWith('- ')) out.push('')
      out.push(`- ${text}`)
    }
    else if (tag === 'dt') out.push('', `**${text}**`)
    else out.push('', text)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export async function build() {
  const { createServer } = await import('vite')
  const vite = await createServer({
    root: fileURLToPath(root),
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
    ssr: { noExternal: ['react-helmet-async', 'react-router-dom', 'react-router'] },
  })
  try {
    const React = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    // Loaded through Vite like the components' own imports (see `ssr.noExternal`
    // above), so the router and Helmet contexts are the same instances.
    const { MemoryRouter, Routes, Route } = await vite.ssrLoadModule('react-router-dom')
    const { HelmetProvider } = await vite.ssrLoadModule('react-helmet-async')
    const h = React.createElement
    const pages = {}
    // React warns that layout effects do not run on the server; nothing here needs them.
    const realError = console.error
    console.error = (...args) => { if (!String(args[0]).includes('useLayoutEffect')) realError(...args) }
    for (const [path, name] of Object.entries(PAGES)) {
      const mod = await vite.ssrLoadModule(`/src/components/${name}.jsx`)
      const markup = renderToStaticMarkup(
        h(HelmetProvider, { context: {} },
          h(MemoryRouter, { initialEntries: [path] },
            h(Routes, null, h(Route, { path, element: h(mod.default) })))),
      )
      const html = cleanHtml(markup)
      pages[path] = { html, markdown: toMarkdown(html) }
    }
    return [
      '// GENERATED by scripts/build-static-text.mjs from the page components.',
      '// Do not edit: run `node scripts/build-static-text.mjs` after changing a page.',
      '',
      `export const STATIC_TEXT = ${JSON.stringify(pages, null, 2)}`,
      '',
    ].join('\n')
  } finally {
    await vite.close()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = fileURLToPath(new URL(STATIC_TEXT_FILE, root))
  const next = await build()
  let current = ''
  try { current = readFileSync(file, 'utf8') } catch { /* first run */ }
  if (process.argv.includes('--check')) {
    if (current !== next) { console.error(`${STATIC_TEXT_FILE} is stale: run node scripts/build-static-text.mjs`); process.exit(1) }
    console.log(`${STATIC_TEXT_FILE} is current`)
  } else if (current !== next) {
    writeFileSync(file, next)
    console.log(`wrote ${STATIC_TEXT_FILE}`)
  } else {
    console.log(`${STATIC_TEXT_FILE} unchanged`)
  }
  process.exit(0)
}
