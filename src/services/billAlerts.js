import { supabase } from '../lib/supabase'

function result(data, error) {
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? data[0] : data
}

export async function getBillFollow(billId) {
  const { data, error } = await supabase
    .from('bill_follows')
    .select('*')
    .eq('bill_id', billId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function startBillFollow(billId, options = {}) {
  const { data, error } = await supabase.rpc('start_or_resume_bill_follow', {
    p_bill_id: billId,
    p_committee_alerts: options.committeeAlerts ?? true,
    p_floor_alerts: options.floorAlerts ?? true,
    p_vote_alerts: options.voteAlerts ?? true,
  })
  return result(data, error)
}

export async function updateBillFollow(billId, options) {
  const { data, error } = await supabase.rpc('update_my_bill_follow', {
    p_bill_id: billId,
    p_committee_alerts: options.committeeAlerts,
    p_floor_alerts: options.floorAlerts,
    p_vote_alerts: options.voteAlerts,
    p_email_enabled: options.emailEnabled,
    p_paused: options.paused,
  })
  return result(data, error)
}

export async function stopBillFollow(billId) {
  const { data, error } = await supabase.rpc('stop_bill_follow', { p_bill_id: billId })
  if (error) throw new Error(error.message)
  return data === true
}

export async function getBillFollows() {
  const { data, error } = await supabase
    .from('bill_follows')
    .select('*,bills(id,title,source_url)')
    .is('stopped_at', null)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getBillAlertHistory(limit = 50) {
  const { data, error } = await supabase.rpc('get_my_bill_alert_history', {
    p_limit: limit,
    p_before: null,
  })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getBillAlertPreference(userId) {
  const { data, error } = await supabase
    .from('bill_alert_preferences')
    .select('email_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function setAllBillAlertEmailEnabled(enabled) {
  const { data, error } = await supabase.rpc('set_my_bill_alert_email_enabled', {
    p_email_enabled: enabled,
  })
  return result(data, error)
}
