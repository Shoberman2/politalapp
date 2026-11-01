import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '../fixtures/supabaseChain.js'

const db = makeSupabaseMock()
const getUser = vi.fn()
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: (t) => db.from(t), auth: { getUser: (...a) => getUser(...a) } } }))

const getBill = vi.fn()
vi.mock('../../api/_lib/mcpTools.js', () => ({
  searchBills: vi.fn(), getBill: (...a) => getBill(...a), explainBill: vi.fn(), getMember: vi.fn(),
  getMemberVotes: vi.fn(), getRollCall: vi.fn(), getFloorSchedule: vi.fn(), findRepresentatives: vi.fn(),
}))

import handler, { answerQuestion, collectSources, hasProEntitlement, SYSTEM_PROMPT } from '../../api/ask.js'

const post = (body, token) => handler(new Request('https://www.ballotwatch.io/api/ask', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
}))

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

describe('POST /api/ask', () => {
  beforeEach(() => { db.reset(); getUser.mockReset(); getBill.mockReset(); delete process.env.REVENUECAT_SECRET_KEY })

  it('needs a signed-in account', async () => {
    expect((await post({ question: 'What is cloture?' })).status).toBe(401)
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } })
    expect((await post({ question: 'What is cloture?' }, 'nope')).status).toBe(401)
  })

  it('rejects an empty or oversized question', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null })
    expect((await post({ question: '  ' }, 'tok')).status).toBe(400)
    expect((await post({ question: 'x'.repeat(501) }, 'tok')).status).toBe(400)
  })
})

describe('hasProEntitlement', () => {
  it('is null without a RevenueCat key, so the route stays usable', async () => {
    expect(await hasProEntitlement('u-1', { key: '' })).toBeNull()
  })

  it('reads the "pro" entitlement and its expiry', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const past = new Date(Date.now() - 86_400_000).toISOString()
    const f = (ent) => vi.fn().mockResolvedValue(json(200, { subscriber: { entitlements: ent } }))
    expect(await hasProEntitlement('u-1', { key: 'sk', fetchImpl: f({ pro: { expires_date: future } }) })).toBe(true)
    expect(await hasProEntitlement('u-1', { key: 'sk', fetchImpl: f({ pro: { expires_date: past } }) })).toBe(false)
    expect(await hasProEntitlement('u-1', { key: 'sk', fetchImpl: f({}) })).toBe(false)
    expect(await hasProEntitlement('u-1', { key: 'sk', fetchImpl: vi.fn().mockResolvedValue(json(404, {})) })).toBe(false)
  })
})

describe('answerQuestion', () => {
  it('answers from tool results and returns their sources', async () => {
    process.env.OPENAI_API_KEY = 'test'
    getBill.mockResolvedValue({ title: 'Delivery Times Act', canonical: 'https://www.ballotwatch.io/bill/119/hr/12', source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/12' })
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(200, { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_bill', arguments: '{"id":"119-hr-12"}' } }] } }] }))
      .mockResolvedValueOnce(json(200, { choices: [{ message: { role: 'assistant', content: 'It requires monthly reports \u2014 posted online.' } }] }))
    const out = await answerQuestion('What does HR 12 do?', [], { fetchImpl })
    expect(getBill).toHaveBeenCalledWith({ id: '119-hr-12' })
    expect(out.answer).toBe('It requires monthly reports, posted online.')
    expect(out.sources.map((s) => s.url)).toEqual([
      'https://www.congress.gov/bill/119th-congress/house-bill/12',
      'https://www.ballotwatch.io/bill/119/hr/12',
    ])
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(sent.messages[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT })
  })

  it('keeps the prompt neutral and the disclaimer in it', () => {
    expect(SYSTEM_PROMPT).toMatch(/strictly neutral/i)
    expect(SYSTEM_PROMPT).toMatch(/not affiliated with any government entity/)
  })
})

describe('collectSources', () => {
  it('dedupes and labels URLs found anywhere in a result', () => {
    const out = collectSources({ votes: [{ question: 'On passage', source_url: 'https://clerk.house.gov/Votes/2026101' }, { source_url: 'https://clerk.house.gov/Votes/2026101' }], canonical: 'http://insecure.example' })
    expect([...out.values()]).toEqual([{ title: 'On passage · clerk.house.gov', url: 'https://clerk.house.gov/Votes/2026101' }])
  })
})
