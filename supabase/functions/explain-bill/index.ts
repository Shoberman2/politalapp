import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// This endpoint intentionally caches official CRS summaries instead of asking
// a model to infer or rewrite legislative provisions. Keep these values in sync
// with etl/preWarmBillExplanations.ts.
const MODEL = 'official-crs'
const PROMPT_VERSION = 1

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  }
  return text
    .replace(/&([a-z]+);/gi, (entity, name) => named[String(name).toLowerCase()] ?? entity)
    .replace(/&#(\d+);/g, (entity, code) => {
      const value = Number(code)
      return Number.isSafeInteger(value) && value >= 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : entity
    })
}

function officialParagraphs(summary: string, title: string): string[] {
  const text = decodeEntities(String(summary || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' '))

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  if (paragraphs.length > 1) {
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (normalize(paragraphs[0]) === normalize(title || '')) paragraphs.shift()
  }
  return paragraphs
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function fetchOfficialBill(
  congress: number,
  billType: string,
  number: number,
): Promise<{ title: string; summary: string }> {
  const apiKey = Deno.env.get('CONGRESS_API_KEY')
  if (!apiKey) throw new Error('CONGRESS_API_KEY not configured')

  const root = `https://api.congress.gov/v3/bill/${congress}/${billType}/${number}`
  const load = async (url: string) => {
    const target = new URL(url)
    target.searchParams.set('format', 'json')
    target.searchParams.set('api_key', apiKey)
    const response = await fetch(target)
    if (!response.ok) throw new Error(`Congress.gov request failed (${response.status})`)
    return response.json()
  }

  const [detail, summaryData] = await Promise.all([
    load(root),
    load(`${root}/summaries`),
  ])
  const summaries = Array.isArray(summaryData?.summaries) ? summaryData.summaries : []
  const latest = [...summaries].sort((left, right) => {
    const leftDate = Date.parse(left?.updateDate || '') || 0
    const rightDate = Date.parse(right?.updateDate || '') || 0
    return leftDate - rightDate
  }).at(-1)

  return {
    title: String(detail?.bill?.title || `${billType.toUpperCase()} ${number}`),
    summary: String(latest?.text || ''),
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const congress = Number(body?.congress)
    const number = Number(body?.number)
    const billType = String(body?.billType || '').toLowerCase()

    if (!Number.isInteger(congress) || congress < 1
      || !Number.isInteger(number) || number < 1
      || !/^[a-z]+$/.test(billType)) {
      return json({ error: 'Invalid required fields: congress, billType, number' }, 400)
    }

    let officialBill: { title: string; summary: string }
    try {
      officialBill = await fetchOfficialBill(congress, billType, number)
    } catch (error) {
      console.error('Official bill source unavailable:', error)
      return json({ error: 'Official Congress.gov summary could not be loaded' }, 502)
    }

    const paragraphs = officialParagraphs(officialBill.summary, officialBill.title)
    if (paragraphs.length === 0) {
      const unavailable = [
        'Congress.gov has not published an official summary for this bill yet.',
        'BallotWatch won’t infer provisions from the title alone. Use the official bill text for details.',
      ]
      return json({
        explanation: unavailable[0],
        paragraphs: unavailable,
        cached: false,
        isGenerated: false,
        sourceUnavailable: true,
      })
    }

    const billKey = `${congress}-${String(billType).toLowerCase()}-${number}`
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const explanation = paragraphs[0]
    const { error: cacheError } = await supabase
      .from('bill_explanations')
      .upsert({
        bill_key: billKey,
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        bill_title: officialBill.title,
        explanation,
        paragraphs,
      })

    if (cacheError) console.error('Official summary cache write failed:', cacheError.message)

    return json({
      explanation,
      paragraphs,
      cached: false,
      isGenerated: false,
      sourceUnavailable: false,
    })
  } catch (err) {
    console.error('explain-bill error:', err)
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500)
  }
})
