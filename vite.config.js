import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { proxyUpstream } from './api/_lib/upstreamProxy.js'
import { checkRateLimit } from './api/_lib/rateLimit.js'
import { PROXY_PER_MINUTE, PROXY_PER_DAY } from './api/_lib/proxyRoute.js'

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

// `npm run dev` is plain Vite with no /api functions. Serve /api/proxy/* from
// the dev server so Congress.gov and OpenFEC work locally. The keys come from
// .env via loadEnv and stay in this Node process: they are passed to the proxy
// only, never to `define`, so nothing reaches the client bundle. Production
// uses api/proxy/*.js (with rate limiting) instead.
//
// The proxy spends the real keys from .env, so it only answers loopback
// clients: `vite --host` exposes the dev server to the LAN (or a tunnel), and
// without this anyone who can reach it could drain the Congress.gov / OpenFEC
// quota. It also applies the same per-IP limiter as production as a backstop.
export function devApiProxy(serverEnv) {
  return {
    name: 'ballotwatch-dev-api-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = /^\/api\/proxy\/(congress|fec)(?:[/?]|$)/.exec(req.url || '')
        if (!match) return next()
        const remote = req.socket?.remoteAddress || ''
        if (!LOOPBACK.has(remote)) {
          res.statusCode = 403
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: 'The dev data proxy only serves localhost', code: 'FORBIDDEN' } }))
          return
        }
        const rl = await checkRateLimit({
          id: `dev-proxy:${remote}`,
          perMinute: Number(serverEnv.PROXY_PER_MINUTE || PROXY_PER_MINUTE),
          perDay: Number(serverEnv.PROXY_PER_DAY || PROXY_PER_DAY),
        })
        if (!rl.allowed) {
          res.statusCode = 429
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Retry-After', String(rl.retryAfter || 60))
          res.end(JSON.stringify({ error: { message: `Rate limit reached (${rl.limit} per ${rl.window}).`, code: 'RATE_LIMIT_EXCEEDED' } }))
          return
        }
        try {
          const out = await proxyUpstream({ service: match[1], method: req.method, url: req.url, env: serverEnv })
          res.statusCode = out.status
          for (const [key, value] of Object.entries(out.headers)) res.setHeader(key, value)
          res.end(out.body)
        } catch {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: 'Proxy failed', code: 'UPSTREAM_ERROR' } }))
        }
      })
    },
  }
}

// api/prerender.js injects records into the built index.html. Vercel moves
// dist/ into its static output before it bundles the functions, so a copy of
// the shell is written under api/_shell/ at the end of the Vite build; the
// function references that path with `new URL(..., import.meta.url)`, which
// the file tracer picks up and bundles. The directory is gitignored.
function copyShellForPrerender() {
  return {
    name: 'ballotwatch-copy-shell-for-prerender',
    apply: 'build',
    closeBundle() {
      const src = 'dist/index.html'
      if (!existsSync(src)) return
      mkdirSync('api/_shell', { recursive: true })
      copyFileSync(src, 'api/_shell/index.html')
    },
  }
}

export default defineConfig(({ mode }) => ({
  // Empty prefix: read server-only names (CONGRESS_API_KEY, FEC_API_KEY) too.
  plugins: [react(), copyShellForPrerender(), devApiProxy(loadEnv(mode, process.cwd(), ''))],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    // E2E specs use @playwright/test (not installed by default in devDeps)
    // and run via `npm run test:e2e`. Exclude from vitest so unit-test runs
    // don't trip on the playwright import.
    exclude: ['node_modules', 'dist', 'test/e2e/**'],
  },
}))
