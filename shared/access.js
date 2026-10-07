// Which pages need a (free) account. The web app enforces this list in
// src/components/AccessGate.jsx (which wraps every route in src/App.jsx and
// imports it through src/config/access.js), and api/sitemap.js reads it to
// keep gated pages out of the sitemap. test/shared/access.test.js and
// test/components/AccessGate.test.jsx assert both.
//
// Patterns use react-router syntax: `:param` matches one segment, a trailing
// `*` matches the rest of the path. Matching is case-insensitive, like
// react-router's, and the path is normalised the way the router sees it:
// each segment percent-decoded, repeated slashes collapsed and trailing
// slashes stripped, so '/%62ills' and '/compare///' are gated too.
//
// Everything else is public: the landing, the members list (/all), full member
// profiles (/politician/:id), record cards (/politician/:id/record), bill pages
// (/bill/*), roll calls (/vote/*), This week, How it works, For offices, the
// developer pages, methodology, data sources, legal and contact pages, the
// blog, the historical chamber and /auth. Member profiles and bill pages stay
// public because the MCP server, llms.txt, record cards and search results
// link to them.

// Where a reader lands after signing in when no ?next= is given. The app
// (src/config/access.js) and the server chrome (api/_lib/renderPage.js) read it.
export const DEFAULT_SIGNED_IN_PATH = '/my-representative'

export const GATED_PATHS = Object.freeze([
  '/my-representative',
  '/bills',
  '/map',
  '/shutdown-tracker',
  '/compare',
  '/ai-congress',
  '/ai-congress/:id',
  '/committee/:code',
  '/briefings',
  '/alerts',
])

function patternToRegExp(pattern) {
  const body = pattern
    .split('/')
    .map((seg) => {
      if (seg === '*') return '.+'
      if (seg.startsWith(':')) return '[^/]+'
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  return new RegExp(`^${body}$`, 'i')
}

function decodeSegment(seg) {
  try {
    // Match react-router: an encoded slash stays inside its segment.
    return decodeURIComponent(seg).replace(/\//g, '%2F')
  } catch {
    return seg
  }
}

function normalisePath(path) {
  const joined = path.split('/').map(decodeSegment).join('/')
  return joined.replace(/\/{2,}/g, '/').replace(/\/*$/, '')
}

const GATED_RES = GATED_PATHS.map(patternToRegExp)

/** True when `pathname` (no query string) needs a signed-in user. */
export function isGatedPath(pathname) {
  if (typeof pathname !== 'string' || !pathname) return false
  const path = normalisePath(pathname.split(/[?#]/)[0])
  return GATED_RES.some((re) => re.test(path))
}
