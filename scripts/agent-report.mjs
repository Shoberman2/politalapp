#!/usr/bin/env node
// Which AI agents came to BallotWatch, and what they used.
//
//   node scripts/agent-report.mjs            last 7 days
//   node scripts/agent-report.mjs --days 30
//   node scripts/agent-report.mjs --json     raw counts, for other tools
//
// Reads agent_events (written by middleware.js and api/mcp.js) with the
// service role key from .env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).

import { readFileSync, existsSync } from 'node:fs'

function loadEnv() {
  if (!existsSync('.env')) return
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const args = process.argv.slice(2)
const days = Number(args[args.indexOf('--days') + 1]) || 7
const asJson = args.includes('--json')

loadEnv()
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env or the environment).')
  process.exit(1)
}

const since = new Date(Date.now() - days * 86_400_000).toISOString()
const rows = []
for (let from = 0; ; from += 1000) {
  const res = await fetch(
    `${url}/rest/v1/agent_events?select=created_at,surface,event,path,agent,operator,purpose,tool,detail,ip_hash&created_at=gte.${since}&order=id.asc`,
    { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` } },
  )
  if (!res.ok) {
    console.error(`agent_events read failed: ${res.status} ${await res.text()}`)
    process.exit(1)
  }
  const page = await res.json()
  rows.push(...page)
  if (page.length < 1000) break
}

function count(list, keyOf) {
  const m = new Map()
  for (const r of list) {
    const k = keyOf(r)
    if (k == null) continue
    m.set(k, (m.get(k) || 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

const known = rows.filter((r) => r.operator)
const mcpTools = rows.filter((r) => r.event === 'mcp_tool')
const report = {
  days,
  since,
  total_events: rows.length,
  ai_agent_requests: known.length,
  by_agent: count(known, (r) => `${r.agent} (${r.operator}, ${r.purpose})`),
  by_purpose: count(known, (r) => r.purpose),
  by_surface: count(rows, (r) => r.surface),
  scripts_and_sdks: count(rows.filter((r) => !r.operator && r.event === 'request'), (r) => r.agent),
  mcp_clients: count(rows.filter((r) => r.event === 'mcp_initialize'), (r) => r.detail?.client?.name || r.agent),
  mcp_tool_calls: count(mcpTools, (r) => r.tool),
  mcp_tool_failures: mcpTools.filter((r) => r.detail && r.detail.ok === false).length,
  top_pages: count(rows.filter((r) => r.surface === 'page'), (r) => r.path.split('?')[0]).slice(0, 15),
  top_api_and_files: count(rows.filter((r) => r.surface === 'api' || r.surface === 'file'), (r) => r.path.split('?')[0]).slice(0, 15),
  distinct_ips: new Set(rows.map((r) => r.ip_hash).filter(Boolean)).size,
  per_day: count(rows, (r) => r.created_at.slice(0, 10)).sort((a, b) => a[0].localeCompare(b[0])),
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

function table(title, entries, empty = 'none') {
  console.log(`\n${title}`)
  if (!entries.length) return console.log(`  ${empty}`)
  const width = Math.max(...entries.map(([k]) => String(k).length))
  for (const [k, v] of entries) console.log(`  ${String(k).padEnd(width)}  ${v}`)
}

console.log(`AI agents on BallotWatch, last ${days} day${days === 1 ? '' : 's'} (since ${since.slice(0, 10)})`)
console.log(`${report.total_events} events · ${report.ai_agent_requests} from named AI agents · ${mcpTools.length} MCP tool calls (${report.mcp_tool_failures} failed)`)
table('By agent', report.by_agent)
table('Why they came (training = model training, search = AI search index, user = fetched for a person right now)', report.by_purpose)
table('Where', report.by_surface)
table('MCP clients (from initialize)', report.mcp_clients)
table('MCP tools called', report.mcp_tool_calls)
table('Scripts and SDKs on the API, MCP and data files', report.scripts_and_sdks)
table('Top pages read by AI agents', report.top_pages)
table('Top API endpoints and files', report.top_api_and_files)
table('Per day', report.per_day)
