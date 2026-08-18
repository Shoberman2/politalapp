import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NarrationItem {
  billTitle?: string
  position?: string
  matchedPartyMajority?: boolean | number | null
  partyMajorityDirection?: string | null
}

function narrationFor(item: NarrationItem) {
  const position = /^(yea|yes|aye)$/i.test(item.position || '') ? 'YES' : 'NO'
  const title = String(item.billTitle || 'an unlabeled measure').trim()
  const matched = item.matchedPartyMajority

  if (matched === null || matched === undefined) {
    return `Voted ${position} on ${title}.`
  }

  const relationship = matched === true || matched === 1 ? 'matched' : 'differed from'
  const direction = /^yea$/i.test(item.partyMajorityDirection || '') ? 'Yea' : 'Nay'
  return `Voted ${position} on ${title} — ${relationship} the party majority (${direction}).`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { items } = await req.json()
    if (!Array.isArray(items) || items.length === 0 || items.length > 24) {
      return new Response(
        JSON.stringify({ error: 'items must be an array containing 1 to 24 votes' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const narrations = items.map((item: NarrationItem) => ({
      billTitle: String(item?.billTitle || 'Unlabeled measure'),
      narration: narrationFor(item || {}),
    }))

    return new Response(
      JSON.stringify({ narrations, cached: false, source: 'recorded-data' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
