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
import { classifyClient } from '../shared/agents.js'
import { logAgentEvent } from '../shared/agentLog.js'

export const INSTRUCTIONS = `BallotWatch serves the U.S. congressional record: members, roll-call votes, bills, and the House weekly floor schedule, sourced from Congress.gov, the House Clerk, and the Senate. Every result includes a canonical BallotWatch URL and an official source_url; cite both. Results are the record as ingested (see data_updated_at), not analysis. Roll-call "result_derived" is computed from the tally and question. Bill ids look like 119-hr-1. Members are addressed by Bioguide ID (e.g. P000197): get one from a name with search_members, or from an address or ZIP code with find_representatives. Recorded votes cover the 119th Congress (January 2025 onward).`

// Name and version the server reports on initialize; the server card
// (public/.well-known/mcp/server-card.json, scripts/build-llms-full.mjs) reads them too.
export const SERVER_INFO = {
  name: 'ballotwatch',
  title: 'BallotWatch',
  version: '1.1.0',
  websiteUrl: SITE_ORIGIN,
  icons: [
    { src: `${SITE_ORIGIN}/favicon.svg`, mimeType: 'image/svg+xml', sizes: ['any'] },
    { src: `${SITE_ORIGIN}/apple-touch-icon.png`, mimeType: 'image/png', sizes: ['180x180'] },
  ],
}

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
const BIOGUIDE = z.string().max(7).describe('Bioguide ID, e.g. P000197')
const CHAMBER = z.enum(['house', 'senate'])
const POSITION = z.enum(['Yea', 'Nay', 'Present', 'Not Voting'])
const STATE = z.string().max(30).describe('State or territory, by name or two-letter code, e.g. "Ohio" or "OH"')
const PARTY = z.string().max(20).describe('D, R or I (or Democrat, Republican, Independent)')

// Every tool only reads the public record.
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }

