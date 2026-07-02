import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'gpt-4o-mini'
const PROMPT_VERSION = 2

const SYSTEM_PROMPT = [
  'You are a neutral civic journalist describing how a U.S. senator or representative voted.',
  'For each vote I send, write ONE sentence under 25 words.',
  'Rules:',
  '- Describe what the rep did and cite at least one number (vote margin, percentage, or count).',
  '- Do NOT speculate about motive.',
  '- Avoid judgmental verbs. Prefer "matched" and "differed from" over "aligned", "betrayed", "defied", or "sided with".',
  '- Do NOT use these words: bias, biased, anti-American, corruption, influence-peddling.',
  '- Match the register of a newspaper beat reporter, not a pundit.',
  'Return ONLY valid JSON of the shape:',
  '{ "narrations": [ { "billTitle": "...", "narration": "..." } ] }',
  'Return narrations in the same order as the input votes.',
].join('\n')

// Canonical-JSON stringify: keys sorted recursively so two semantically equal
// item arrays always produce the same hash. This drives the cache key.
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']'
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize((value as Record<string, unknown>)[k])).join(',') + '}'
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { items } = await req.json()
    if (!Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: 'items must be a non-empty array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cacheKey = await sha256Hex(canonicalize(items))

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1) Cache lookup
    const { data: cached } = await supabase
      .from('narration_cache')
      .select('narrations')
      .eq('cache_key', cacheKey)
      .eq('model', MODEL)
      .eq('prompt_version', PROMPT_VERSION)
      .maybeSingle()

    if (cached) {
      return new Response(
        JSON.stringify({ narrations: cached.narrations, cached: true }),
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
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify({ votes: items }) },
        ],
        max_tokens: 1500,
        temperature: 0.4,
        response_format: { type: 'json_object' },
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
    const content = data.choices?.[0]?.message?.content || ''
    let parsed: { narrations?: unknown }
    try {
      parsed = JSON.parse(content)
    } catch {
      return new Response(
        JSON.stringify({ error: 'Model returned non-JSON' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!Array.isArray(parsed.narrations)) {
      return new Response(
        JSON.stringify({ error: 'Model response missing narrations array' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3) Persist
    await supabase
      .from('narration_cache')
      .upsert({
        cache_key: cacheKey,
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        narrations: parsed.narrations,
      })

    return new Response(
      JSON.stringify({ narrations: parsed.narrations, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('narrate-votes error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
