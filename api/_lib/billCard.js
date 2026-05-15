import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: { persistSession: false },
})

const BILL_TYPE_LABELS = {
  hr: 'H.R.',
  s: 'S.',
  hjres: 'H.J.Res.',
  sjres: 'S.J.Res.',
  hconres: 'H.Con.Res.',
  sconres: 'S.Con.Res.',
  hres: 'H.Res.',
  sres: 'S.Res.',
}

export function parseBillId(billId) {
  const m = /^(\d+)-([a-z]+)-(\d+)$/i.exec(billId || '')
  if (!m) return null
  return { congress: m[1], billType: m[2].toLowerCase(), number: m[3] }
}

export function formatBillNumber({ billType, number }) {
  return `${BILL_TYPE_LABELS[billType] || billType.toUpperCase()} ${number}`
}

export function congressOrdinal(n) {
  const num = parseInt(n, 10)
  if (Number.isNaN(num)) return String(n)
  const v = num % 100
  const s = ['th', 'st', 'nd', 'rd']
  return `${num}${s[(v - 20) % 10] || s[v] || s[0]}`
}

export function chamberFromRollCall(rollCallId) {
  if (!rollCallId) return null
  const part = rollCallId.split('-')[0]
  if (part === 'house') return 'HOUSE'
  if (part === 'senate') return 'SENATE'
  return null
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  return d
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase()
}

export function clamp(s, n) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}

export async function fetchCardData(billId) {
  const parsed = parseBillId(billId)
  if (!parsed) return null

  const { data: bill } = await supabase
    .from('bills')
    .select('id, title, introduced_at, summary, crs_summary, policy_area, source_url')
    .eq('id', billId)
    .maybeSingle()

  if (!bill) return null

  const [{ data: latestVote }, { data: explanation }] = await Promise.all([
    supabase
      .from('votes')
      .select('roll_call_id, voted_at')
      .eq('bill_id', billId)
      .order('voted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('bill_explanations')
      .select('paragraphs')
      .eq('bill_key', billId.toLowerCase())
      .eq('model', 'gpt-4o-mini')
      .eq('prompt_version', 2)
      .maybeSingle(),
  ])

  let tally = null
  let question = null
  if (latestVote?.roll_call_id) {
    const [{ data: stats }, { data: rc }] = await Promise.all([
      supabase
        .from('roll_call_stats')
        .select('dem_yea, dem_nay, rep_yea, rep_nay, ind_yea, ind_nay')
        .eq('roll_call_id', latestVote.roll_call_id)
        .maybeSingle(),
      supabase
        .from('roll_calls')
        .select('question')
        .eq('id', latestVote.roll_call_id)
        .maybeSingle(),
    ])
    if (stats) {
      const yea = (stats.dem_yea || 0) + (stats.rep_yea || 0) + (stats.ind_yea || 0)
      const nay = (stats.dem_nay || 0) + (stats.rep_nay || 0) + (stats.ind_nay || 0)
      if (yea + nay > 0) {
        tally = {
          yea,
          nay,
          chamber: chamberFromRollCall(latestVote.roll_call_id),
          date: formatDate(latestVote.voted_at),
        }
      }
    }
    question = rc?.question || null
  }

  const aiOneLiner = explanation?.paragraphs?.[0] || bill.summary || bill.crs_summary || null

  return { bill, parsed, tally, question, aiOneLiner }
}
