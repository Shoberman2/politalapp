import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '../fixtures/supabaseChain.js'

const db = makeSupabaseMock()
const auth = { getUser: vi.fn() }
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: (t) => db.from(t), auth: { getUser: (...a) => auth.getUser(...a) } } }))

import handler, { FREE_MONTHLY_LIMIT } from '../../api/keys/free.js'
import { _resetMemory } from '../../api/_lib/rateLimit.js'

const ORG_FIELDS = 'id, plan, subscription_status, subscription_id, monthly_limit'

function makeRes() {
  const headers = new Map()
  return {
    statusCode: 0,
    body: '',
    setHeader(k, v) { headers.set(k.toLowerCase(), v) },
    getHeader(k) { return headers.get(k.toLowerCase()) },
    end(b) { this.body = b || '' },
    json() { return JSON.parse(this.body) },
  }
}
const post = (token) => ({ method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {} })
const org = (over = {}) => ({ id: 'org-1', plan: 'starter', subscription_status: 'canceled', subscription_id: 'sub_1', monthly_limit: 10000, ...over })
const claim = async () => { const res = makeRes(); await handler(post('jwt'), res); return res }

describe('POST /api/keys/free', () => {
  beforeEach(() => { db.reset(); auth.getUser.mockReset(); _resetMemory() })

  it('refuses anything but an authenticated POST', async () => {
    let res = makeRes()
    await handler({ method: 'OPTIONS', headers: {} }, res)
    expect(res.statusCode).toBe(204)
    expect(res.getHeader('access-control-allow-methods')).toBe('POST, OPTIONS')

    res = makeRes()
    await handler({ method: 'GET', headers: {} }, res)
    expect(res.statusCode).toBe(405)
    expect(res.json().error.code).toBe('METHOD_NOT_ALLOWED')

    res = makeRes()
    await handler(post(null), res)
    expect(res.statusCode).toBe(401)
    expect(res.json().error.message).toBe('Sign in to claim a free key')
    expect(auth.getUser).not.toHaveBeenCalled()

    res = makeRes()
    await handler({ method: 'POST', headers: { authorization: 'Token abc' } }, res)
    expect(res.statusCode).toBe(401)

    auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } })
    res = makeRes()
    await handler(post('expired-jwt'), res)
    expect(res.statusCode).toBe(401)
    expect(res.json().error.message).toBe('Session is not valid')
    expect(auth.getUser).toHaveBeenCalledWith('expired-jwt')
    expect(db.calls).toHaveLength(0)
  })

  it('writes exactly the free-plan rows, refuses a sixth attempt in a minute before reading, and reports database failures', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'dev@example.com' } }, error: null })

    // Paid (active or past_due) and already-free organizations are covered by
    // keysFreeRoute.test.js; this file pins the exact writes and the failure paths.
    // Three claims first so the sixth attempt below trips the per-user limit.
    db.responses.organizations = { data: [org({ plan: 'free', subscription_status: 'active', subscription_id: null, monthly_limit: 0 })] }
    for (let i = 0; i < 3; i += 1) expect((await claim()).statusCode).toBe(200)
    expect(db.calls).toHaveLength(3)
    expect(db.calls[0].ops).toEqual([['select', ORG_FIELDS], ['eq', 'owner_id', 'user-1'], ['order', 'created_at', { ascending: true }], ['limit', 1]])

    // Lapsed starter: becomes an active free plan and drops the old Stripe subscription id.
    db.reset()
    db.responses.organizations = [
      { data: [org()] },
      { data: org({ plan: 'free', subscription_status: 'active', subscription_id: null, monthly_limit: FREE_MONTHLY_LIMIT }) },
    ]
    let res = await claim()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ data: org({ plan: 'free', subscription_status: 'active', subscription_id: null, monthly_limit: FREE_MONTHLY_LIMIT }), meta: { created: false } })
    expect(db.calls[1].ops).toEqual([
      ['update', { plan: 'free', subscription_status: 'active', monthly_limit: FREE_MONTHLY_LIMIT, subscription_id: null }],
      ['eq', 'id', 'org-1'],
      ['select', ORG_FIELDS],
      ['single'],
    ])

    // No organization yet: one is created on the free plan.
    db.reset()
    db.responses.organizations = [
      { data: [] },
      { data: org({ id: 'org-2', plan: 'free', subscription_status: 'active', subscription_id: null, monthly_limit: FREE_MONTHLY_LIMIT }) },
    ]
    res = await claim()
    expect(res.statusCode).toBe(200)
    expect(res.json().meta).toEqual({ created: true })
    expect(db.calls[1].ops).toEqual([
      ['insert', { name: "dev@example.com's Organization", owner_id: 'user-1', plan: 'free', subscription_status: 'active', monthly_limit: FREE_MONTHLY_LIMIT }],
      ['select', ORG_FIELDS],
      ['single'],
    ])

    // The sixth attempt inside a minute is refused before any database read.
    db.reset()
    res = await claim()
    expect(res.statusCode).toBe(429)
    expect(res.json().error).toEqual({ message: 'Too many attempts. Try again in a minute.', code: 'RATE_LIMIT_EXCEEDED' })
    expect(db.calls).toHaveLength(0)

    // Database failures surface as 500s with stable codes.
    _resetMemory()
    db.reset()
    db.responses.organizations = { data: null, error: { message: 'timeout' } }
    res = await claim()
    expect(res.statusCode).toBe(500)
    expect(res.json().error.code).toBe('ORG_READ_FAILED')

    db.reset()
    db.responses.organizations = [{ data: [] }, { data: null, error: { message: 'rls' } }]
    res = await claim()
    expect(res.statusCode).toBe(500)
    expect(res.json().error.code).toBe('ORG_CREATE_FAILED')

    db.reset()
    db.responses.organizations = [{ data: [org({ plan: 'free', subscription_status: 'inactive' })] }, { data: null, error: { message: 'rls' } }]
    res = await claim()
    expect(res.statusCode).toBe(500)
    expect(res.json().error.code).toBe('ORG_UPDATE_FAILED')
  })
})
