// Value: protects=every root-relative url('/...') in src CSS names a file that
//   exists in public/ (Vite leaves these unresolved and only warns);
//   fails_when=a referenced public image (e.g. hero-capitol.jpg) is renamed,
//   deleted or never committed; why_new=no test checks CSS-to-public asset
//   references; seam=none
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')

function cssFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return cssFiles(p)
    return p.endsWith('.css') ? [p] : []
  })
}

describe('CSS public asset references', () => {
  it('every root-relative url() in src CSS resolves to a file in public/', () => {
    const missing = []
    for (const file of cssFiles(join(ROOT, 'src'))) {
      const css = readFileSync(file, 'utf8')
      for (const m of css.matchAll(/url\(\s*['"]?(\/[^'")?#\s]+)/g)) {
        if (m[1].startsWith('//')) continue // protocol-relative, not a public asset
        if (!existsSync(join(ROOT, 'public', m[1]))) {
          missing.push(`${relative(ROOT, file)} -> ${m[1]}`)
        }
      }
    }
    expect(missing).toEqual([])
  })
})
