// Every congressional district a ZIP code touches, from the Census Bureau's
// ZCTA relationship file (api/_lib/data/zipDistricts.js, built by
// scripts/build-zip-districts.mjs). The table is about 400 KB, so it is
// imported on first use rather than with every cold start.

let index = null
let tableCongress = null

async function load() {
  if (index) return index
  const { ZIP_DISTRICTS, ZIP_DISTRICTS_CONGRESS } = await import('./data/zipDistricts.js')
  tableCongress = ZIP_DISTRICTS_CONGRESS
  const map = new Map()
  for (const pair of ZIP_DISTRICTS.split(';')) {
    const i = pair.indexOf('=')
    if (i > 0) map.set(pair.slice(0, i), pair.slice(i + 1))
  }
  index = map
  return map
}

// The Congress whose district lines the table holds.
export async function zipDistrictsCongress() {
  await load()
  return tableCongress
}

// "OH15:54,OH3:46" -> [{ state: 'OH', district: '15', land_share_pct: 54 }, ...]
// A share of 0 means under 1% of the ZIP's land.
export function parseZipParts(value) {
  return String(value || '').split(',').map((part) => {
    const m = /^([A-Z]{2})(\d+)(?::(\d+))?$/.exec(part)
    return m ? { state: m[1], district: m[2], land_share_pct: m[3] ? Number(m[3]) : 100 } : null
  }).filter(Boolean)
}

// Every district holding any of a 5-digit ZIP's land, largest share first, or
// null when the ZIP has no Census area (PO-box and single-building ZIPs).
export async function zipDistricts(zip) {
  const z = String(zip || '').trim().slice(0, 5)
  if (!/^\d{5}$/.test(z)) return null
  const parts = parseZipParts((await load()).get(z))
  return parts.length ? parts : null
}

// ZIP ranges that lie wholly inside one territory. Each territory is a single
// at-large seat, so the ZIP settles it even when the Census has no area for it
// (PO-box ZIPs such as 96932 in Guam).
const TERRITORY_ZIPS = [
  [601, 799, 'PR'], [800, 899, 'VI'], [900, 999, 'PR'],
  [96799, 96799, 'AS'], [96910, 96932, 'GU'], [96950, 96952, 'MP'],
]

export function territoryForZip(zip) {
  const z = String(zip || '').trim().slice(0, 5)
  if (!/^\d{5}$/.test(z)) return null
  const n = Number(z)
  const hit = TERRITORY_ZIPS.find(([from, to]) => n >= from && n <= to)
  return hit ? hit[2] : null
}
