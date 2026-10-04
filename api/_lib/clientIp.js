// Client identity for rate limiting, kept free of Supabase so routes that
// only need a per-IP limit (e.g. api/proxy/*) do not load the admin client.
import { createHmac } from 'crypto'
import { getHeader } from './request.js'

// Vercel sets x-vercel-forwarded-for and x-real-ip from the connection it
// terminated, so those cannot be spoofed by the client. x-forwarded-for is
// the fallback for other hosts.
export function clientIp(req) {
  const vercel = getHeader(req, 'x-vercel-forwarded-for')
  if (vercel) return vercel.split(',')[0].trim()
  const real = getHeader(req, 'x-real-ip')
  if (real) return real.trim()
  const fwd = getHeader(req, 'x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown'
}

let warnedAboutSalt = false
// Keyed hash: without the secret, the 2^32 IPv4 space is trivially reversible.
export function hashIp(ip) {
  const secret = process.env.RATE_LIMIT_SALT
  if (!secret && !warnedAboutSalt && process.env.VERCEL_ENV === 'production') {
    warnedAboutSalt = true
    console.warn('[API Auth] RATE_LIMIT_SALT is not set; ip_hash values use a default key')
  }
  return createHmac('sha256', secret || 'ballotwatch-dev').update(String(ip)).digest('hex').slice(0, 32)
}
