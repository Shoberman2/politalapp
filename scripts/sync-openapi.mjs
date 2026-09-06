// docs/api/openapi.yaml is the source; public/openapi.yaml is what the site
// serves at /openapi.yaml. Keep them identical (also enforced by a test).
import { copyFileSync, readFileSync } from 'fs'
const src = new URL('../docs/api/openapi.yaml', import.meta.url)
const dst = new URL('../public/openapi.yaml', import.meta.url)
let same = false
try { same = readFileSync(src, 'utf8') === readFileSync(dst, 'utf8') } catch { same = false }
if (!same) { copyFileSync(src, dst); console.log('synced public/openapi.yaml from docs/api/openapi.yaml') }
