// Every congressional district a ZIP code touches, from the Census Bureau's
// ZCTA relationship file (api/_lib/data/zipDistricts.js, built by
// scripts/build-zip-districts.mjs). The table is about 400 KB, so it is
// imported on first use rather than with every cold start.

let index = null

async function load() {
  if (index) return index
  const { ZIP_DISTRICTS } = await import('./data/zipDistricts.js')
  const map = new Map()
  for (const pair of ZIP_DISTRICTS.split(';')) {
    const i = pair.indexOf('=')
    if (i > 0) map.set(pair.slice(0, i), pair.slice(i + 1))
  }
  index = map
  return map
}

// "OH15:54,OH3:46" -> [{ state: 'OH', district: '15', land_share_pct: 54 }, ...]
export function parseZipParts(value) {
  return String(value || '').split(',').map((part) => {
    const m = /^([A-Z]{2})(\d+)(?::(\d+))?$/.exec(part)
    return m ? { state: m[1], district: m[2], land_share_pct: m[3] ? Number(m[3]) : 100 } : null
  }).filter(Boolean)
}

// The districts for a 5-digit ZIP, largest share of the ZIP's land first, or
// null when the ZIP has no Census area (PO-box and single-building ZIPs).
export async function zipDistricts(zip) {
  const z = String(zip || '').trim().slice(0, 5)
  if (!/^\d{5}$/.test(z)) return null
  const parts = parseZipParts((await load()).get(z))
  return parts.length ? parts : null
}
