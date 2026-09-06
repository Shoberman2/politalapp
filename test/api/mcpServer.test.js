import { describe, it, expect, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: vi.fn() } }))
vi.mock('../../api/_lib/mcpTools.js', () => ({
  findRepresentatives: vi.fn(async () => ({ senators: [] })),
  getMember: vi.fn(async ({ bioguide_id }) => (bioguide_id === 'P000197' ? { name: 'Nancy Pelosi' } : { error: 'no member' })),
  getMemberVotes: vi.fn(async () => ({ votes: [] })),
  getRollCall: vi.fn(async () => ({ error: 'No roll call' })),
  searchBills: vi.fn(async () => ({ results: [] })),
  getBill: vi.fn(async () => ({ id: '119-hr-1' })),
  explainBill: vi.fn(async () => ({ plain_english: null })),
}))

import { buildServer, TOOL_NAMES } from '../../api/mcp.js'
import handler from '../../api/mcp.js'

async function connectedClient() {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair()
  await buildServer().connect(serverT)
  const client = new Client({ name: 'test', version: '0' })
  await client.connect(clientT)
  return client
}

function res() {
  const h = new Map()
  return { statusCode: 0, body: '', headersSent: false, setHeader: (k, v) => h.set(k.toLowerCase(), v), end(b) { this.body = b || '' }, on() {}, h }
}

describe('MCP server', () => {
  it('lists the seven documented tools through the public protocol', async () => {
    const client = await connectedClient()
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort())
    expect(TOOL_NAMES).toHaveLength(7)
  })

  it('returns tool results as text and flags errors', async () => {
    const client = await connectedClient()
    const ok = await client.callTool({ name: 'get_member', arguments: { bioguide_id: 'P000197' } })
    expect(ok.isError).toBeFalsy()
    expect(JSON.parse(ok.content[0].text)).toEqual({ name: 'Nancy Pelosi' })
    const bad = await client.callTool({ name: 'get_roll_call', arguments: { congress: 119, chamber: 'house', session: 2, roll: 999999 } })
    expect(bad.isError).toBe(true)
  })

  it('rejects oversized or malformed tool input before it reaches the database', async () => {
    const client = await connectedClient()
    const tooLong = await client.callTool({ name: 'search_bills', arguments: { query: 'x'.repeat(500) } })
    expect(tooLong.isError).toBe(true)
    const badDate = await client.callTool({ name: 'get_member_votes', arguments: { bioguide_id: 'P000197', since: '2026-01' } })
    expect(badDate.isError).toBe(true)
  })

  it('serves a manifest on GET and a 405 to stream probes', async () => {
    const r = res()
    await handler({ method: 'GET', headers: {} }, r)
    expect(r.statusCode).toBe(200)
    expect(JSON.parse(r.body).tools).toEqual(TOOL_NAMES)
    const probe = res()
    await handler({ method: 'GET', headers: { accept: 'text/event-stream' } }, probe)
    expect(probe.statusCode).toBe(405)
    expect(probe.h.get('allow')).toBe('POST')
  })

  it('answers a malformed POST body with a JSON-RPC parse error', async () => {
    const r = res()
    await handler({ method: 'POST', headers: { 'x-real-ip': '198.51.100.9' }, body: '{not json' }, r)
    expect(r.statusCode).toBe(400)
    expect(JSON.parse(r.body).error.code).toBe(-32700)
  })
})
