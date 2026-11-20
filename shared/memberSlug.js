// Name slugs for member URLs: /politician/P000197-nancy-pelosi.
//
// One helper for the server (api/prerender.js, sitemaps, renderers) and the
// client (React links and routes). The bioguide id is the stable key; the slug
// is only for people and search engines, and a wrong or stale slug is
// redirected to the right one rather than served.

export const BIOGUIDE_RE = /^[A-Z]\d{6}$/i

const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])

function words(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // "O'Rourke" and "O’Rourke" become "orourke": drop apostrophes before
    // other punctuation turns into a separator.
    .replace(/['‘’`]/g, '')
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean)
}

// First and last name, suffixes (Jr., III) dropped, lowercase ASCII,
// hyphenated. "Alexandria Ocasio-Cortez" keeps its internal hyphen only as
// part of the last name; a single-word name is used as is. Returns '' when
// nothing usable remains.
export function memberSlug(name) {
  const raw = String(name || '').trim()
  // A stub row whose name is just the id has no name to slug.
  if (!raw || BIOGUIDE_RE.test(raw)) return ''
  // "Ocasio-Cortez" must stay one last-name unit, so split on whitespace first.
  const parts = raw.split(/\s+/)
    .map((p) => words(p).join('-'))
    .filter(Boolean)
  while (parts.length > 1 && NAME_SUFFIXES.has(parts[parts.length - 1])) parts.pop()
  if (!parts.length) return ''
  if (parts.length === 1) return parts[0]
  return `${parts[0]}-${parts[parts.length - 1]}`
}

// "/politician/P000197-nancy-pelosi" (or "/politician/P000197" when the name
// is unknown). `suffix` is '' or '/record'.
export function memberPath(bioguideId, name, suffix = '') {
  const id = String(bioguideId || '').toUpperCase()
  const slug = memberSlug(name)
  return `/politician/${slug ? `${id}-${slug}` : id}${suffix}`
}

// Split a path segment into the bioguide id and whatever slug followed it.
// Returns null when the segment does not start with a bioguide id.
export function parseMemberSegment(segment) {
  const s = String(segment || '')
  const i = s.indexOf('-')
  const id = i === -1 ? s : s.slice(0, i)
  if (!BIOGUIDE_RE.test(id)) return null
  return { id: id.toUpperCase(), slug: i === -1 ? '' : s.slice(i + 1), idWasUpper: id === id.toUpperCase() }
}

// Just the id from a route param, for React pages. Never throws.
export function bioguideFromSegment(segment) {
  return parseMemberSegment(segment)?.id || String(segment || '').toUpperCase()
}

// Given and family name when the stored full name splits unambiguously: two
// words after dropping a suffix (Jr., III). Longer names ("Mary Gay Scanlon")
// could be a middle name or a two-word family name, so they return null
// instead of a guess.
export function parseGivenFamily(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  while (parts.length > 2 && NAME_SUFFIXES.has(parts[parts.length - 1].toLowerCase().replace(/[.,]/g, ''))) parts.pop()
  if (parts.length !== 2) return null
  return { givenName: parts[0], familyName: parts[1] }
}
