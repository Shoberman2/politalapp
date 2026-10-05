// Builds the two agent-discovery files from the real sources so they cannot
// drift (run on `prebuild`, like sync-openapi.mjs; a test fails when they are
// stale):
//
//   public/llms-full.txt                    everything an agent needs, one file
//   public/.well-known/mcp/server-card.json the MCP server card
//
// Sources: public/llms.txt (site map, URL patterns, citation rules),
// docs/api/openapi.yaml (endpoints and parameters), api/mcp.js (the tools the
// server really advertises, via an in-memory tools/list), shared/openData.js
// (bulk files and schemas), src/data/infoPages.js (data sources) and
// src/data/openSource.js (methodology). Output is deterministic: no dates.
//
//   node scripts/build-llms-full.mjs           write if changed
//   node scripts/build-llms-full.mjs --check   exit 1 if either file is stale

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const path = (p) => fileURLToPath(new URL(p, root))
const read = (p) => readFileSync(path(p), 'utf8')

export const LLMS_FULL = 'public/llms-full.txt'
export const SERVER_CARD = 'public/.well-known/mcp/server-card.json'

// ---------------------------------------------------------------------------
// OpenAPI: a small reader for this repo's spec layout (2-space YAML, paths at
// indent 2, methods at 4, fields at 6, parameter list items at 8). It only
// needs paths, summaries, descriptions and parameters.
// ---------------------------------------------------------------------------
function unquote(v) {
  return v.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
}

function readBlockScalar(lines, i, indent) {
  // `key: >` folded block: gather following lines indented deeper than `indent`.
  const out = []
  let j = i + 1
  while (j < lines.length && (lines[j].trim() === '' || lines[j].search(/\S/) > indent)) {
    out.push(lines[j].trim())
    j++
  }
  return { text: out.join(' ').replace(/\s+/g, ' ').trim(), next: j }
}

export function parseOpenApi(yaml) {
  const lines = yaml.split('\n')
  const params = {}
  const paths = []
  let section = null
  let cur = null // current path op
  let curParam = null
  let compParam = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\S/.test(line)) { section = line.replace(/:.*$/, ''); continue }
    if (section === 'paths') {
      let m
      if ((m = /^ {2}(\/\S+):\s*$/.exec(line))) { cur = { path: m[1], method: null, summary: '', description: '', parameters: [] }; paths.push(cur); curParam = null; continue }
      if (!cur) continue
      if ((m = /^ {4}(get|post|put|delete|patch):\s*$/.exec(line))) { cur.method = m[1].toUpperCase(); continue }
      if ((m = /^ {6}summary:\s*(.+)$/.exec(line))) { cur.summary = unquote(m[1]); continue }
      if ((m = /^ {6}description:\s*(.*)$/.exec(line))) {
        if (/^[>|]-?\s*$/.test(m[1])) { const b = readBlockScalar(lines, i, 6); cur.description = b.text; i = b.next - 1 } else cur.description = unquote(m[1])
        continue
      }
      if ((m = /^ {6}responses:/.exec(line))) { curParam = null; continue }
      if ((m = /^ {8}- \$ref: "#\/components\/parameters\/(\w+)"/.exec(line))) { cur.parameters.push({ ref: m[1] }); curParam = null; continue }
      if ((m = /^ {8}- name:\s*(\S+)/.exec(line))) { curParam = { name: unquote(m[1]) }; cur.parameters.push(curParam); continue }
      if (curParam) {
        if ((m = /^ {10}in:\s*(\S+)/.exec(line))) curParam.in = m[1]
        else if ((m = /^ {10}required:\s*(\S+)/.exec(line))) curParam.required = m[1] === 'true'
        else if ((m = /^ {10}description:\s*(.+)$/.exec(line))) curParam.description = unquote(m[1])
        else if ((m = /^ {12}type:\s*(\S+)/.exec(line))) curParam.type = curParam.type || m[1]
        else if ((m = /^ {12}format:\s*(\S+)/.exec(line))) curParam.format = m[1]
        else if ((m = /^ {12}enum:\s*\[(.+)\]/.exec(line))) curParam.enum = m[1].split(',').map(unquote)
      }
    } else if (section === 'components') {
      let m
      if (/^ {2}\S/.test(line)) { compParam = null; if (!/^ {2}parameters:/.test(line)) compParam = undefined; else compParam = null; continue }
      if (compParam === undefined) continue
      if ((m = /^ {4}(\w+):\s*$/.exec(line))) { compParam = { key: m[1] }; params[m[1]] = compParam; continue }
      if (!compParam) continue
      if ((m = /^ {6}name:\s*(\S+)/.exec(line))) compParam.name = unquote(m[1])
      else if ((m = /^ {6}in:\s*(\S+)/.exec(line))) compParam.in = m[1]
      else if ((m = /^ {6}required:\s*(\S+)/.exec(line))) compParam.required = m[1] === 'true'
      else if ((m = /^ {6}description:\s*(.+)$/.exec(line))) compParam.description = unquote(m[1])
      else if ((m = /^ {6}example:\s*(.+)$/.exec(line))) compParam.example = unquote(m[1])
      else if ((m = /^ {8}type:\s*(\S+)/.exec(line))) compParam.type = compParam.type || m[1]
      else if ((m = /^ {8}enum:\s*\[(.+)\]/.exec(line))) compParam.enum = m[1].split(',').map(unquote)
      else if ((m = /^ {8}(minimum|maximum|default):\s*(\S+)/.exec(line))) compParam[m[1]] = m[2]
    }
  }
  for (const p of paths) p.parameters = p.parameters.map((x) => (x.ref ? { ...params[x.ref] } : x)).filter((x) => x && x.name)
  return paths
}

