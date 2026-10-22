// Which AI agent sent a request, from its User-Agent.
//
// Used by middleware.js (every page and agent-surface request) and api/mcp.js
// (MCP initialize and tool calls) to fill agent_events. Order matters: the
// first match wins, so specific names come before generic ones.
//
// purpose:
//   training  crawls pages to train a model
//   search    indexes pages for an AI search or answer engine
//   user      fetches a page because a person asked an assistant right now
//   client    a script or SDK (curl, python, an MCP client) calling us directly

const AGENTS = [
  // Anthropic
  [/Claude-User/i, 'Claude-User', 'Anthropic', 'user'],
  [/Claude-SearchBot/i, 'Claude-SearchBot', 'Anthropic', 'search'],
  [/ClaudeBot/i, 'ClaudeBot', 'Anthropic', 'training'],
  [/Claude-Web/i, 'Claude-Web', 'Anthropic', 'user'],
  [/anthropic-ai/i, 'anthropic-ai', 'Anthropic', 'training'],
  [/claude-code/i, 'Claude Code', 'Anthropic', 'user'],
  // OpenAI
  [/ChatGPT-User/i, 'ChatGPT-User', 'OpenAI', 'user'],
  [/ChatGPT Agent|ChatGPT-Agent/i, 'ChatGPT Agent', 'OpenAI', 'user'],
  [/OAI-SearchBot/i, 'OAI-SearchBot', 'OpenAI', 'search'],
  [/GPTBot/i, 'GPTBot', 'OpenAI', 'training'],
  // Perplexity
  [/Perplexity-User/i, 'Perplexity-User', 'Perplexity', 'user'],
  [/PerplexityBot/i, 'PerplexityBot', 'Perplexity', 'search'],
  // Google
  [/Google-CloudVertexBot/i, 'Google-CloudVertexBot', 'Google', 'user'],
  [/Gemini-Deep-Research/i, 'Gemini Deep Research', 'Google', 'user'],
  [/GoogleAgent-Mariner/i, 'Project Mariner', 'Google', 'user'],
  [/Google-NotebookLM/i, 'NotebookLM', 'Google', 'user'],
  // Microsoft
  [/Copilot|BingPreview/i, 'Copilot', 'Microsoft', 'user'],
  // Meta
  [/meta-externalfetcher/i, 'meta-externalfetcher', 'Meta', 'user'],
  [/meta-externalagent/i, 'meta-externalagent', 'Meta', 'training'],
  [/FacebookBot/i, 'FacebookBot', 'Meta', 'training'],
  // Apple, Amazon, DuckDuckGo
  [/Applebot/i, 'Applebot', 'Apple', 'search'],
  [/Amazonbot/i, 'Amazonbot', 'Amazon', 'search'],
  [/DuckAssistBot/i, 'DuckAssistBot', 'DuckDuckGo', 'user'],
  // Others
  [/MistralAI-User/i, 'MistralAI-User', 'Mistral', 'user'],
  [/cohere-training-data-crawler/i, 'cohere-training-data-crawler', 'Cohere', 'training'],
  [/cohere-ai/i, 'cohere-ai', 'Cohere', 'user'],
  [/Grok|xAI/i, 'Grok', 'xAI', 'user'],
  [/DeepSeekBot/i, 'DeepSeekBot', 'DeepSeek', 'training'],
  [/Bytespider/i, 'Bytespider', 'ByteDance', 'training'],
  [/CCBot/i, 'CCBot', 'Common Crawl', 'training'],
  [/AI2Bot/i, 'AI2Bot', 'Allen Institute for AI', 'training'],
  [/YouBot/i, 'YouBot', 'You.com', 'search'],
  [/Diffbot/i, 'Diffbot', 'Diffbot', 'training'],
  [/PhindBot/i, 'PhindBot', 'Phind', 'search'],
  [/Kagibot|Kagi/i, 'Kagi', 'Kagi', 'search'],
  [/Manus/i, 'Manus', 'Manus', 'user'],
]

// Scripts and SDKs. Only counted on agent surfaces, where they are almost
// always an agent or a developer building one.
const CLIENTS = [
  [/^curl\//i, 'curl'],
  [/python-requests/i, 'python-requests'],
  [/python-httpx/i, 'python-httpx'],
  [/aiohttp/i, 'aiohttp'],
  [/^python/i, 'python'],
  [/axios/i, 'axios'],
  [/node-fetch/i, 'node-fetch'],
  [/undici|^node$/i, 'node'],
  [/^Go-http-client/i, 'go'],
  [/^Wget/i, 'wget'],
  [/okhttp/i, 'okhttp'],
  [/mcp|modelcontextprotocol/i, 'mcp-client'],
  [/Deno\//i, 'deno'],
  [/Bun\//i, 'bun'],
]

/** Known AI agent, or null. */
export function classifyAgent(userAgent) {
  const ua = String(userAgent || '')
  if (!ua) return null
  for (const [re, agent, operator, purpose] of AGENTS) {
    if (re.test(ua)) return { agent, operator, purpose }
  }
  return null
}

/** Known AI agent, else a script/SDK, else null (a browser or nothing). */
export function classifyClient(userAgent) {
  const known = classifyAgent(userAgent)
  if (known) return known
  const ua = String(userAgent || '').trim()
  if (!ua) return { agent: 'no user-agent', operator: null, purpose: 'client' }
  for (const [re, agent] of CLIENTS) {
    if (re.test(ua)) return { agent, operator: null, purpose: 'client' }
  }
  // Browsers say Mozilla/. Anything else that is not a browser is a client
  // we have not named yet; keep its product token.
  if (/^Mozilla\//.test(ua)) return null
  return { agent: ua.split(/[\s/;(]/)[0].slice(0, 40) || 'unknown', operator: null, purpose: 'client' }
}

// Where agents come to read the record in bulk or by API.
export function agentSurface(pathname) {
  const p = String(pathname || '')
  if (p === '/mcp' || p.startsWith('/api/mcp')) return 'mcp'
  if (p.startsWith('/api/v1/') || p === '/api/v1') return 'api'
  if (/^\/(llms(-full)?\.txt|openapi\.(yaml|json)|robots\.txt)$/.test(p) || p.startsWith('/data/') || p.startsWith('/.well-known/')) return 'file'
  return null
}
