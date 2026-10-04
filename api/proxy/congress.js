// GET /api/proxy/congress/<path> (rewritten to /api/proxy/congress?path=<path>
// by vercel.json). Allow-list and key handling: api/_lib/upstreamProxy.js.
import { proxyHandler } from '../_lib/proxyRoute.js'

export default proxyHandler('congress')

export const config = { runtime: 'nodejs' }