function describeParam(p) {
  const bits = [p.in || 'query', p.type || 'string']
  if (p.format) bits.push(p.format)
  if (p.required) bits.push('required')
  const extra = []
  if (p.enum) extra.push(`one of ${p.enum.join(', ')}`)
  if (p.minimum != null || p.maximum != null) extra.push(`range ${p.minimum ?? ''}..${p.maximum ?? ''}`)
  if (p.default != null) extra.push(`default ${p.default}`)
  if (p.example) extra.push(`e.g. ${p.example}`)
  return `  - ${p.name} (${bits.join(', ')})${p.description ? `: ${p.description}` : ''}${extra.length ? ` [${extra.join('; ')}]` : ''}`
}

// ---------------------------------------------------------------------------
// MCP: ask the real server for its tool list over an in-memory transport.
// ---------------------------------------------------------------------------
async function loadMcp() {
  // api/_lib/supabase.js and billCard.js build clients at import time; no
  // query runs here, so placeholders are enough when the build has no
  // database env (they only exist in this process).
  if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) process.env.SUPABASE_URL = 'http://localhost'
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = 'build-time-placeholder'
  if (!process.env.SUPABASE_ANON_KEY && !process.env.VITE_SUPABASE_ANON_KEY) process.env.SUPABASE_ANON_KEY = 'build-time-placeholder'
  const mcp = await import('../api/mcp.js')
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
  const server = mcp.buildServer()
  const client = new Client({ name: 'build-llms-full', version: '1.0.0' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(a), client.connect(b)])
  const { tools } = await client.listTools()
  await client.close()
  await server.close()
  return { tools, instructions: mcp.INSTRUCTIONS, serverInfo: mcp.SERVER_INFO }
}

