import { supabase } from '../lib/supabase'

// Stores a vote-alert email signup. Inserts into `vote_alert_subscribers`
// (migration 010), which has an anon INSERT-only RLS policy so the public
// can subscribe but the list can't be read back. A duplicate email is
// treated as success (already subscribed). Returns true on success.
export async function subscribeToAlerts(email) {
  try {
    const { error } = await supabase
      .from('vote_alert_subscribers')
      .insert({ email, source: 'landing' })
    // 23505 = unique_violation (already subscribed) — that's a success for the user.
    if (error && error.code !== '23505') {
      console.warn('[alerts] signup failed:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.warn('[alerts] signup error:', err)
    return false
  }
}
