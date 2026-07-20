import { supabaseAdmin } from '../_lib/supabase.js'
import { jsonResponse, errorResponse } from '../_lib/response.js'
import { getHeader, sendResponse } from '../_lib/request.js'

// --- OpenAI helper ---

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

async function callOpenAI(apiKey, { model = 'gpt-4o-mini', messages, maxTokens = 4096, jsonSchema = null }) {
  const body = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.7,
  }

  if (jsonSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: jsonSchema.name, strict: true, schema: jsonSchema.schema },
    }
  }

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error')
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 100)}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty OpenAI response')

  return jsonSchema ? JSON.parse(content) : content
}

async function callWithRetry(apiKey, opts, stepName) {
  try {
    return await callOpenAI(apiKey, opts)
  } catch (err) {
    console.warn(`[Simulation] ${stepName} failed, retrying in 3s...`, err.message)
    await new Promise(r => setTimeout(r, 3000))
    return await callOpenAI(apiKey, opts)
  }
}

// --- JSON Schemas for structured output ---

const issuesSchema = {
  name: 'issues',
  schema: {
    type: 'object',
    properties: {
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            issue: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['issue', 'description'],
          additionalProperties: false,
        },
      },
    },
    required: ['issues'],
    additionalProperties: false,
  },
}

const billsSchema = {
  name: 'bills',
  schema: {
    type: 'object',
    properties: {
      bills: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            issue: { type: 'string' },
            provisions: {
              type: 'array',
              items: { type: 'string' },
            },
            estimated_cost: { type: 'string' },
            affected_groups: { type: 'string' },
          },
          required: ['title', 'issue', 'provisions', 'estimated_cost', 'affected_groups'],
          additionalProperties: false,
        },
      },
    },
    required: ['bills'],
    additionalProperties: false,
  },
}

const houseVotesSchema = {
  name: 'house_votes',
  schema: {
    type: 'object',
    properties: {
      votes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            bill_index: { type: 'integer' },
            yea: { type: 'integer' },
            nay: { type: 'integer' },
            passed: { type: 'boolean' },
            arguments_for: { type: 'array', items: { type: 'string' } },
            arguments_against: { type: 'array', items: { type: 'string' } },
            surprise_rationale: { type: 'string' },
          },
          required: ['bill_index', 'yea', 'nay', 'passed', 'arguments_for', 'arguments_against', 'surprise_rationale'],
          additionalProperties: false,
        },
      },
    },
    required: ['votes'],
    additionalProperties: false,
  },
}

const senateVotesSchema = {
  name: 'senate_votes',
  schema: {
    type: 'object',
    properties: {
      votes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            bill_index: { type: 'integer' },
            yea: { type: 'integer' },
            nay: { type: 'integer' },
            passed: { type: 'boolean' },
            cloture_required: { type: 'boolean' },
            cloture_votes: { type: 'integer' },
            arguments_for: { type: 'array', items: { type: 'string' } },
            arguments_against: { type: 'array', items: { type: 'string' } },
            surprise_rationale: { type: 'string' },
          },
          required: ['bill_index', 'yea', 'nay', 'passed', 'cloture_required', 'cloture_votes', 'arguments_for', 'arguments_against', 'surprise_rationale'],
          additionalProperties: false,
        },
      },
    },
    required: ['votes'],
    additionalProperties: false,
  },
}

// --- Rate limit helpers ---

async function checkRateLimit() {
  // Block if a session is currently running
  const { data: running } = await supabaseAdmin
    .from('ai_sessions')
    .select('id')
    .eq('status', 'running')
    .limit(1)

  if (running && running.length > 0) {
    return 'A simulation is already running'
  }

  // Block if last completed session was less than 1 hour ago
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: recent } = await supabaseAdmin
    .from('ai_sessions')
    .select('id')
    .eq('status', 'completed')
    .gte('created_at', oneHourAgo)
    .limit(1)

  if (recent && recent.length > 0) {
    return 'A simulation was completed less than 1 hour ago'
  }

  return null
}

// --- Fail session helper ---

async function failSession(sessionId, stepNumber, description) {
  const sanitized = `Failed at step ${stepNumber}: ${description}`
  await supabaseAdmin
    .from('ai_sessions')
    .update({ status: 'failed', error_message: sanitized })
    .eq('id', sessionId)
}

// --- Main handler ---