function describeToolArgs(schema) {
  const props = schema?.properties || {}
  const req = new Set(schema?.required || [])
  const out = []
  for (const [name, s] of Object.entries(props)) {
    const t = s.enum ? `one of ${s.enum.join('|')}` : s.type || 'any'
    const lim = []
    if (s.minimum != null) lim.push(`min ${s.minimum}`)
    if (s.maximum != null) lim.push(`max ${s.maximum}`)
    if (s.maxLength != null) lim.push(`max length ${s.maxLength}`)
    if (s.pattern) lim.push(`pattern ${s.pattern}`)
    out.push(`  - ${name} (${t}${req.has(name) ? ', required' : ', optional'}${lim.length ? `, ${lim.join(', ')}` : ''})${s.description ? `: ${s.description}` : ''}`)
  }
  return out.length ? out : ['  - (no arguments)']
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
export async function build() {
  const od = await import('../shared/openData.js')
  const { DATA_SOURCES } = await import('../src/data/infoPages.js')
  const { METHODOLOGY_PAGES } = await import('../src/data/openSource.js')
  const llms = read('public/llms.txt').trim()
  const api = parseOpenApi(read('docs/api/openapi.yaml'))
  const { tools, instructions, serverInfo } = await loadMcp()
  const S = od.SITE_ORIGIN

  const out = []
  const h = (t) => { out.push('', '', `# ${t}`, '') }
  out.push(
    '# BallotWatch: everything for AI agents in one file',
    '',
    `> Generated from the BallotWatch source (public/llms.txt, docs/api/openapi.yaml, api/mcp.js, shared/openData.js, src/data/infoPages.js, src/data/openSource.js) by scripts/build-llms-full.mjs. The short map is ${S}/llms.txt. Bulk data: ${od.MANIFEST_URL} (CC0 1.0).`,
    '',
    'Contents: 1. Site map and citation rules (llms.txt). 2. Open data files and schemas. 3. REST API endpoints. 4. MCP server and tools. 5. Data sources. 6. Methodology. 7. How to cite.',
  )

  h('1. Site map and citation rules (verbatim from /llms.txt)')
  out.push(llms)

  h('2. Open data: bulk files and schemas')
  out.push(
    `Fastest way to get everything: GET ${od.MANIFEST_URL} (or ${od.DATASETS_API_URL}) and download each file in "files". No key required.`,
    `Base URL: ${od.OPEN_DATA_BASE_URL}/`,
    `Past snapshots: ${S}${od.OPEN_DATA_ARCHIVE_PATH}/{YYYY-MM-DD}/{file} (the last ${od.KEEP_DATED_SNAPSHOTS} days).`,
    `Schemas: ${od.DATAPACKAGE_URL} (Frictionless tabular-data-package: field types, primary keys, foreign keys, sha256 per file).`,
    `License: ${od.DATA_LICENSE.title}, ${od.DATA_LICENSE.path} (legal code: ${od.DATA_LICENSE.legalcode}). The underlying federal records are public domain. BallotWatch code is MIT.`,
    `Cadence: ${od.UPDATE_CADENCE}`,
    'Formats: each table as gzip CSV (.csv.gz; RFC 4180, header row, UTF-8, empty field = null) and gzip NDJSON (.ndjson.gz; one JSON object per line, same keys, null for missing). Served as application/gzip downloads (no Content-Encoding): decompress after downloading.',
    'File names: {table}.csv.gz / {table}.ndjson.gz is the full archive; {table}-{congress}.csv.gz / .ndjson.gz is the current Congress only (manifest.current_congress), for tables marked "per Congress" below.',
    '',
    'Sources: ' + od.DATA_SOURCES.map((s) => `${s.title} (${s.path})`).join('; ') + '.',
  )
  for (const t of od.OPEN_DATA_TABLES) {
    out.push(
      '',
      `## ${t.table}: ${t.title}`,
      '',
      t.description,
      `Files: ${t.table}.csv.gz, ${t.table}.ndjson.gz${t.scopes.includes('congress') ? `; per Congress: ${t.table}-{congress}.csv.gz, ${t.table}-{congress}.ndjson.gz` : ''}`,
      `Primary key: ${t.primaryKey.join(' + ')}`,
    )
    if (t.foreignKeys.length) out.push(`Foreign keys: ${t.foreignKeys.map((fk) => `${fk.fields} -> ${fk.reference.resource}.${fk.reference.fields}`).join('; ')}`)
    out.push('Columns:')
    for (const f of t.fields) out.push(`  - ${f.name} (${f.type}): ${f.description}`)
  }

  h('3. REST API (no key required for GET)')
  out.push(
    `Base: ${S}. OpenAPI 3.1: ${S}/openapi.yaml. Responses are JSON with "data" and "meta" (meta.data_updated_at); single records carry a Link: <official source>; rel="canonical" header.`,
    'Limits: 60 requests per minute and 5,000 per day per IP without a key; a free key (Authorization: Bearer bw_live_...) raises it to 600 per minute. Over the limit: 429 with Retry-After.',
  )
  for (const p of api) {
    out.push('', `## ${p.method || 'GET'} ${p.path}`, '', p.summary + (p.description ? `. ${p.description}` : ''))
    if (p.parameters.length) { out.push('Parameters:'); for (const prm of p.parameters) out.push(describeParam(prm)) }
  }

  h('4. MCP server')
  out.push(
    `Endpoint: ${S}/mcp. Transport: Streamable HTTP, stateless, no auth (same per-IP limits as the API). POST JSON-RPC 2.0 with Content-Type: application/json and Accept: application/json, text/event-stream. A plain GET returns a JSON manifest.`,
    `Server: ${serverInfo.name} ${serverInfo.version}. Server card: ${S}/.well-known/mcp/server-card.json.`,
    `Instructions the server sends: ${instructions}`,
  )
  for (const t of tools) {
    out.push('', `## ${t.name}${t.title ? ` (${t.title})` : ''}`, '', t.description, 'Arguments:', ...describeToolArgs(t.inputSchema))
  }

  h('5. Data sources')
  out.push(`Every upstream source and how often BallotWatch reads it (${S}/data-sources):`)
  for (const s of DATA_SOURCES) {
    out.push('', `## ${s.name} (${s.publisher})`, '', s.takes, `Cadence: ${s.cadence}${s.cadenceNote ? `. ${s.cadenceNote}` : ''}`, `URL: ${s.url}`)
  }

  h('6. Methodology')
  out.push(`Source, cadence and caveat for each feature that computes or explains something (${S}/methodology):`)
  for (const m of METHODOLOGY_PAGES) {
    out.push('', `## ${m.title}`, '', m.dek, `Source: ${m.source}`, `Cadence: ${m.cadence}`, `Caveat: ${m.caveat}`, `Page: ${S}/methodology/${m.slug}`)
  }

  h('7. How to cite')
  out.push(
    'For a single record: cite the most specific BallotWatch URL (roll call, member record, or bill) and the record\'s official source_url, and state data_updated_at. See section 1, "How to cite".',
    `For the bulk data (attribution optional under CC0): ${od.CITATION.replace('{date}', '{snapshot_date from manifest.json}')}`,
    `Attribution line: ${od.ATTRIBUTION}`,
  )

  const text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'

  const card = {
    name: 'io.ballotwatch/congress',
    title: 'BallotWatch',
    version: serverInfo.version,
    description: 'The U.S. congressional record: members, roll-call votes, bills and the House weekly floor schedule, sourced from Congress.gov, the House Clerk and the Senate. Every result carries a canonical BallotWatch URL and an official source_url.',
    websiteUrl: S,
    repository: { url: 'https://github.com/Shoberman2/politalapp', source: 'github' },
    remotes: [{ type: 'streamable-http', url: `${S}/mcp` }],
    transport: { type: 'streamable-http', endpoint: `${S}/mcp`, stateless: true },
    authentication: { required: false, schemes: [] },
    serverInfo: { name: serverInfo.name, version: serverInfo.version },
    capabilities: { tools: { listChanged: false } },
    instructions,
    limits: '60 requests per minute and 5,000 per day per IP',
    documentation: { llms: `${S}/llms.txt`, llmsFull: `${S}/llms-full.txt`, openapi: `${S}/openapi.yaml`, openData: od.MANIFEST_URL },
    license: { code: 'MIT', data: od.DATA_LICENSE.id },
    tools: tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema })),
  }
  const cardText = JSON.stringify(card, null, 2) + '\n'
  return { [LLMS_FULL]: text, [SERVER_CARD]: cardText }
}

async function main() {
  const files = await build()
  const check = process.argv.includes('--check')
  let stale = false
  for (const [rel, content] of Object.entries(files)) {
    let current = null
    try { current = read(rel) } catch { current = null }
    if (current === content) continue
    stale = true
    if (check) { console.error(`${rel} is out of date; run node scripts/build-llms-full.mjs`); continue }
    mkdirSync(dirname(path(rel)), { recursive: true })
    writeFileSync(path(rel), content)
    console.log(`wrote ${rel}`)
  }
  if (check && stale) process.exit(1)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
}
