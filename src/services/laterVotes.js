import { supabase } from '../lib/supabase'
import { parseRollCallId, rollCallHref } from './floorVotes'

// "You wrote; they voted": recorded votes by one member on one bill after a
// given day. Only rows that exist in `votes` are returned; the question comes
// from `roll_calls` when we hold it. Nothing is inferred or filled in.

const MAX_ROWS = 50

/**
 * @param {object} args
 * @param {string} args.bioguideId  member (votes.politician_id)
 * @param {string} args.billId      e.g. "119-hr-1"
 * @param {string} args.afterDay    YYYY-MM-DD; votes strictly after this day
 * @returns {Promise<Array<{position, votedAt, rollCallId, rollNumber, chamber, href, question}>|null>}
 *   oldest first; [] when there are none; null when the lookup failed.
 */
export async function getMemberVotesOnBillAfter({ bioguideId, billId, afterDay }) {
  if (!bioguideId || !billId || !/^\d{4}-\d{2}-\d{2}$/.test(String(afterDay || ''))) return []
  try {
    const { data: rows, error } = await supabase
      .from('votes')
      .select('position, voted_at, roll_call_id')
      .eq('politician_id', String(bioguideId).toUpperCase())
      .eq('bill_id', String(billId).toLowerCase())
      .gt('voted_at', afterDay)
      .order('voted_at', { ascending: true })
      .limit(MAX_ROWS)
    if (error) return null
    const votes = (rows || []).filter((r) => r && r.position && r.voted_at)
    if (!votes.length) return []

    const ids = [...new Set(votes.map((v) => v.roll_call_id).filter(Boolean))]
    const questions = new Map()
    if (ids.length) {
      const { data: calls, error: callsError } = await supabase
        .from('roll_calls')
        .select('id, question')
        .in('id', ids)
      if (!callsError) for (const c of calls || []) questions.set(c.id, c.question || null)
    }

    return votes
      .map((v) => {
        const meta = parseRollCallId(v.roll_call_id)
        return {
          position: v.position,
          votedAt: v.voted_at,
          rollCallId: v.roll_call_id || null,
          rollNumber: meta?.number ?? null,
          chamber: meta?.chamber ?? null,
          href: v.roll_call_id ? rollCallHref(v.roll_call_id) : null,
          question: questions.get(v.roll_call_id) || null,
        }
      })
      .sort((a, b) => (a.votedAt < b.votedAt ? -1 : a.votedAt > b.votedAt ? 1 : (a.rollNumber || 0) - (b.rollNumber || 0)))
  } catch {
    return null
  }
}
