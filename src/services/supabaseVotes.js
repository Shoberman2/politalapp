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

    // Fetch roll_call_stats and roll_calls for the vote set in parallel.
    // Both tables key off roll_call_id; this is two batched IN queries.
    // Each table may not exist yet (migration not run) — graceful degradation.
    //
    // Use allSettled so a transient network failure on one query doesn't
    // erase the other's good data. Promise.all would reject the whole
    // expression on first rejection.
    const rollCallIds = [...new Set(votes.map(v => v.roll_call_id).filter(Boolean))]
    const rollCallStatsMap = new Map()
    const rollCallsMap = new Map()
    if (rollCallIds.length > 0) {
      const [statsSettled, callsSettled] = await Promise.allSettled([
        supabase
          .from('roll_call_stats')
          .select('roll_call_id, dem_yea, dem_nay, rep_yea, rep_nay, ind_yea, ind_nay')
          .in('roll_call_id', rollCallIds),
        supabase
          .from('roll_calls')
          .select('id, bill_id, question, description')
          .in('id', rollCallIds),
      ])

      if (statsSettled.status === 'fulfilled') {
        const statsRes = statsSettled.value
        if (statsRes.error) {
          if (!statsRes.error.message?.includes('does not exist')) {
            console.warn('[SupabaseVotes] roll_call_stats query failed:', statsRes.error.message)
          }
        } else if (Array.isArray(statsRes.data)) {
          for (const r of statsRes.data) rollCallStatsMap.set(r.roll_call_id, r)
        }
      } else {
        console.warn('[SupabaseVotes] roll_call_stats query rejected:', statsSettled.reason)
      }

      if (callsSettled.status === 'fulfilled') {
        const callsRes = callsSettled.value
        if (callsRes.error) {
          if (!callsRes.error.message?.includes('does not exist')) {
            console.warn('[SupabaseVotes] roll_calls query failed:', callsRes.error.message)
          }
        } else if (Array.isArray(callsRes.data)) {
          for (const r of callsRes.data) rollCallsMap.set(r.id, r)
        }
      } else {
        console.warn('[SupabaseVotes] roll_calls query rejected:', callsSettled.reason)
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
        roll_call: v.roll_call_id ? rollCallsMap.get(v.roll_call_id) ?? null : null,
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
