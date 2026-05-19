import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'gpt-4o-mini'

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

Explain this state bill clearly for an average citizen:

Bill Number: ${bill.number}
Title: ${bill.title}
${bill.description ? `Description: ${bill.description}` : ''}
State: ${bill.state}
Status: ${bill.status}
${sponsors}

Write 2-3 paragraphs in plain English explaining what this bill does, why it matters, and who it affects.
Do NOT use numbered lists or bullet points. Write in flowing paragraph form only.
Do NOT include any source citations, references, footnotes, or URLs.
Keep your response factual and balanced. Avoid political bias.`
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
    if (!bill || !bill.title || !bill.number) {
      return new Response(
        JSON.stringify({ error: 'bill.title and bill.number are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    return new Response(
      JSON.stringify({ paragraphs }),
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
