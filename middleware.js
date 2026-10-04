// Vercel Routing Middleware, matched on `/` only.
//
// The homepage is server-rendered by api/prerender.js (kind=home). A
// vercel.json rewrite alone cannot reach it: Vercel checks the filesystem
// before rewrites, and dist/index.html answers `/`. Middleware runs before the
// filesystem and the CDN cache, so it rewrites `/` to the prerender function;
// the function's response is still cached at the CDN (s-maxage). The
// vercel.json rewrite for `/` stays as the static fallback should index.html
// ever stop being served at `/`.
//
// This is the header `rewrite()` from @vercel/functions sets; written out to
// avoid adding a dependency for one line.

export const config = { matcher: '/' }

export const HOME_PRERENDER_PATH = '/api/prerender?kind=home'

export default function middleware(request) {
  const url = new URL(request.url)
  if (url.pathname !== '/') return undefined
  return new Response(null, {
    headers: { 'x-middleware-rewrite': new URL(HOME_PRERENDER_PATH, url).toString() },
  })
}
