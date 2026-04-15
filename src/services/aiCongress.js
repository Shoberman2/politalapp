import { supabase } from '../lib/supabase'

/**
 * Fetch all AI Congress sessions, newest first.
 * Only returns completed or failed sessions (not running).
 */
export async function getSessions() {
  const { data, error } = await supabase
    .from('ai_sessions')
    .select('id, session_number, status, summary, bills_passed, bills_failed, total_bills, created_at')
    .in('status', ['completed', 'failed'])
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('[AiCongress] Sessions query failed:', error.message)
    return []
  }

  return data || []
}

/**
 * Fetch a single AI Congress session with all its bills.
 */
export async function getSession(sessionId) {
  const { data: session, error: sessionError } = await supabase
    .from('ai_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (sessionError || !session) {
    console.warn('[AiCongress] Session query failed:', sessionError?.message)
    return null
  }

  const { data: bills, error: billsError } = await supabase
    .from('ai_bills')
    .select('*')
    .eq('session_id', sessionId)
    .order('sort_order', { ascending: true })

  if (billsError) {
    console.warn('[AiCongress] Bills query failed:', billsError.message)
    return { ...session, bills: [] }
  }

  return { ...session, bills: bills || [] }
}