async function route(req) {
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED')
  }

  // Auth check
  const authHeader = getHeader(req, 'authorization')
  const token = authHeader.replace('Bearer ', '')
  const expectedKey = process.env.SIMULATION_API_KEY

  if (!expectedKey || token !== expectedKey) {
    return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return errorResponse('OpenAI API key not configured', 500, 'CONFIG_ERROR')
  }

  // Rate limit check
  const rateLimitMsg = await checkRateLimit()
  if (rateLimitMsg) {
    return errorResponse(rateLimitMsg, 429, 'RATE_LIMITED')
  }

  // Step 1: Create session
  const { data: maxRow } = await supabaseAdmin
    .from('ai_sessions')
    .select('session_number')
    .order('session_number', { ascending: false })
    .limit(1)

  const sessionNumber = (maxRow?.[0]?.session_number || 0) + 1

  const { data: session, error: sessionErr } = await supabaseAdmin
    .from('ai_sessions')
    .insert({ session_number: sessionNumber, status: 'running' })
    .select()
    .single()

  if (sessionErr || !session) {
    return errorResponse('Failed to create session', 500, 'DB_ERROR')
  }

  const sessionId = session.id

  try {
    // Step 2: Generate issues
    const issuesResult = await callWithRetry(openaiKey, {
      messages: [{
        role: 'system',
        content: 'You are a nonpartisan policy analyst identifying the most pressing issues facing the United States.'
      }, {
        role: 'user',
        content: 'List the 25 most pressing issues facing the United States right now. For each, provide a brief 1-sentence description of why it matters. Cover a diverse range: economic, social, environmental, security, infrastructure, healthcare, education, technology, and governance issues.',
      }],
      jsonSchema: issuesSchema,
    }, 'Issue identification')

    const issues = issuesResult.issues.slice(0, 25)

    // Step 3: Draft bills
    const issuesList = issues.map((i, idx) => `${idx + 1}. ${i.issue}: ${i.description}`).join('\n')

    const billsResult = await callWithRetry(openaiKey, {
      messages: [{
        role: 'system',
        content: 'You are a nonpartisan legislative drafter creating evidence-based legislation for the United States Congress.',
      }, {
        role: 'user',
        content: `Draft a concise bill for each of the following issues. For each bill provide: a clear title, 3-5 key provisions, an estimated annual cost or savings to the federal government, and who the bill primarily affects.\n\nIssues:\n${issuesList}`,
      }],
      maxTokens: 8000,
      jsonSchema: billsSchema,
    }, 'Bill drafting')

    // Insert bills into Supabase (votes null for now)
    const billRows = billsResult.bills.slice(0, 25).map((bill, idx) => ({
      session_id: sessionId,
      title: bill.title,
      issue: issues[idx]?.issue || bill.issue,
      provisions: bill.provisions,
      estimated_cost: bill.estimated_cost,
      affected_groups: bill.affected_groups,
      sort_order: idx,
    }))

    const { data: insertedBills, error: billsErr } = await supabaseAdmin
      .from('ai_bills')
      .insert(billRows)
      .select()

    if (billsErr) {
      await failSession(sessionId, 3, 'Failed to insert bills into database')
      return jsonResponse({ session_id: sessionId, status: 'failed', error: 'Bill insertion failed' }, 500)
    }

    // Step 4: House votes
    const billSummaries = insertedBills.map((b, idx) =>
      `Bill ${idx + 1}: "${b.title}" — Provisions: ${(b.provisions || []).join('; ')}. Cost: ${b.estimated_cost}. Affects: ${b.affected_groups}.`
    ).join('\n\n')

    const houseResult = await callWithRetry(openaiKey, {
      messages: [{
        role: 'system',
        content: `You are simulating the U.S. House of Representatives (435 members, current composition: approximately 220 Republicans, 215 Democrats). Vote on each bill based on policy evidence, constituent welfare, constitutional constraints, and practical feasibility — NOT party loyalty or donor pressure. This is an idealized Congress where members vote on the merits. Not every bill should pass. Bills that are well-intentioned but practically unworkable, unconstitutional, or too costly should fail. Be realistic about political disagreements that exist even without partisanship. Yea + Nay must equal 435 for each bill.`,
      }, {
        role: 'user',
        content: `Vote on each of the following bills. For each, provide the vote tally, whether it passed (simple majority: 218+), 2-3 key arguments for, 2-3 key arguments against, and the single most surprising aspect of the vote.\n\n${billSummaries}`,
      }],
      maxTokens: 8000,
      jsonSchema: houseVotesSchema,
    }, 'House vote generation')

    // Update bills with House votes
    for (const vote of houseResult.votes) {
      const bill = insertedBills[vote.bill_index]
      if (!bill) continue
      await supabaseAdmin
        .from('ai_bills')
        .update({
          house_yea: vote.yea,
          house_nay: vote.nay,
          house_passed: vote.passed,
          house_arguments_for: vote.arguments_for,
          house_arguments_against: vote.arguments_against,
        })
        .eq('id', bill.id)
    }

    // Step 5: Senate votes
    const senateResult = await callWithRetry(openaiKey, {
      messages: [{
        role: 'system',
        content: `You are simulating the U.S. Senate (100 members, current composition: approximately 53 Republicans, 45 Democrats, 2 Independents who caucus with Democrats). Vote on each bill based on policy evidence, constituent welfare, constitutional constraints, and practical feasibility — NOT party loyalty or donor pressure. This is an idealized Senate where members vote on the merits. Consider filibuster dynamics: controversial bills may require 60 votes for cloture. Budget-related bills can pass via reconciliation with a simple majority. Not every bill should pass. Yea + Nay must equal 100 for each bill.`,
      }, {
        role: 'user',
        content: `Vote on each of the following bills in the Senate. For each, provide: the vote tally, whether it passed, whether cloture was required (and if so, the cloture vote count), 2-3 key arguments for, 2-3 key arguments against, and the single most surprising aspect of the vote.\n\n${billSummaries}`,
      }],
      maxTokens: 8000,
      jsonSchema: senateVotesSchema,
    }, 'Senate vote generation')

    // Update bills with Senate votes + final passed status
    let billsPassed = 0
    let billsFailed = 0

    for (const vote of senateResult.votes) {
      const bill = insertedBills[vote.bill_index]
      if (!bill) continue

      // Get House result for this bill
      const houseVote = houseResult.votes.find(v => v.bill_index === vote.bill_index)
      const housePassed = houseVote?.passed || false
      const passed = housePassed && vote.passed

      if (passed) billsPassed++
      else billsFailed++

      await supabaseAdmin
        .from('ai_bills')
        .update({
          senate_yea: vote.yea,
          senate_nay: vote.nay,
          senate_passed: vote.passed,
          senate_cloture_required: vote.cloture_required,
          senate_cloture_votes: vote.cloture_votes,
          senate_arguments_for: vote.arguments_for,
          senate_arguments_against: vote.arguments_against,
          passed,
          surprise_rationale: vote.surprise_rationale || houseVote?.surprise_rationale || '',
        })
        .eq('id', bill.id)
    }

    // Step 6: Session summary (GPT-4o for editorial quality)
    const passedBills = insertedBills
      .filter((_, idx) => {
        const hv = houseResult.votes.find(v => v.bill_index === idx)
        const sv = senateResult.votes.find(v => v.bill_index === idx)
        return hv?.passed && sv?.passed
      })
      .map(b => b.title)

    const failedBills = insertedBills
      .filter((_, idx) => {
        const hv = houseResult.votes.find(v => v.bill_index === idx)
        const sv = senateResult.votes.find(v => v.bill_index === idx)
        return !(hv?.passed && sv?.passed)
      })
      .map(b => b.title)

    const summaryText = await callWithRetry(openaiKey, {
      model: 'gpt-4o',
      messages: [{
        role: 'system',
        content: 'You are an editorial writer for a respected political magazine, summarizing an AI Congress simulation session.',
      }, {
        role: 'user',
        content: `Summarize this AI Congress session in 2-3 paragraphs. ${billsPassed} of ${insertedBills.length} bills passed both chambers.\n\nPassed: ${passedBills.join(', ')}\n\nFailed: ${failedBills.join(', ')}\n\nWhat passed, what failed, what was surprising, and what does this tell us about evidence-based governance? Write in an engaging, editorial style. No bullet points.`,
      }],
      maxTokens: 1500,
    }, 'Session summary generation')

    // Update session as completed
    await supabaseAdmin
      .from('ai_sessions')
      .update({
        status: 'completed',
        summary: summaryText,
        bills_passed: billsPassed,
        bills_failed: billsFailed,
        total_bills: insertedBills.length,
      })
      .eq('id', sessionId)

    return jsonResponse({
      session_id: sessionId,
      session_number: sessionNumber,
      status: 'completed',
      bills_passed: billsPassed,
      bills_failed: billsFailed,
      total_bills: insertedBills.length,
    })

  } catch (err) {
    console.error('[Simulation] Fatal error:', err.message)
    await failSession(sessionId, 0, 'Unexpected error during simulation')
    return jsonResponse({
      session_id: sessionId,
      status: 'failed',
      error: 'Simulation failed unexpectedly',
    }, 500)
  }
}

export default async function handler(req, res) {
  return sendResponse(res, await route(req))
}

export const config = { maxDuration: 300 }
