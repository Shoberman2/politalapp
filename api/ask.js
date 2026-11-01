// POST /api/ask  { question, history? }
//
// Ask Dome, the BallotWatch Pro Q&A in the iOS app. The model answers from the
// record only: it calls the same tools the MCP server exposes (bills, roll
// calls, members, the floor schedule) and the response lists every source it
// read, so each answer can be checked against Congress.gov or the clerks.
//
// Needs a signed-in BallotWatch account (Supabase access token as Bearer).
// When REVENUECAT_SECRET_KEY is set, the account must also hold the "pro"
// entitlement; until then any signed-in account may ask, under a tight daily
// limit, so the feature works the day the key is added without a redeploy.
//
// 200 { answer, sources: [{ title, url }] }
// 400 bad input · 401 not signed in · 402 no Pro · 429 rate limited · 503 model unavailable

import { handleCors, jsonResponse, nodeHandler } from './_lib/response.js'
import { checkRateLimit } from './_lib/rateLimit.js'
import { getHeader, readJsonBody } from './_lib/request.js'
import { supabaseAdmin } from './_lib/supabase.js'
import {
  searchBills, getBill, explainBill, getMember, getMemberVotes, getRollCall, getFloorSchedule, findRepresentatives,
} from './_lib/mcpTools.js'

export const ASK_MODEL = process.env.ASK_MODEL || 'gpt-5.4-mini'
const MAX_QUESTION = 500
const MAX_TOOL_ROUNDS = 4
const PER_MINUTE = 6
const PER_DAY_PRO = 200
const PER_DAY_UNVERIFIED = 20

export const SYSTEM_PROMPT = `You are Dome, the guide inside the BallotWatch app. You explain what the U.S. Congress is doing in plain English for people with no political background.

Rules:
- Answer only from the tool results. If the record doesn't hold the answer, say so plainly and suggest where to look (Congress.gov, the House Clerk, the Senate).
- Be strictly neutral. Describe what a bill does, how votes went and what the rules are. Never say whether a bill, party or member is good or bad, never predict outcomes as fact, never tell anyone how to vote.
- Name members with party and state, e.g. "Sen. Jane Doe (D-CA)".
- Short answers: two to five sentences, or a brief list. No headings, no emoji, no em dashes.
- BallotWatch is independent and not affiliated with any government entity.`

const TOOLS = [
  tool('search_bills', 'Search bills by words in the title or a bill number like "HR 1234".', { query: { type: 'string' } }, ['query']),
  tool('get_bill', 'One bill: title, sponsor, status, latest action and its recorded votes. id like "119-hr-1234".', { id: { type: 'string' } }, ['id']),
  tool('explain_bill', 'Plain-English explanation of one bill written from its official text.', { id: { type: 'string' } }, ['id']),
  tool('search_members', 'Find current or past members of Congress by name.', { name: { type: 'string' } }, ['name']),
  tool('get_member', 'One member by bioguide id: party, state, chamber, record summary.', { bioguide_id: { type: 'string' } }, ['bioguide_id']),
  tool('get_member_votes', 'A member\'s recent recorded votes, newest first.', { bioguide_id: { type: 'string' }, limit: { type: 'integer' } }, ['bioguide_id']),
  tool('get_roll_call', 'One roll call vote with its tally and result.', { congress: { type: 'integer' }, chamber: { type: 'string', enum: ['house', 'senate'] }, session: { type: 'integer' }, roll: { type: 'integer' } }, ['congress', 'chamber', 'session', 'roll']),
  tool('get_floor_schedule', 'What the House and Senate are scheduled to take up this week.', {}, []),
  tool('find_representatives', 'A person\'s House member and senators from a ZIP code or street address.', { zip: { type: 'string' }, address: { type: 'string' } }, []),
]

function tool(name, description, properties, required) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } }
}

async function searchMembers({ name }) {
  const q = String(name || '').trim().slice(0, 60)
  if (q.length < 2) return { members: [] }
  const { data } = await supabaseAdmin.from('politicians').select('id, name, chamber, party, state').ilike('name', `%${q.replace(/[%_]/g, '')}%`).limit(8)
  return { members: (data || []).map((p) => ({ bioguide_id: p.id, name: p.name, chamber: p.chamber, party: p.party, state: p.state, canonical: `https://www.ballotwatch.io/politician/${p.id}` })) }
}

export const HANDLERS = {
  search_bills: (a) => searchBills({ query: a.query, limit: 8 }),
  get_bill: getBill,
  explain_bill: explainBill,
  search_members: searchMembers,
  get_member: getMember,
  get_member_votes: (a) => getMemberVotes({ bioguide_id: a.bioguide_id, limit: Math.min(Number(a.limit) || 20, 40) }),
  get_roll_call: getRollCall,
  get_floor_schedule: () => getFloorSchedule({}),
  find_representatives: findRepresentatives,
}

