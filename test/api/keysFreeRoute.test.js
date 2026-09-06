import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn() }))
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { auth: { getUser: m.getUser }, from: m.from } }))

import handler from '../../api/keys/free.js'
import { _resetMemory } from '../../api/_lib/rateLimit.js'

function res() {
  const h = new Map()
  return { statusCode: 0, body: '', setHeader: (k, v) => h.set(k.toLowerCase(), v), end(b) { this.body = b || '' }, h }
}

function orgTable({ existing, updated, created }) {
  const update = vi.fn(() => ({ eq: () => ({ select: () => ({ single: async () => ({ data: updated, error: null }) }) }) }))
  const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: created, error: null }) }) }))
  const table = {
    select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: existing ? [existing] : [], error: null }) }) }) }),
    update,
    insert,
  }
  m.from.mockReturnValue(table)
  return { update, insert }
}

const post = (headers = { authorization: 'Bearer tok' }) => ({ method: 'POST', headers })

describe('POST /api/keys/free', () => {
  beforeEach(() => {
    _resetMemory()
    m.getUser.mockReset(); m.from.mockReset()
    m.getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.c' } }, error: null })
  })

  it('401 without a session token', async () => {
    const r = res(); await handler(post({}), r)
    expect(r.statusCode).toBe(401)
  })

  it('405 for GET', async () => {
    const r = res(); await handler({ method: 'GET', headers: {} }, r)
    expect(r.statusCode).toBe(405)
  })

  it('401 when the session is invalid', async () => {
    m.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } })
    const r = res(); await handler(post(), r)
    expect(r.statusCode).toBe(401)
  })

  it('creates a free organization when the user has none', async () => {
    const created = { id: 'o1', plan: 'free', subscription_status: 'active', subscription_id: null, monthly_limit: 0 }
    const { insert } = orgTable({ existing: null, created })
    const r = res(); await handler(post(), r)
    expect(r.statusCode).toBe(200)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ owner_id: 'user-1', plan: 'free', subscription_status: 'active', monthly_limit: 0 }))
    expect(JSON.parse(r.body).meta.created).toBe(true)
  })

  it('never downgrades an active or past-due paid plan', async () => {
    for (const status of ['active', 'past_due']) {
      const { update } = orgTable({ existing: { id: 'o1', plan: 'pro', subscription_status: status, subscription_id: 'sub_1', monthly_limit: 100000 } })
      const r = res(); await handler(post(), r)
      expect(JSON.parse(r.body).meta.unchanged).toBe(true)
      expect(update).not.toHaveBeenCalled()
    }
  })

  it('activates free for a canceled organization and clears the stale subscription id', async () => {
    const updated = { id: 'o1', plan: 'free', subscription_status: 'active', subscription_id: null, monthly_limit: 0 }
    const { update } = orgTable({ existing: { id: 'o1', plan: 'starter', subscription_status: 'canceled', subscription_id: 'sub_old', monthly_limit: 10000 }, updated })
    const r = res(); await handler(post(), r)
    expect(r.statusCode).toBe(200)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ plan: 'free', subscription_status: 'active', monthly_limit: 0, subscription_id: null }))
  })

  it('is idempotent for an organization already on free', async () => {
    const { update } = orgTable({ existing: { id: 'o1', plan: 'free', subscription_status: 'active', subscription_id: null, monthly_limit: 0 } })
    const r = res(); await handler(post(), r)
    expect(JSON.parse(r.body).meta.unchanged).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it('uses the existing organization when it loses the creation race', async () => {
    const existing = { id: 'o-existing', plan: 'free', subscription_status: 'active', subscription_id: null, monthly_limit: 0 }
    let reads = 0
    const table = {
      select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: reads++ === 0 ? [] : [existing], error: null }) }) }) }),
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }) }) }),
      update: vi.fn(),
    }
    m.from.mockReturnValue(table)
    const r = res(); await handler(post(), r)
    expect(r.statusCode).toBe(200)
    expect(JSON.parse(r.body)).toMatchObject({ data: existing, meta: { raced: true } })
  })

  it('rate limits repeated attempts per user', async () => {
    orgTable({ existing: { id: 'o1', plan: 'free', subscription_status: 'active', subscription_id: null, monthly_limit: 0 } })
    let last
    for (let i = 0; i < 6; i += 1) { last = res(); await handler(post(), last) }
    expect(last.statusCode).toBe(429)
  })
})
