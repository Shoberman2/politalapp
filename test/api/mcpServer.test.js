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
  getFloorSchedule: vi.fn(async ({ week } = {}) => ({ weeks: week ? [{ week }] : [] })),
  getMemberRecord: vi.fn(async ({ bioguide_id }) => (bioguide_id === 'P000197' ? { name: 'Nancy Pelosi', canonical: 'https://www.ballotwatch.io/politician/P000197/record' } : { error: `No member with Bioguide ID ${bioguide_id}` })),
  searchMembers: vi.fn(async ({ query }) => ({ query, members: [{ bioguide_id: 'S000148', name: 'Charles Schumer' }] })),
  getMemberBills: vi.fn(async () => ({ sponsored: { total: 0, bills: [] } })),
  compareMembers: vi.fn(async () => ({ same_vote_pct: 50 })),
  getRecentVotes: vi.fn(async (args) => ({ args, votes: [] })),
  search: vi.fn(async ({ query }) => ({ results: query === 'boom' ? [{ id: 1 }] : [{ id: 'member:P000197', title: 'Nancy Pelosi', url: 'https://www.ballotwatch.io/politician/P000197-nancy-pelosi' }] })),
  fetchDocument: vi.fn(async ({ id }) => (id === 'member:P000197' ? { id, title: 'Nancy Pelosi', text: '# Nancy Pelosi', url: 'https://www.ballotwatch.io/politician/P000197-nancy-pelosi', metadata: { type: 'member' } } : { error: 'Unknown id.' })),
  BILL_STAGES: ['introduced', 'enacted'],
}))

