// Same-origin proxies for Congress.gov and OpenFEC. The API keys live on the
// server (api/proxy/*, or the Vite dev middleware in vite.config.js); the
// browser never sees them. See api/_lib/upstreamProxy.js for the allow-list.
export const CONGRESS_PROXY_BASE = '/api/proxy/congress'
export const FEC_PROXY_BASE = '/api/proxy/fec'

// Upstream origin, used only to recognise absolute Congress.gov URLs that come
// back inside API payloads (e.g. recordedVotes[].url) and map them to proxy paths.
export const CONGRESS_UPSTREAM_BASE = 'https://api.congress.gov/v3'

// Vercel's `/api/proxy/<service>/:path*` rewrite does not match a path that
// ends in "/", so "/candidates/search/" would 404 at the edge before reaching
// the proxy. Both upstreams accept the path without the trailing slash.
export function stripTrailingSlash(url) {
  if (typeof url !== 'string') return url
  const q = url.search(/[?#]/)
  const path = q === -1 ? url : url.slice(0, q)
  const rest = q === -1 ? '' : url.slice(q)
  return (path.length > 1 ? path.replace(/\/+$/, '') : path) + rest
}

// Install on every axios instance that talks to /api/proxy/*.
export function installProxyPaths(instance) {
  instance?.interceptors?.request?.use?.((config) => ({ ...config, url: stripTrailingSlash(config.url) }))
  return instance
}