// One list drives registration, the discovery document, and the tests.
export const TOOLS = [
  {
    name: 'find_representatives',
    title: 'Find representatives',
    description: 'Resolve a U.S. street address or ZIP code to its two senators and House member, sitting members only. An address resolves to one exact district. A ZIP code that spans districts returns every district it touches (location.districts) and the member for each, so ask for a street address when the answer must be exact.',
    inputSchema: { address: z.string().max(200).optional().describe('Full street address'), zip: z.string().max(10).optional().describe('5-digit ZIP code') },
    run: tools.findRepresentatives,
  },
  {
    name: 'search_members',
    title: 'Search members',
    description: 'Find members of Congress by name, or list them by state, chamber or party. Use this first to turn a name such as "Chuck Schumer" or "AOC" into the Bioguide ID the other tools need. Nicknames, titles and close spellings are accepted. A name search also returns members who left during this Congress, marked serving: false; a list without a name shows sitting members only unless include_former is true.',
    inputSchema: {
      query: z.string().max(100).optional().describe('Full or partial name, e.g. "Pelosi" or "Sen. Ted Cruz". Omit to list by the filters.'),
      state: STATE.optional(),
      chamber: CHAMBER.optional(),
      party: PARTY.optional(),
      include_former: z.boolean().optional().describe('Also list members who left during this Congress when no name is given'),
      limit: z.number().int().min(1).max(60).optional().describe('Default 20'),
    },
    run: tools.searchMembers,
  },
  {
    name: 'get_member',
    title: 'Get member',
    description: 'A member of Congress by Bioguide ID: seat, party, whether they are serving now, terms, vote statistics, and their ten latest votes.',
    inputSchema: { bioguide_id: BIOGUIDE },
    run: tools.getMember,
  },
  {
    name: 'get_member_record',
    title: 'Get member record',
    description: 'A member\'s record in 60 seconds: seat, serving since, roll calls and votes cast / not voting this Congress, and the ten most recent votes with position and a link to each roll call. Use for a quick, neutral summary of how a member votes. Cite the record canonical URL and each vote\'s source_url.',
    inputSchema: { bioguide_id: BIOGUIDE },
    run: tools.getMemberRecord,
  },
  {
    name: 'get_member_votes',
    title: 'Get member votes',
    description: 'Recorded votes for a member, newest first, with the question, bill, position, and official source. Pass bill to answer "how did this member vote on H.R. 1" (every roll call on that bill), position to list only their Nay or Not Voting votes, and since / until for a date range. Page with offset.',
    inputSchema: {
      bioguide_id: BIOGUIDE,
      bill: z.string().max(40).optional().describe('Only votes on this bill: 119-hr-1 or "H.R. 1"'),
      position: POSITION.optional(),
      since: DATE.optional().describe('YYYY-MM-DD, inclusive'),
      until: DATE.optional().describe('YYYY-MM-DD, inclusive'),
      limit: z.number().int().min(1).max(100).optional().describe('Default 50'),
      offset: z.number().int().min(0).max(100000).optional().describe('Skip this many votes (for the next page)'),
    },
    run: tools.getMemberVotes,
  },
  {
    name: 'get_member_bills',
    title: 'Get member bills',
    description: 'Bills a member sponsored (the newest 20) and cosponsored (the newest 10), with totals. The lists can be incomplete; each result links the member\'s full list on Congress.gov.',
    inputSchema: { bioguide_id: BIOGUIDE },
    run: tools.getMemberBills,
  },
  {
    name: 'compare_members',
    title: 'Compare two members',
    description: 'How often two members of the same chamber voted the same way this Congress: the roll calls both voted Yea or Nay on, how many matched, and their ten most recent differing votes. A plain count over the whole record, not a score.',
    inputSchema: { bioguide_id_a: BIOGUIDE, bioguide_id_b: BIOGUIDE },
    run: tools.compareMembers,
  },
  {
    name: 'get_recent_votes',
    title: 'Get recent votes',
    description: 'Roll-call votes, newest first, with the question, bill, tally, party split and derived result. Use for "what did Congress vote on this week" or to find a roll call before calling get_roll_call. Filter by chamber, date range, bill, or words in the question, description or bill title (query "nomination", "appropriations", "H.R. 1").',
    inputSchema: {
      chamber: CHAMBER.optional(),
      since: DATE.optional().describe('YYYY-MM-DD, inclusive'),
      until: DATE.optional().describe('YYYY-MM-DD, inclusive'),
      bill: z.string().max(40).optional().describe('Only roll calls on this bill: 119-hr-1 or "H.R. 1"'),
      query: z.string().max(100).optional().describe('Words that must all appear in the question, description or bill title'),
      limit: z.number().int().min(1).max(50).optional().describe('Default 20'),
    },
    run: tools.getRecentVotes,
  },
  {
    name: 'get_roll_call',
    title: 'Get roll call',
    description: 'One roll-call vote: the question, bill, tally, party split, derived result, and how members voted. Without a filter, every member comes back as a short string grouped by position. Filter by state, party, position or bioguide_ids to get one object per member, e.g. bioguide_ids to see how specific members voted or party "R" with position "Nay" for who broke ranks.',
    inputSchema: {
      congress: z.number().int().min(1).max(200),
      chamber: CHAMBER,
      session: z.number().int().min(1).max(3),
      roll: z.number().int().min(1).max(5000),
      state: STATE.optional(),
      party: PARTY.optional(),
      position: POSITION.optional(),
      bioguide_ids: z.array(z.string().max(7)).max(50).optional().describe('Only these members'),
      format: z.enum(['compact', 'full']).optional().describe('"full" forces one object per member; "compact" forces grouped strings. Default: full for 60 members or fewer.'),
    },
    run: tools.getRollCall,
  },
  {
    name: 'search_bills',
    title: 'Search bills',
    description: 'Search bills by words in the title (every word must appear) or by bill number (e.g. "H.R. 1", "119-s-5051"), most recently introduced first. Narrow with congress, stage (e.g. enacted), sponsor (a Bioguide ID) or has_vote for bills that reached a recorded floor vote.',
    inputSchema: {
      query: z.string().max(100).optional().describe('Title words or a bill number. Optional when another filter is given.'),
      congress: z.number().int().min(93).max(200).optional().describe('e.g. 119'),
      stage: z.enum(tools.BILL_STAGES).optional(),
      sponsor: z.string().max(7).optional().describe('Bioguide ID of the sponsor'),
      has_vote: z.boolean().optional().describe('Only bills with a recorded floor vote'),
      limit: z.number().int().min(1).max(50).optional().describe('Default 20'),
    },
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
    description: 'A plain-English explanation of a bill for readers with no background in government: a one-sentence summary, short paragraphs and key points, written by AI from the bill\'s official text (or the CRS summary when the text is not published). Says which text version it read. Nothing is inferred from the title; when Congress.gov has no text yet, plain_english is null.',
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
]

export const TOOL_NAMES = TOOLS.map((t) => t.name)

// Ready-made questions a client can offer as slash commands. Each one names
// the tools to use, so the answer is built from the record and cited.
const CITE = 'Cite the BallotWatch canonical URL and the official source_url for every fact, and say when the data was last updated (data_updated_at).'
export const PROMPTS = [
  {
    name: 'my_representatives',
    title: 'Who represents me',
    description: 'The senators and House member for an address or ZIP code, with how each has voted lately.',
    argsSchema: { location: z.string().max(200).describe('Street address or 5-digit ZIP code') },
    text: ({ location }) => `Who represents ${location} in Congress? Use find_representatives (pass a 5-digit ZIP as zip, anything else as address). If the ZIP spans more than one district, list every possible House member and say a street address would settle it. Then call get_member_record for each member and summarize their recent votes in plain language, without judging them. ${CITE}`,
  },
  {
    name: 'member_record',
    title: 'A member\'s voting record',
    description: 'A neutral summary of how one member of Congress votes.',
    argsSchema: { member: z.string().max(100).describe('Member name, e.g. "Nancy Pelosi"') },
    text: ({ member }) => `Summarize the voting record of ${member}. Use search_members to find their Bioguide ID (ask which one if several match), then get_member_record, and get_member_votes if more detail helps. Say what each recent vote was about in plain language and how they voted, without judging it. ${CITE}`,
  },
  {
    name: 'how_did_they_vote',
    title: 'How a member voted on a bill',
    description: 'One member\'s recorded votes on one bill.',
    argsSchema: { member: z.string().max(100).describe('Member name'), bill: z.string().max(100).describe('Bill number or title words, e.g. "H.R. 1"') },
    text: ({ member, bill }) => `How did ${member} vote on ${bill}? Use search_members for the member's Bioguide ID and search_bills for the bill id if it is not a bill number. Then call get_member_votes with bill set. If there is no recorded vote, say so plainly: many bills pass by voice vote or never reach the floor. ${CITE}`,
  },
  {
    name: 'this_week_in_congress',
    title: 'This week in Congress',
    description: 'What the House plans to take up this week and what both chambers voted on in the last seven days.',
    argsSchema: {},
    text: () => `What is happening in Congress this week? Use get_floor_schedule for what the House may take up, and get_recent_votes (since seven days ago) for what the House and Senate actually voted on. Group the votes by chamber, explain each in a sentence, and give the tally and result. ${CITE}`,
  },
  {
    name: 'explain_a_bill',
    title: 'Explain a bill',
    description: 'What a bill does in plain English, where it stands, and how the floor votes went.',
    argsSchema: { bill: z.string().max(100).describe('Bill number or title words, e.g. "H.R. 1"') },
    text: ({ bill }) => `Explain ${bill} to someone with no background in government. Use search_bills if this is not a bill number, then explain_bill for the plain-English explanation and get_bill for its sponsor, stage and recorded votes. Say which text the explanation was written from, and that it was written by AI. ${CITE}`,
  },
]

function text(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }], isError: Boolean(obj && obj.error) }
}

