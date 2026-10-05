// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: () => { throw new Error('no db in this test') } } }))

import { build, parseOpenApi, LLMS_FULL, SERVER_CARD } from '../../scripts/build-llms-full.mjs'
import { TOOL_NAMES } from '../../api/mcp.js'
import { OPEN_DATA_TABLES } from '../../shared/openData.js'

const root = process.cwd()
const read = (p) => readFileSync(resolve(root, p), 'utf8')

describe('generated agent files are up to date', () => {
  it('public/llms-full.txt and the MCP server card match their sources (run node scripts/build-llms-full.mjs)', async () => {
    const files = await build()
    expect(read(LLMS_FULL)).toBe(files[LLMS_FULL])
    expect(read(SERVER_CARD)).toBe(files[SERVER_CARD])
  }, 60000)

  it('llms-full covers every API path, MCP tool and open-data table', () => {
    const text = read(LLMS_FULL)
    const paths = parseOpenApi(read('docs/api/openapi.yaml'))
    expect(paths.length).toBeGreaterThanOrEqual(12)
    for (const p of paths) expect(text).toContain(`## GET ${p.path}`)
    for (const name of TOOL_NAMES) expect(text).toContain(`## ${name}`)
    for (const t of OPEN_DATA_TABLES) expect(text).toContain(`## ${t.table}: `)
    expect(text).toContain(read('public/llms.txt').trim())
    expect(text).toContain('https://creativecommons.org/publicdomain/zero/1.0/')
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/) // deterministic: no build timestamps
  })

  it('the server card lists the real tools, endpoint, transport and no auth', () => {
    const card = JSON.parse(read(SERVER_CARD))
    expect(card.remotes).toEqual([{ type: 'streamable-http', url: 'https://www.ballotwatch.io/mcp' }])
    expect(card.authentication.required).toBe(false)
    expect(card.tools.map((t) => t.name)).toEqual(TOOL_NAMES)
    for (const t of card.tools) expect(t.inputSchema.type).toBe('object')
  })

  it('parses inline and referenced OpenAPI parameters', () => {
    const paths = parseOpenApi(read('docs/api/openapi.yaml'))
    const members = paths.find((p) => p.path === '/api/v1/members')
    expect(members.parameters.map((p) => p.name)).toEqual(['state', 'chamber', 'party', 'offset', 'limit'])
    const floor = paths.find((p) => p.path === '/api/v1/floor/schedule')
    expect(floor.parameters[0]).toMatchObject({ name: 'week', in: 'query', type: 'string', format: 'date' })
    expect(paths.find((p) => p.path === '/api/v1/datasets').description).toMatch(/CC0/)
  })
})

describe('discovery links', () => {
  it('robots.txt allows /data/ and /llms-full.txt and points at the agent files', () => {
    const robots = read('public/robots.txt')
    for (const s of ['Allow: /data/', 'Allow: /llms-full.txt', '/llms.txt', '/llms-full.txt', '/data/full/manifest.json', '/openapi.yaml', '/mcp']) expect(robots).toContain(s)
    for (const ua of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-CloudVertexBot', 'Amazonbot', 'Applebot', 'DuckAssistBot', 'MistralAI-User', 'cohere-ai', 'YouBot', 'Diffbot']) {
      expect(robots).toMatch(new RegExp(`^User-agent: ${ua}\\nAllow: /$`, 'm'))
    }
    expect(robots).toContain('Sitemap: https://www.ballotwatch.io/sitemap.xml')
  })

  it('llms.txt has an Open data section near the top (right after How to cite) with the manifest, datapackage, datasets API, license and server card', () => {
    const llms = read('public/llms.txt')
    const at = llms.indexOf('## Open data')
    expect(at).toBeGreaterThan(0)
    expect(at).toBeGreaterThan(llms.indexOf('## How to cite'))
    expect(at).toBeLessThan(llms.indexOf('## Canonical URLs'))
    for (const s of ['/data/full/manifest.json', '/data/full/datapackage.json', '/api/v1/datasets', 'CC0', 'Fastest way to get everything', '/.well-known/mcp/server-card.json', '/llms-full.txt']) expect(llms).toContain(s)
  })
})
