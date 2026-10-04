// Data for the "record in 60 seconds" share image (api/og.jsx?kind=record).
// Edge runtime, anon key, same public tables the app reads. Only the facts
// the card itself shows: seat, and votes cast / not voting this Congress.
// Never anything from campaign-finance tables.

import { createClient } from '@supabase/supabase-js'
import { shapeMemberRecord } from '../../shared/memberRecord.js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

let client = null
function db() {
  if (!client) client = createClient(supabaseUrl || '', supabaseAnonKey || '', { auth: { persistSession: false } })
  return client
}

export async function fetchRecordCardData(bioguideId, supabase = db()) {
  const id = String(bioguideId || '').toUpperCase()
  if (!/^[A-Z]\d{6}$/.test(id)) return null

  const [memberRes, termsRes, statsRes, metaRes] = await Promise.all([
    supabase.from('politicians').select('id, name, chamber, state, district, party').eq('id', id).maybeSingle(),
    supabase.from('member_congress_terms').select('congress, district, term_start, term_end').eq('bioguide_id', id).order('congress', { ascending: false }).limit(4),
    supabase.from('member_stats').select('congress, total_votes, yea_count, nay_count, present_count, not_voting_count').eq('politician_id', id).order('congress', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('etl_metadata').select('value').eq('key', 'last_successful_run').maybeSingle(),
  ])
  // Any failed read throws, so og.jsx serves its short-lived fallback card
  // instead of caching a real member's card as "0 votes" for a day.
  for (const res of [memberRes, termsRes, statsRes, metaRes]) {
    if (res?.error) throw new Error(res.error.message || 'record card query failed')
  }
  const member = memberRes.data
  const terms = termsRes.data
  const stats = statsRes.data
  const meta = metaRes.data
  if (!member) return null
  return shapeMemberRecord({
    member,
    terms: terms || [],
    stats: stats || null,
    votes: [],
    voteCount: stats?.total_votes ?? 0,
    updatedAt: meta?.value || null,
  })
}
