// BallotWatch MCP server: stateless Streamable HTTP on the Node runtime.
// One request, one JSON-RPC exchange, no session store. Tools live in
// api/_lib/mcpTools.js. Reachable at /mcp (rewrite) and /api/mcp. Rate limited
// per IP with the same budget as anonymous API access, so it is not a second
// door around /api/v1 limits.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { readJsonBody, getHeader } from './_lib/request.js'
import { checkRateLimit } from './_lib/rateLimit.js'
import { clientIp, hashIp, ANON_PER_MINUTE, ANON_PER_DAY } from './_lib/auth.js'
import { SITE_ORIGIN } from './_lib/site.js'
import * as tools from './_lib/mcpTools.js'

export const INSTRUCTIONS = `BallotWatch serves the U.S. congressional record: members, roll-call votes, bills, and the House weekly floor schedule, sourced from Congress.gov, the House Clerk, and the Senate. Every result includes a canonical BallotWatch URL and an official source_url; cite both. Results are the record as ingested (see data_updated_at), not analysis. Roll-call "result_derived" is computed from the tally and question. Bill ids look like 119-hr-1.`

// Name and version the server reports on initialize; the server card
// (public/.well-known/mcp/server-card.json, scripts/build-llms-full.mjs) reads them too.
export const SERVER_INFO = { name: 'ballotwatch', version: '1.0.0' }

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

// One list drives registration, the discovery document, and the tests.
export const TOOLS = [
  {
    name: 'find_representatives',
    title: 'Find representatives',
    description: 'Resolve a U.S. street address or ZIP code to its two senators and House member. Addresses resolve to an exact district; a ZIP resolves by centroid and may span districts.',
    inputSchema: { address: z.string().max(200).optional().describe('Full street address'), zip: z.string().max(10).optional().describe('5-digit ZIP code') },
    run: tools.findRepresentatives,
  },
  {
    name: 'get_member',
    title: 'Get member',
    description: 'A member of Congress by Bioguide ID: seat, party, terms, vote statistics, and latest votes.',
    inputSchema: { bioguide_id: z.string().max(7).describe('Bioguide ID, e.g. P000197') },
    run: tools.getMember,
  },
  {
    name: 'get_member_votes',
    title: 'Get member votes',
    description: 'Recorded votes for a member, newest first, with the question, bill, position, and official source.',
    inputSchema: { bioguide_id: z.string().max(7), since: DATE.optional().describe('YYYY-MM-DD'), limit: z.number().int().min(1).max(100).optional() },
    run: tools.getMemberVotes,
  },
  {
    name: 'get_roll_call',
    title: 'Get roll call',
    description: 'One roll-call vote with the tally, party split, derived result, and how every member voted.',
    inputSchema: { congress: z.number().int().min(1).max(200), chamber: z.enum(['house', 'senate']), session: z.number().int().min(1).max(3), roll: z.number().int().min(1).max(5000) },
    run: tools.getRollCall,
  },
  {
    name: 'search_bills',
    title: 'Search bills',
    description: 'Search bills by title keyword or bill number (e.g. "H.R. 1", "119-s-5051").',
    inputSchema: { query: z.string().min(1).max(100), limit: z.number().int().min(1).max(50).optional() },
    run: tools.searchBills,
  },
  {
    name: 'get_bill',
    title: 'Get bill',
    description: 'A bill with sponsor, stage, official CRS summary, and every recorded floor vote.',
    inputSchema: { id: z.string().max(40).describe('119-hr-1 or "H.R. 1"') },
    run: tools.getBill,
  },
  {
    name: 'explain_bill',
    title: 'Explain bill',
    description: 'The cached plain-English explanation of a bill, grounded in the official CRS summary. Returns the official summary when no explanation is cached. Never generates text on demand.',
    inputSchema: { id: z.string().max(40) },
    run: tools.explainBill,
  },
  {
    name: 'get_floor_schedule',
    title: 'Get House floor schedule',
    description: 'What the House may take up this week and next (or the week containing a given date), read live from the Majority Leader\'s schedule on docs.house.gov: each item\'s label, title, procedure, and bill page. Use for "what is Congress voting on this week". House only; the Senate publishes no equivalent. Cite each week\'s source_url.',
    inputSchema: { week: DATE.optional().describe('YYYY-MM-DD, any day of the week (normally the Monday). Omit for this week and next.') },
    run: tools.getFloorSchedule,
  },
  {
    name: 'get_member_record',
    title: 'Get member record',
    description: 'A member\'s record in 60 seconds: seat, serving since, roll calls and votes cast / not voting this Congress, and the ten most recent votes with position and a link to each roll call. Use for a quick, neutral summary of how a member votes. Cite the record canonical URL and each vote\'s source_url.',
    inputSchema: { bioguide_id: z.string().max(7).describe('Bioguide ID, e.g. P000197') },
    run: tools.getMemberRecord,
  },
]

export const TOOL_NAMES = TOOLS.map((t) => t.name)

function text(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 1) }], isError: Boolean(obj && obj.error) }
}

export function buildServer() {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS })
  for (const t of TOOLS) {
    server.registerTool(t.name, { title: t.title, description: t.description, inputSchema: t.inputSchema }, async (args) => {
      try {
        return text(await t.run(args))
      } catch (err) {
        console.error(`[mcp] ${t.name} failed:`, err?.message)
        return text({ error: 'Lookup failed; try again shortly.' })
      }
    })
  }
  return server
}

function sendJson(res, status, body, extra = {}) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v)
  res.end(JSON.stringify(body))
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization')
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id')
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }

  if (req.method === 'GET') {
    // An MCP client probing for a server-initiated stream gets the
    // spec-mandated 405; a person or agent reading the URL gets the manifest.
    if (/text\/event-stream/i.test(getHeader(req, 'accept'))) {
      res.statusCode = 405
      res.setHeader('Allow', 'POST')
      return res.end()
    }
    return sendJson(res, 200, {
      name: 'ballotwatch',
      transport: 'streamable-http',
      endpoint: `${SITE_ORIGIN}/mcp`,
      usage: 'POST JSON-RPC 2.0 messages to this URL with headers Content-Type: application/json and Accept: application/json, text/event-stream. Stateless: no session required.',
      tools: TOOL_NAMES,
      limits: `${ANON_PER_MINUTE} requests per minute and ${ANON_PER_DAY} per day per IP`,
      docs: `${SITE_ORIGIN}/llms.txt`,
      server_card: `${SITE_ORIGIN}/.well-known/mcp/server-card.json`,
      open_data: `${SITE_ORIGIN}/data/full/manifest.json`,
    }, { 'Cache-Control': 'public, s-maxage=3600' })
  }

  // Same bucket as anonymous /api/v1 access, so /mcp is not a second budget.
  const rl = await checkRateLimit({ id: `ip:${hashIp(clientIp(req))}`, perMinute: ANON_PER_MINUTE, perDay: ANON_PER_DAY })
  if (!rl.allowed) {
    return sendJson(res, 429, { jsonrpc: '2.0', error: { code: -32000, message: `Rate limit reached (${rl.limit} per ${rl.window}). Retry after ${rl.retryAfter}s.` }, id: null }, { 'Retry-After': String(rl.retryAfter || 60) })
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch {
    return sendJson(res, 400, { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null })
  }

  const server = buildServer()
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}) })
  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, body)
  } catch (err) {
    console.error('[mcp] request failed:', err.message)
    if (!res.headersSent) sendJson(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null })
  }
}

export const config = { runtime: 'nodejs', maxDuration: 30 }
