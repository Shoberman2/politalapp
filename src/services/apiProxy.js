// Same-origin proxies for Congress.gov and OpenFEC. The API keys live on the
// server (api/proxy/*, or the Vite dev middleware in vite.config.js); the
// browser never sees them. See api/_lib/upstreamProxy.js for the allow-list.
export const CONGRESS_PROXY_BASE = '/api/proxy/congress'
export const FEC_PROXY_BASE = '/api/proxy/fec'

// Upstream origin, used only to recognise absolute Congress.gov URLs that come
// back inside API payloads (e.g. recordedVotes[].url) and map them to proxy paths.
export const CONGRESS_UPSTREAM_BASE = 'https://api.congress.gov/v3'
