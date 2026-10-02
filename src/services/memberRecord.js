import { supabase } from '../lib/supabase'
import { shapeMemberRecord, RECORD_VOTE_LIMIT } from '../../shared/memberRecord.js'

/**
 * The "record in 60 seconds" card for one member, shaped by the same pure
 * function the server uses (shared/memberRecord.js), so a client-side visit
 * and the prerendered page show identical facts. Returns null when the member
 * does not exist; throws when the database cannot be reached.
 */
export async function getMemberRecord(bioguideId) {
  const id = String(bioguideId || '').toUpperCase()
  if (!/^[A-Z]\d{6}$/.test(id)) return null

  const [memberRes, termsRes, statsRes, votesRes, metaRes] = await Promise.all([
    supabase.from('politicians').select('id, name, chamber, state, district, party, photo_url').eq('id', id).maybeSingle(),
    supabase.from('member_congress_terms').select('congress, chamber, state, district, party, term_start, term_end').eq('bioguide_id', id).order('congress', { ascending: false }),
    supabase.from('member_stats').select('congress, total_votes, yea_count, nay_count, present_count, not_voting_count').eq('politician_id', id).order('congress', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('votes')
      .select('roll_call_id, position, voted_at, source_url, bill_id, bills:bill_id ( id, title )', { count: 'exact' })
      .eq('politician_id', id)
      .order('voted_at', { ascending: false, nullsFirst: false })
      .limit(RECORD_VOTE_LIMIT),
    supabase.from('etl_metadata').select('value').eq('key', 'last_successful_run').maybeSingle(),
  ])
  if (memberRes.error) throw new Error(memberRes.error.message)
  if (!memberRes.data) return null
  if (votesRes.error) throw new Error(votesRes.error.message)

  const votes = votesRes.data || []
  const ids = [...new Set(votes.map((v) => v.roll_call_id).filter(Boolean))]
  let rollCalls = []
  let rollCallStats = []
  if (ids.length) {
    const [rcRes, rcsRes] = await Promise.all([
      supabase.from('roll_calls').select('id, question, description, bill_id').in('id', ids),
      supabase.from('roll_call_stats').select('roll_call_id, dem_yea, dem_nay, rep_yea, rep_nay, ind_yea, ind_nay').in('roll_call_id', ids),
    ])
    rollCalls = rcRes.data || []
    rollCallStats = rcsRes.data || []
  }

  return shapeMemberRecord({
    member: memberRes.data,
    terms: termsRes.data || [],
    stats: statsRes.data || null,
    votes,
    voteCount: votesRes.count ?? votes.length,
    rollCalls,
    rollCallStats,
    updatedAt: metaRes.data?.value || null,
  })
}

/**
 * The prerendered page embeds its record as #__bw_page. Use it only when it is
 * a record for this member.
 */
export function recordFromPrerender(data, bioguideId) {
  if (!data || data.kind !== 'record' || !data.id) return null
  if (String(data.id).toUpperCase() !== String(bioguideId || '').toUpperCase()) return null
  if (!Array.isArray(data.recentVotes)) return null
  return data
}
