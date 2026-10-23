import { describe, it, expect, vi, afterEach } from 'vitest'
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: () => { throw new Error('no db in this test') } } }))

import { classifyAgent, classifyClient, agentSurface } from '../../shared/agents.js'
import middleware, { agentEventFor } from '../../middleware.js'
import { mcpEvents } from '../../api/mcp.js'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'

describe('agent classification', () => {
  it('names AI agents by operator and purpose', () => {
    expect(classifyAgent('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)')).toEqual({ agent: 'ClaudeBot', operator: 'Anthropic', purpose: 'training' })
    expect(classifyAgent('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot')).toMatchObject({ agent: 'ChatGPT-User', purpose: 'user' })
    expect(classifyAgent('Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)')).toMatchObject({ agent: 'OAI-SearchBot', purpose: 'search' })
    expect(classifyAgent('Mozilla/5.0 (compatible; Perplexity-User/1.0)')).toMatchObject({ operator: 'Perplexity', purpose: 'user' })
    expect(classifyAgent(CHROME)).toBeNull()
    expect(classifyAgent('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBeNull()   // a search engine, not an AI agent
  })

  it('names scripts and SDKs but never browsers', () => {
    expect(classifyClient('curl/8.4.0')).toMatchObject({ agent: 'curl', purpose: 'client' })
    expect(classifyClient('python-httpx/0.27.0')).toMatchObject({ agent: 'python-httpx' })
    expect(classifyClient('')).toMatchObject({ agent: 'no user-agent' })
    expect(classifyClient('MyAgent/2.0 (+https://example.com)')).toMatchObject({ agent: 'MyAgent' })
    expect(classifyClient(CHROME)).toBeNull()
  })

  it('knows the agent surfaces', () => {
    expect(agentSurface('/mcp')).toBe('mcp')
    expect(agentSurface('/api/v1/bills')).toBe('api')
    expect(agentSurface('/llms-full.txt')).toBe('file')
    expect(agentSurface('/data/full/manifest.json')).toBe('file')
    expect(agentSurface('/bill/119/hr/1')).toBeNull()
    expect(agentSurface('/api/proxy/congress/bill')).toBeNull()
  })
})

describe('middleware agent events', () => {
  const req = (path, ua, init = {}) => new Request(`https://www.ballotwatch.io${path}`, { ...init, headers: { 'user-agent': ua, 'x-vercel-ip-country': 'US', ...(init.headers || {}) } })

  it('logs AI agents on pages and any client on agent surfaces, never browsers', () => {
    expect(agentEventFor(req('/bill/119/hr/1', 'Mozilla/5.0 (compatible; GPTBot/1.2)'))).toMatchObject({ surface: 'page', path: '/bill/119/hr/1', who: { agent: 'GPTBot' }, country: 'US' })
    expect(agentEventFor(req('/bill/119/hr/1', 'curl/8.4.0'))).toBeNull()             // a script on a page: not an agent surface
    expect(agentEventFor(req('/api/v1/votes?limit=5', 'curl/8.4.0'))).toMatchObject({ surface: 'api', path: '/api/v1/votes?limit=5', who: { agent: 'curl' } })
    expect(agentEventFor(req('/api/v1/floor/schedule', CHROME))).toBeNull()            // the website's own call
    expect(agentEventFor(req('/mcp', 'node', { method: 'POST' }))).toBeNull()          // api/mcp.js logs these, with the tool
    expect(agentEventFor(req('/mcp', 'node'))).toMatchObject({ surface: 'mcp', who: { agent: 'node' } })
    expect(agentEventFor(req('/', 'Mozilla/5.0 (compatible; ClaudeBot/1.0)', { headers: { accept: 'text/markdown' } }))).toMatchObject({ detail: { accept: 'markdown' } })
  })

  it('writes the row after the response and still rewrites the homepage', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://db.example')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const pending = []
    const res = middleware(req('/', 'Mozilla/5.0 (compatible; ClaudeBot/1.0)', { headers: { 'x-vercel-forwarded-for': '1.2.3.4' } }), { waitUntil: (p) => pending.push(p) })
    expect(res.headers.get('x-middleware-rewrite')).toBe('https://www.ballotwatch.io/api/prerender?kind=home')
    expect(pending).toHaveLength(1)
    await Promise.all(pending)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://db.example/rest/v1/agent_events')
    const row = JSON.parse(init.body)
    expect(row).toMatchObject({ surface: 'page', event: 'request', path: '/', agent: 'ClaudeBot', operator: 'Anthropic', purpose: 'training', country: 'US' })
    expect(row.ip_hash).toMatch(/^[0-9a-f]{32}$/)
    expect(JSON.stringify(row)).not.toContain('1.2.3.4')

    // A browser page view writes nothing.
    pending.length = 0
    expect(middleware(req('/bills', CHROME), { waitUntil: (p) => pending.push(p) })).toBeUndefined()
    expect(pending).toHaveLength(0)
  })

  // Production defines only VITE_SUPABASE_URL.
  it('falls back to VITE_SUPABASE_URL', async () => {
    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_URL', 'https://vite.example')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const pending = []
    middleware(req('/bill/119/hr/1', 'Mozilla/5.0 (compatible; GPTBot/1.2)'), { waitUntil: (p) => pending.push(p) })
    await Promise.all(pending)
    expect(fetchMock.mock.calls[0][0]).toBe('https://vite.example/rest/v1/agent_events')
  })
})

describe('MCP events', () => {
  it('records initialize with the client name, and each tool call with its outcome', () => {
    const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'claude-ai', version: '1.0' } } }
    const [e] = mcpEvents(init, [], { userAgent: CHROME })
    expect(e).toMatchObject({ event: 'mcp_initialize', who: { agent: 'claude-ai', purpose: 'client' }, detail: { client: { name: 'claude-ai' }, protocol: '2025-06-18' } })

    const call = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_bill', arguments: { id: '119-hr-1' } } }
    const events = mcpEvents(call, [{ tool: 'get_bill', args: { id: '119-hr-1', huge: { a: 1 } }, ok: true, ms: 40 }], { userAgent: 'Claude-User' })
    expect(events).toEqual([{ event: 'mcp_tool', who: { agent: 'Claude-User', operator: 'Anthropic', purpose: 'user' }, tool: 'get_bill', detail: { args: { id: '119-hr-1' }, ok: true, ms: 40 } }])
  })
})
