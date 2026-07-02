import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'gpt-4o-mini'
const PROMPT_VERSION = 2

interface StateBill {
  bill_id: string | number
  number: string
  title: string
  description?: string
  state: string
  status: string
  sponsors?: Array<{ name: string; party: string }>
}

function buildPrompt(bill: StateBill): string {
  const sponsors = bill.sponsors?.length
    ? `Sponsors: ${bill.sponsors.map(s => `${s.name} (${s.party})`).join(', ')}`
    : ''
  return `You are a nonpartisan expert at explaining state legislation in plain language.

Explain this state bill clearly for a general reader:

Bill Number: ${bill.number}
Title: ${bill.title}
${bill.description ? `Description: ${bill.description}` : ''}
State: ${bill.state}
Status: ${bill.status}
${sponsors}

Write 2-3 paragraphs in plain English explaining what this bill does, what public issue it addresses, and who it affects.
Do NOT use numbered lists or bullet points. Write in flowing paragraph form only.
Do NOT include any source citations, references, footnotes, or URLs.
Keep your response factual and balanced. Avoid political bias, advocacy language, praise, criticism, endorsement, or opposition.`
}

function toParagraphs(raw: string): string[] {
  return raw
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\[\d+\]/g, '')
    .trim()
    .split(/\n\s*\n/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(p => p.length > 0)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { bill } = await req.json() as { bill?: StateBill }
    if (!bill || !bill.title || !bill.number || bill.bill_id === undefined || bill.bill_id === null) {
      return new Response(
        JSON.stringify({ error: 'bill.bill_id, bill.title, bill.number are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const billKey = String(bill.bill_id)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1) Cache lookup
    const { data: cached } = await supabase
      .from('state_bill_explanations')
      .select('paragraphs')
      .eq('bill_id', billKey)
      .eq('model', MODEL)
      .eq('prompt_version', PROMPT_VERSION)
      .maybeSingle()

    if (cached) {
      return new Response(
        JSON.stringify({ paragraphs: cached.paragraphs, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2) Cache miss → OpenAI
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
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: buildPrompt(bill) }],
        max_tokens: 1500,
        temperature: 0.4,
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
    const paragraphs = toParagraphs(raw)

    if (paragraphs.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Empty response from model' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3) Persist
    await supabase
      .from('state_bill_explanations')
      .upsert({
        bill_id: billKey,
        state: bill.state || null,
        bill_title: bill.title,
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        paragraphs,
      })

    return new Response(
      JSON.stringify({ paragraphs, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('explain-state-bill error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
