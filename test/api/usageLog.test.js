import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({ insert: vi.fn() }))
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: () => ({ insert: m.insert }) } }))

import { logUsage } from '../../api/_lib/usage.js'

describe('logUsage', () => {
  beforeEach(() => {
    m.insert.mockReset()
    m.insert.mockImplementation(() => ({ then: (r) => { r({ error: null }); return { catch() {} } } }))
  })

  it('accepts a legacy key id string', () => {
    logUsage('k1', '/v1/bills', 'GET', 200, 5)
    expect(m.insert).toHaveBeenCalledWith({ key_id: 'k1', endpoint: '/v1/bills', method: 'GET', status_code: 200, response_ms: 5 })
  })

  it('logs anonymous requests by ip hash with a null key', () => {
    logUsage({ id: null, ipHash: 'abc' }, '/v1/bills', 'GET', 200, 5)
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ key_id: null, ip_hash: 'abc' }))
  })

  it('skips rows with no identity at all', () => {
    logUsage({ id: null }, '/v1/bills', 'GET', 200, 5)
    logUsage(null, '/v1/bills', 'GET', 200, 5)
    expect(m.insert).not.toHaveBeenCalled()
  })
})
