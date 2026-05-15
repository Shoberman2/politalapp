import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'gpt-4o-mini'
const PROMPT_VERSION = 2

function buildPrompt(title: string, summary: string): string {
  const summaryBlock = summary
    ? `Here is the official summary from Congress.gov to ground your explanation:\n${summary}\n`
    : `No official summary is available yet. Reason from the title and your general knowledge of how this kind of legislation typically works. Be explicit when you are inferring vs. citing the bill itself.\n`

  return `You are a nonpartisan expert at explaining U.S. legislation to ordinary citizens. You write like a great civics teacher: clear, specific, never condescending.

Bill: ${title}

${summaryBlock}
Write a depth explanation of this bill. Aim for 4 to 6 substantive paragraphs, written in plain English. Cover each of these in order, in flowing prose (no headers, no bullet points, no numbered lists):

1. What the bill actually does. The specific changes to law, programs, agencies, eligibility, funding, or rules. If the title is vague, say what category of bill this is and what the most likely concrete effects would be based on the text or category.
2. Why this bill exists right now. What problem its sponsors say it solves, what political or current event likely motivated it, what tradeoffs it makes.
3. Who is directly affected. Name the groups: which taxpayers, which workers, which industries, which states, which agencies, which beneficiaries. Use concrete examples ("a single parent earning $40k", "small farms in the Midwest", "Medicare Part D enrollees").
4. The likely real-world impact if it became law. Both the intended outcomes and the second-order effects opponents typically raise.
5. Realistic chances of becoming law. Note whether it is bipartisan or single-party, whether it has cleared committee, whether similar bills have failed before. Do not predict, just describe the situation.
6. Why a regular citizen should care, in one direct paragraph.

Hard rules:
- Plain language. No legalese, no jargon, no acronyms without expanding them once.
- Be specific. "This affects taxpayers" is useless. "This affects single filers earning over $200,000" is useful.
- Be balanced. Present both sides where there is genuine disagreement.
- No citations, URLs, footnotes, or bracketed source markers.
- No headers, no bullets, no numbered lists. Flowing paragraphs only.
- Do not invent specific dollar amounts, dates, or vote tallies you are not sure of. If you do not know, describe in general terms.`
}

function cleanResponse(text: string): { explanation: string; paragraphs: string[] } {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\[\d+\]/g, '')
    .replace(/\(source:.*?\)/gi, '')
    .trim()

  const paragraphs = cleaned
    .split(/\n\s*\n/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(p => p.length > 0)

  const explanation = paragraphs[0] || ''
  return { explanation, paragraphs }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { congress, billType, number, title, summary } = await req.json()

    if (!congress || !billType || !number || !title) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: congress, billType, number, title' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const billKey = `${congress}-${String(billType).toLowerCase()}-${number}`

    // Service role client — bypasses RLS for the upsert.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1) Cache lookup
    const { data: cached } = await supabase
      .from('bill_explanations')
      .select('explanation, paragraphs')
      .eq('bill_key', billKey)
      .eq('model', MODEL)
      .eq('prompt_version', PROMPT_VERSION)
      .maybeSingle()

    if (cached) {
      return new Response(
        JSON.stringify({ explanation: cached.explanation, paragraphs: cached.paragraphs, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2) Cache miss → call OpenAI
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: buildPrompt(title, summary || '') }],
        max_tokens: 2500,
        temperature: 0.5,
      }),
    })

    if (!openaiRes.ok) {
      const errText = await openaiRes.text()
      console.error('OpenAI error:', openaiRes.status, errText)
      return new Response(
        JSON.stringify({ error: 'OpenAI request failed' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await openaiRes.json()
    const raw = data.choices?.[0]?.message?.content || ''
    const { explanation, paragraphs } = cleanResponse(raw)

    if (!explanation || paragraphs.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Empty response from model' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3) Persist
    await supabase
      .from('bill_explanations')
      .upsert({
        bill_key: billKey,
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        bill_title: title,
        explanation,
        paragraphs,
      })

    return new Response(
      JSON.stringify({ explanation, paragraphs, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('explain-bill error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