// `onToolCall` (optional) hears every tool call with its outcome, for
// agent_events.
export function buildServer({ onToolCall } = {}) {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS })
  for (const t of TOOLS) {
    server.registerTool(t.name, { title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, ...READ_ONLY } }, async (args) => {
      const started = Date.now()
      let result
      try {
        result = text(await t.run(args))
      } catch (err) {
        console.error(`[mcp] ${t.name} failed:`, err?.message)
        result = text({ error: 'Lookup failed; try again shortly.' })
      }
      onToolCall?.({ tool: t.name, args, ok: !result.isError, ms: Date.now() - started })
      return result
    })
  }
  for (const p of PROMPTS) {
    // A prompt with no arguments must not declare a schema: clients send none.
    const config = { title: p.title, description: p.description }
    if (Object.keys(p.argsSchema).length) config.argsSchema = p.argsSchema
    server.registerPrompt(p.name, config, (args) => ({
      description: p.description,
      messages: [{ role: 'user', content: { type: 'text', text: p.text(args || {}) } }],
    }))
  }
  return server
}

// Short, scalar tool arguments only (ids, dates, queries), so the log shows
// what agents ask for without storing anything large.
export function summarizeArgs(args) {
  const out = {}
  for (const [k, v] of Object.entries(args || {})) {
    if (typeof v === 'string') out[k] = v.slice(0, 120)
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v
  }
  return out
}

// agent_events rows for one MCP POST: initialize and tools/list from the
// body, tools/call from the tool wrapper (it knows the outcome).
export function mcpEvents(body, toolCalls, { userAgent }) {
  const messages = Array.isArray(body) ? body : [body]
  const init = messages.find((m) => m?.method === 'initialize')
  const clientName = init?.params?.clientInfo?.name
  const who = classifyClient(userAgent)
    || (clientName ? { agent: String(clientName).slice(0, 60), operator: null, purpose: 'client' } : { agent: 'browser-like', operator: null, purpose: 'unknown' })
  const events = []
  for (const m of messages) {
    if (m?.method === 'initialize') {
      events.push({ event: 'mcp_initialize', who, detail: { client: m.params?.clientInfo || null, protocol: m.params?.protocolVersion || null } })
    } else if (m?.method === 'tools/list') {
      events.push({ event: 'mcp_list_tools', who, detail: null })
    }
  }
  for (const c of toolCalls) {
    events.push({ event: 'mcp_tool', who, tool: c.tool, detail: { args: summarizeArgs(c.args), ok: c.ok, ms: c.ms } })
  }
  return events
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
      prompts: PROMPTS.map((p) => p.name),
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

  const toolCalls = []
  const server = buildServer({ onToolCall: (c) => toolCalls.push(c) })
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}) })
  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, body)
  } catch (err) {
    console.error('[mcp] request failed:', err.message)
    if (!res.headersSent) sendJson(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null })
  }

  // The response has been sent; the function stays up until these writes finish.
  const userAgent = getHeader(req, 'user-agent')
  const ip = clientIp(req)
  const country = getHeader(req, 'x-vercel-ip-country') || null
  await Promise.all(mcpEvents(body, toolCalls, { userAgent }).map((e) =>
    logAgentEvent({ ...e, surface: 'mcp', path: '/mcp', userAgent, ip, country })))
}

export const config = { runtime: 'nodejs', maxDuration: 30 }