/** Every canonical and source URL a tool returned, with the best title near it. */
export function collectSources(value, out = new Map()) {
  if (Array.isArray(value)) { value.forEach((v) => collectSources(v, out)); return out }
  if (!value || typeof value !== 'object') return out
  const title = value.title || value.name || value.question || value.label || null
  for (const key of ['source_url', 'canonical']) {
    const url = value[key]
    if (typeof url === 'string' && /^https:\/\//.test(url) && !out.has(url)) {
      const host = new URL(url).hostname.replace(/^www\./, '')
      out.set(url, { title: title ? `${String(title).slice(0, 90)} · ${host}` : host, url })
    }
  }
  for (const v of Object.values(value)) if (v && typeof v === 'object') collectSources(v, out)
  return out
}

async function userFromToken(req) {
  const auth = getHeader(req, 'authorization')
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

/** true / false when RevenueCat can be asked, null when no key is configured. */
export async function hasProEntitlement(userId, { key = process.env.REVENUECAT_SECRET_KEY, fetchImpl = fetch } = {}) {
  if (!key) return null
  const res = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!res.ok) return false
  const body = await res.json()
  const pro = body?.subscriber?.entitlements?.pro
  if (!pro) return false
  return pro.expires_date == null || new Date(pro.expires_date).getTime() > Date.now()
}

async function callModel(messages, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: ASK_MODEL, messages, tools: TOOLS, tool_choice: 'auto' }),
  })
  if (!res.ok) throw new Error(`model ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message
}

export async function answerQuestion(question, history = [], deps = {}) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history
      .filter((t) => (t?.role === 'user' || t?.role === 'assistant') && typeof t.content === 'string')
      .slice(-6)
      .map((t) => ({ role: t.role, content: t.content.slice(0, 2000) })),
    { role: 'user', content: question },
  ]
  const sources = new Map()
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const message = await callModel(messages, deps)
    if (!message) throw new Error('empty model response')
    const calls = message.tool_calls || []
    if (!calls.length || round === MAX_TOOL_ROUNDS) {
      return { answer: String(message.content || '').replace(/\s*\u2014\s*/g, ', ').trim(), sources: [...sources.values()].slice(0, 6) }
    }
    messages.push(message)
    for (const call of calls) {
      const handler = HANDLERS[call.function?.name]
      let result
      try {
        const args = JSON.parse(call.function?.arguments || '{}')
        result = handler ? await handler(args) : { error: 'unknown tool' }
      } catch (err) {
        result = { error: 'The record could not be read for this request.' }
      }
      collectSources(result, sources)
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 12000) })
    }
  }
  throw new Error('no answer')
}

async function route(req) {
  const cors = handleCors(req, { methods: 'POST, OPTIONS' })
  if (cors) return cors
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, { Allow: 'POST' })

  const user = await userFromToken(req)
  if (!user) return jsonResponse({ error: 'Sign in to ask Dome.' }, 401)

  let pro
  try {
    pro = await hasProEntitlement(user.id)
  } catch (err) {
    console.error('[ask] entitlement check failed:', err.message)
    return jsonResponse({ error: 'Could not check your subscription. Try again.' }, 503)
  }
  if (pro === false) return jsonResponse({ error: 'Asking Dome is part of BallotWatch Pro.' }, 402)

  const rl = await checkRateLimit({ id: `ask:${user.id}`, perMinute: PER_MINUTE, perDay: pro ? PER_DAY_PRO : PER_DAY_UNVERIFIED })
  if (!rl.allowed) return jsonResponse({ error: 'Too many questions. Try again soon.' }, 429, { 'Retry-After': String(rl.retryAfter || 60) })

  let body
  try { body = await readJsonBody(req) } catch { body = {} }
  const question = String(body?.question || '').trim()
  if (!question || question.length > MAX_QUESTION) return jsonResponse({ error: `Ask a question of up to ${MAX_QUESTION} characters.` }, 400)
  if (!process.env.OPENAI_API_KEY) return jsonResponse({ error: 'Dome is not available right now.' }, 503)

  try {
    const out = await answerQuestion(question, Array.isArray(body.history) ? body.history : [])
    return jsonResponse(out, 200, { 'Cache-Control': 'no-store' })
  } catch (err) {
    console.error('[ask]', err.message)
    return jsonResponse({ error: 'Dome is not available right now.' }, 503, { 'Cache-Control': 'no-store' })
  }
}

export default nodeHandler(route)

export const config = { runtime: 'nodejs', maxDuration: 120 }
