// Per-identity rate limiting for unauthenticated and free-key API access.
// Uses Upstash Redis over REST when UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN are set (shared across all function instances);
// otherwise falls back to an in-memory counter, which is per instance and
// therefore only a soft limit. Fixed one-minute and one-day windows: simple,
// cheap, and honest in the headers it returns.

const MINUTE_TTL_S = 120
const DAY_TTL_S = 90_000
// Memory mode keeps one entry per identity per window; cap it so a crawler
// storm cannot grow the map without bound on a long-lived instance.
const MAX_MEMORY_ENTRIES = 50_000

const memory = new Map()
let lastSweep = 0

function sweep(now) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, entry] of memory) {
    if (entry.expiresAt <= now) memory.delete(key)
  }
}

function evictIfFull() {
  if (memory.size <= MAX_MEMORY_ENTRIES) return
  const excess = memory.size - MAX_MEMORY_ENTRIES
  let n = 0
  for (const key of memory.keys()) {
    memory.delete(key)
    if (++n >= excess) break
  }
}

function memoryIncr(key, ttlSeconds, now) {
  sweep(now)
  const existing = memory.get(key)
  if (existing && existing.expiresAt > now) {
    existing.count += 1
    return existing.count
  }
  memory.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 })
  evictIfFull()
  return 1
}

function memoryCounts(minuteKey, dayKey, perDay, now) {
  return {
    minuteCount: memoryIncr(minuteKey, MINUTE_TTL_S, now),
    dayCount: perDay > 0 ? memoryIncr(dayKey, DAY_TTL_S, now) : 0,
    store: 'memory',
  }
}

async function upstashPipeline(commands) {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  })
  if (!res.ok) throw new Error(`Upstash ${res.status}`)
  const out = await res.json()
  if (!Array.isArray(out) || out.some((r) => !r || r.error != null || typeof r.result !== 'number')) {
    throw new Error('Upstash pipeline returned an error')
  }
  return out.map((r) => r.result)
}

export function hasSharedStore() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

/**
 * @param {object} opts
 * @param {string} opts.id        identity (hashed IP, key id, user id)
 * @param {number} opts.perMinute
 * @param {number} [opts.perDay]
 * @param {number} [opts.now]
 * @returns {Promise<{allowed:boolean, limit:number, remaining:number, retryAfter:number, store:'upstash'|'memory', window:'minute'|'day'}>}
 */
export async function checkRateLimit({ id, perMinute, perDay = 0, now = Date.now() }) {
  const minuteBucket = Math.floor(now / 60_000)
  const dayBucket = Math.floor(now / 86_400_000)
  const minuteKey = `rl:${id}:m:${minuteBucket}`
  const dayKey = `rl:${id}:d:${dayBucket}`
  const secondsLeftInMinute = 60 - Math.floor((now % 60_000) / 1000)
  const secondsLeftInDay = 86_400 - Math.floor((now % 86_400_000) / 1000)

  let counts
  if (hasSharedStore()) {
    try {
      const cmds = [['INCR', minuteKey], ['EXPIRE', minuteKey, MINUTE_TTL_S, 'NX']]
      if (perDay > 0) cmds.push(['INCR', dayKey], ['EXPIRE', dayKey, DAY_TTL_S, 'NX'])
      const results = await upstashPipeline(cmds)
      counts = { minuteCount: Number(results[0]), dayCount: perDay > 0 ? Number(results[2]) : 0, store: 'upstash' }
    } catch (err) {
      console.warn('[RateLimit] Upstash unavailable, using memory:', err.message)
      counts = memoryCounts(minuteKey, dayKey, perDay, now)
    }
  } else {
    counts = memoryCounts(minuteKey, dayKey, perDay, now)
  }

  const { minuteCount, dayCount, store } = counts
  if (perDay > 0 && dayCount > perDay) {
    return { allowed: false, limit: perDay, remaining: 0, retryAfter: secondsLeftInDay, store, window: 'day' }
  }
  if (minuteCount > perMinute) {
    return { allowed: false, limit: perMinute, remaining: 0, retryAfter: secondsLeftInMinute, store, window: 'minute' }
  }
  return {
    allowed: true,
    limit: perMinute,
    remaining: Math.max(0, perMinute - minuteCount),
    retryAfter: 0,
    store,
    window: 'minute',
  }
}

// Test hooks.
export function _resetMemory() {
  memory.clear()
  lastSweep = 0
}
export function _memorySize() {
  return memory.size
}
