// GET /api/proxy/fec/<path> (rewritten to /api/proxy/fec?path=<path> by
// vercel.json). Allow-list and key handling: api/_lib/upstreamProxy.js.
import { proxyHandler } from '../_lib/proxyRoute.js'

export default proxyHandler('fec')

export const config = { runtime: 'nodejs' }
