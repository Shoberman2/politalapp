// Pure XML builders for the generated sitemaps.

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export const SITEMAP_PART_SIZE = 50_000

export function buildSitemapIndex(origin, parts) {
  const items = parts.map((p) => `  <sitemap><loc>${esc(`${origin}/sitemap-${p.name}.xml`)}</loc>${p.lastmod ? `<lastmod>${esc(p.lastmod)}</lastmod>` : ''}</sitemap>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`
}

export function buildUrlset(origin, entries) {
  const items = entries.map((e) => `  <url><loc>${esc(`${origin}${e.path}`)}</loc>${e.lastmod ? `<lastmod>${esc(e.lastmod)}</lastmod>` : ''}${e.changefreq ? `<changefreq>${esc(e.changefreq)}</changefreq>` : ''}</url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`
}

export function toDateOnly(value) {
  if (!value) return null
  const s = String(value)
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

export function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}
