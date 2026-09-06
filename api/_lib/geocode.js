// Server-side district lookup. The browser has to use JSONP against the Census
// geocoder because of CORS; on the server a plain fetch works, so the MCP tool
// and any future API route can resolve a street address or a ZIP without the
// client-side workarounds in src/services/district.js.

const CENSUS = 'https://geocoding.geo.census.gov/geocoder/geographies'
const BENCHMARK = 'Public_AR_Current'
const VINTAGE = 'Current_Current'

export const FIPS_TO_STATE = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE',
  '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA',
  '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN',
  '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM',
  '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA',
  '54': 'WV', '55': 'WI', '56': 'WY', '72': 'PR', '60': 'AS', '66': 'GU', '69': 'MP', '78': 'VI',
}

// Pull { state, district } out of a Census "geographies" object. The key name
// carries the Congress number ("119th Congressional Districts"), so match by
// pattern rather than by literal.
export function districtFromGeographies(geographies) {
  if (!geographies || typeof geographies !== 'object') return null
  const key = Object.keys(geographies).find((k) => /Congressional Districts/i.test(k))
  const row = key ? geographies[key]?.[0] : null
  if (!row) return null
  const cdKey = Object.keys(row).find((k) => /^CD\d+$/i.test(k))
  const raw = cdKey ? String(row[cdKey]) : null
  if (!raw) return null
  // 00 = at-large; 98 and 99 = non-voting delegate or resident commissioner.
  const district = /^(0+|98|99)$/.test(raw) ? '0' : String(parseInt(raw, 10))
  const state = FIPS_TO_STATE[String(row.STATE || '').padStart(2, '0')] || null
  return { state, district, congressLabel: key }
}

async function getJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'BallotWatch/1.0 (+https://www.ballotwatch.io)' } })
    if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`)
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

export async function geocodeAddress(address) {
  const params = new URLSearchParams({ address, benchmark: BENCHMARK, vintage: VINTAGE, format: 'json' })
  const data = await getJson(`${CENSUS}/onelineaddress?${params}`)
  const match = data?.result?.addressMatches?.[0]
  if (!match) return null
  const d = districtFromGeographies(match.geographies)
  if (!d) return null
  return {
    ...d,
    state: d.state || match.addressComponents?.state || null,
    matchedAddress: match.matchedAddress || null,
    precision: 'address',
  }
}

// ZIP codes are not districts: a ZIP can straddle two or more. We resolve the
// ZIP's centroid and say so in `precision`, rather than pretending otherwise.
export async function geocodeZip(zip) {
  const z = String(zip || '').trim().slice(0, 5)
  if (!/^\d{5}$/.test(z)) return null
  const place = await getJson(`https://api.zippopotam.us/us/${z}`)
  const p = place?.places?.[0]
  if (!p) return null
  const params = new URLSearchParams({ x: p.longitude, y: p.latitude, benchmark: BENCHMARK, vintage: VINTAGE, format: 'json' })
  const data = await getJson(`${CENSUS}/coordinates?${params}`)
  const d = districtFromGeographies(data?.result?.geographies)
  const state = p['state abbreviation'] || d?.state || null
  if (!d) return state ? { state, district: null, precision: 'zip', city: p['place name'] } : null
  return { ...d, state, precision: 'zip', city: p['place name'], note: 'ZIP centroid; ZIP codes can span more than one district' }
}
