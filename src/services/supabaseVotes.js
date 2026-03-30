import { supabase } from '../lib/supabase'

/**
 * Fetch voting dashboard data for a member from Supabase.
 * Returns votes with joined bill data and member stats.
 * Falls back to null if Supabase is empty or unavailable.
 */
export async function getMemberDashboardData(politicianId, limit = 50) {
  try {
    // Fetch votes with bill data
    const { data: votes, error: votesError } = await supabase
      .from('votes')
      .select(`
        *,
        bills:bill_id (
          id,
          title,
          crs_summary,
          summary,
          policy_area,
          source_url
        )
      `)
      .eq('politician_id', politicianId)
      .order('voted_at', { ascending: false })
      .limit(limit)

    if (votesError) {
      console.warn('[SupabaseVotes] Votes query failed:', votesError.message)
      return null
    }

    // Fetch member stats separately (single row)
    const { data: stats, error: statsError } = await supabase
      .from('member_stats')
      .select('*')
      .eq('politician_id', politicianId)
      .limit(1)
      .maybeSingle()

    if (statsError) {
      console.warn('[SupabaseVotes] Stats query failed:', statsError.message)
    }

    // Fetch ETL staleness
    const { data: metadata } = await supabase
      .from('etl_metadata')
      .select('value')
      .eq('key', 'last_successful_run')
      .maybeSingle()

    const lastRun = metadata?.value ? new Date(metadata.value) : null
    const isStale = lastRun
      ? (Date.now() - lastRun.getTime()) > 48 * 60 * 60 * 1000
      : true

    if (!votes || votes.length === 0) {
      return null // Signal to fall back to live API
    }

    return {
      votes: votes.map(v => ({
        politician_id: v.politician_id,
        bill_id: v.bill_id,
        roll_call_id: v.roll_call_id,
        position: v.position,
        voted_at: v.voted_at,
        source_url: v.source_url,
        bill: v.bills || null,
      })),
      stats: stats || null,
      lastRun,
      isStale,
    }
  } catch (err) {
    console.error('[SupabaseVotes] Dashboard query failed:', err)
    return null
  }
}