import { buildServer, TOOL_NAMES, PROMPTS, SERVER_INFO, TOOLS, toolAnnotations } from '../../api/mcp.js'
import handler from '../../api/mcp.js'
import { getMemberVotes } from '../../api/_lib/mcpTools.js'

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
  it('lists the fifteen documented tools through the public protocol', async () => {
    const client = await connectedClient()
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort())
    expect(TOOL_NAMES).toHaveLength(15)
    expect(TOOL_NAMES).toEqual(expect.arrayContaining([
      'find_representatives', 'get_member', 'get_member_votes', 'get_roll_call', 'search_bills', 'get_bill', 'explain_bill', 'get_floor_schedule', 'get_member_record',
      'search_members', 'get_member_bills', 'compare_members', 'get_recent_votes', 'search', 'fetch',
    ]))
  })

  it('serves search as structured content and JSON text, and fetch as JSON text alone', async () => {
    const client = await connectedClient()
    const { tools } = await client.listTools()
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]))
    expect(byName.search.inputSchema.required).toEqual(['query'])
    expect(byName.search.outputSchema.properties.results.items.required).toEqual(['id', 'title', 'url'])
    expect(byName.fetch.inputSchema.required).toEqual(['id'])
    expect(byName.fetch.outputSchema).toBeUndefined()
    expect(tools.filter((t) => t.outputSchema).map((t) => t.name)).toEqual(['search'])

    const found = await client.callTool({ name: 'search', arguments: { query: 'Nancy Pelosi' } })
    expect(found.isError).toBeFalsy()
    expect(found.structuredContent).toEqual({ results: [{ id: 'member:P000197', title: 'Nancy Pelosi', url: 'https://www.ballotwatch.io/politician/P000197-nancy-pelosi' }] })
    expect(JSON.parse(found.content[0].text)).toEqual(found.structuredContent)

    const doc = await client.callTool({ name: 'fetch', arguments: { id: 'member:P000197' } })
    expect(doc.isError).toBeFalsy()
    expect(doc.structuredContent).toBeUndefined()
    expect(doc.content.map((c) => c.type)).toEqual(['text'])
    expect(JSON.parse(doc.content[0].text)).toEqual({ id: 'member:P000197', title: 'Nancy Pelosi', text: '# Nancy Pelosi', url: 'https://www.ballotwatch.io/politician/P000197-nancy-pelosi', metadata: { type: 'member' } })

    // An error carries no structured content and is flagged, not thrown.
    const missing = await client.callTool({ name: 'fetch', arguments: { id: 'nope' } })
    expect(missing.isError).toBe(true)
    expect(missing.structuredContent).toBeUndefined()
    // Other tools still return text only.
    expect((await client.callTool({ name: 'get_member', arguments: { bioguide_id: 'P000197' } })).structuredContent).toBeUndefined()
  })

  it('marks every tool read-only with a title, so clients can run them without a confirmation step', async () => {
    const client = await connectedClient()
    const { tools } = await client.listTools()
    for (const t of tools) {
      expect(t.title, t.name).toBeTruthy()
      expect(t.description.length, t.name).toBeGreaterThan(40)
      const expected = { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: ['find_representatives', 'get_floor_schedule'].includes(t.name) }
      expect(t.annotations, t.name).toEqual(expected)
      expect(toolAnnotations(TOOLS.find(({ name }) => name === t.name)), t.name).toEqual(expected)
      expect(t.inputSchema.type).toBe('object')
    }
    expect(client.getServerVersion()).toMatchObject({ name: 'ballotwatch', title: 'BallotWatch', version: SERVER_INFO.version, websiteUrl: 'https://www.ballotwatch.io' })
    expect(client.getInstructions()).toMatch(/search_members/)
  })

  it('offers prompts that name the tools to use and ask for citations', async () => {
    const client = await connectedClient()
    const { prompts } = await client.listPrompts()
    expect(prompts.map((p) => p.name)).toEqual(PROMPTS.map((p) => p.name))
    expect(prompts.map((p) => p.name)).toEqual(['my_representatives', 'member_record', 'how_did_they_vote', 'this_week_in_congress', 'explain_a_bill'])
    const vote = await client.getPrompt({ name: 'how_did_they_vote', arguments: { member: 'Nancy Pelosi', bill: 'H.R. 1' } })
    expect(vote.messages).toHaveLength(1)
    expect(vote.messages[0].role).toBe('user')
    expect(vote.messages[0].content.text).toMatch(/How did Nancy Pelosi vote on H\.R\. 1\?.*search_members.*get_member_votes.*source_url/s)
    const week = await client.getPrompt({ name: 'this_week_in_congress' })
    expect(week.messages[0].content.text).toMatch(/get_floor_schedule.*get_recent_votes/s)
    // Every tool a prompt names exists.
    for (const p of PROMPTS) {
      const args = Object.fromEntries(Object.keys(p.argsSchema).map((k) => [k, 'x']))
      for (const name of p.text(args).match(/\b(?:find|search|get|explain|compare)_[a-z_]+/g) || []) expect(TOOL_NAMES, `${p.name} names ${name}`).toContain(name)
    }
  })

  it('serves the new lookup tools and validates their arguments', async () => {
    const client = await connectedClient()
    const found = await client.callTool({ name: 'search_members', arguments: { query: 'Chuck Schumer' } })
    expect(found.isError).toBeFalsy()
    expect(JSON.parse(found.content[0].text).members[0].bioguide_id).toBe('S000148')
    const recent = await client.callTool({ name: 'get_recent_votes', arguments: { chamber: 'senate', since: '2026-11-01', limit: 5 } })
    expect(JSON.parse(recent.content[0].text).args).toEqual({ chamber: 'senate', since: '2026-11-01', limit: 5 })
    expect((await client.callTool({ name: 'get_recent_votes', arguments: { chamber: 'lords' } })).isError).toBe(true)
    expect((await client.callTool({ name: 'get_recent_votes', arguments: { limit: 500 } })).isError).toBe(true)
    expect((await client.callTool({ name: 'search_members', arguments: { limit: 0 } })).isError).toBe(true)
    expect((await client.callTool({ name: 'get_roll_call', arguments: { congress: 119, chamber: 'house', session: 1, roll: 1, position: 'Maybe' } })).isError).toBe(true)
    expect((await client.callTool({ name: 'search_bills', arguments: { query: 'x', stage: 'pending' } })).isError).toBe(true)
    expect((await client.callTool({ name: 'compare_members', arguments: { bioguide_id_a: 'S000148' } })).isError).toBe(true)
  })

  it('documents every tool in llms.txt and the README', async () => {
    const { readFileSync } = await import('fs')
    const llms = readFileSync('public/llms.txt', 'utf8')
    const readme = readFileSync('README.md', 'utf8')
    for (const name of TOOL_NAMES) {
      expect(llms).toContain(name)
      expect(readme).toContain(`\`${name}\``)
    }
  })

  it('serves the floor schedule and member record tools, flagging an unknown member', async () => {
    const client = await connectedClient()
    const sched = await client.callTool({ name: 'get_floor_schedule', arguments: { week: '2026-09-14' } })
    expect(sched.isError).toBeFalsy()
    expect(JSON.parse(sched.content[0].text).weeks).toEqual([{ week: '2026-09-14' }])
    const badWeek = await client.callTool({ name: 'get_floor_schedule', arguments: { week: 'next' } })
    expect(badWeek.isError).toBe(true)
    const rec = await client.callTool({ name: 'get_member_record', arguments: { bioguide_id: 'P000197' } })
    expect(JSON.parse(rec.content[0].text).canonical).toMatch(/\/politician\/P000197\/record$/)
    const missing = await client.callTool({ name: 'get_member_record', arguments: { bioguide_id: 'Z999999' } })
    expect(missing.isError).toBe(true)
    expect(JSON.parse(missing.content[0].text).error).toContain('Z999999')
  })

  it('returns tool results as text and flags errors', async () => {
    const client = await connectedClient()
    const ok = await client.callTool({ name: 'get_member', arguments: { bioguide_id: 'P000197' } })
    expect(ok.isError).toBeFalsy()
    expect(JSON.parse(ok.content[0].text)).toEqual({ name: 'Nancy Pelosi' })
    // Compact JSON: no indentation spent on an agent's context window.
    expect(ok.content[0].text).toBe('{"name":"Nancy Pelosi"}')
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

  it('rejects impossible calendar dates at the protocol boundary and documents the vote limit', async () => {
    const client = await connectedClient()
    const { tools } = await client.listTools()
    expect(tools.find((t) => t.name === 'get_member_votes').inputSchema.properties.limit.description).toBe('Default 25')
    getMemberVotes.mockClear()
    const invalid = await client.callTool({ name: 'get_member_votes', arguments: { bioguide_id: 'P000197', since: '2026-02-30' } })
    expect(invalid.isError).toBe(true)
    expect(getMemberVotes).not.toHaveBeenCalled()
    const valid = await client.callTool({ name: 'get_member_votes', arguments: { bioguide_id: 'P000197', since: '2024-02-29' } })
    expect(valid.isError).toBeFalsy()
    expect(getMemberVotes).toHaveBeenCalledExactlyOnceWith({ bioguide_id: 'P000197', since: '2024-02-29' })
  })

  it('serves a manifest on GET and a 405 to stream probes', async () => {
    const r = res()
    await handler({ method: 'GET', headers: {} }, r)
    expect(r.statusCode).toBe(200)
    expect(JSON.parse(r.body).tools).toEqual(TOOL_NAMES)
    expect(JSON.parse(r.body).prompts).toEqual(PROMPTS.map((p) => p.name))
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
