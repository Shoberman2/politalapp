import { supabase } from '../lib/supabase'

/**
 * Fetch voting dashboard data for a member from Supabase.
 * Returns votes with joined bill data, roll_call_stats (if populated), and
 * member stats. Falls back to null if Supabase is empty or unavailable.
 *
 * roll_call_stats is fetched in a second query keyed by roll_call_id. If the
 * table doesn't exist (migration 002 not yet run) or an entry is missing
 * (ETL hasn't populated it yet), the Voting Pattern Analysis classifier
 * gracefully degrades to 2-signal mode.
 */
export async function getMemberDashboardData(politicianId, limit = 500) {
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

    // Fetch roll_call_stats for the vote set. One batched IN query.
    // If the table doesn't exist yet (migration not run), this fails silently
    // and the classifier degrades to 2-signal mode.
    const rollCallIds = [...new Set(votes.map(v => v.roll_call_id).filter(Boolean))]
    const rollCallStatsMap = new Map()
    if (rollCallIds.length > 0) {
      const { data: rcs, error: rcsError } = await supabase
        .from('roll_call_stats')
        .select('roll_call_id, dem_yea, dem_nay, rep_yea, rep_nay, ind_yea, ind_nay')
        .in('roll_call_id', rollCallIds)

      if (rcsError) {
        // Table may not exist yet — log once, continue with empty map.
        if (!rcsError.message?.includes('does not exist')) {
          console.warn('[SupabaseVotes] roll_call_stats query failed:', rcsError.message)
        }
      } else if (Array.isArray(rcs)) {
        for (const r of rcs) rollCallStatsMap.set(r.roll_call_id, r)
      }
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
        roll_call_stats: v.roll_call_id ? rollCallStatsMap.get(v.roll_call_id) ?? null : null,
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
