import { supabase } from '../lib/supabase'

// Reads the most recent recorded floor votes straight from the database for the
// front page. Deliberately conservative: it only surfaces fields we can stand
// behind. Bill *titles* in our table are often placeholder stubs ("HR 915") and
// some ETL'd tallies are corrupt (party columns double-counted), so we show the
// bill *number* (not title) and a Yea/Nay count ONLY when it passes a sanity
// check against the chamber size. Nothing here is fabricated; missing data is
// simply omitted.

const CHAMBER_SIZE = { House: 435, Senate: 100 }

const BILL_TYPE_LABELS = {
  hr: 'H.R.', s: 'S.', hres: 'H.Res.', sres: 'S.Res.',
  hjres: 'H.J.Res.', sjres: 'S.J.Res.', hconres: 'H.Con.Res.', sconres: 'S.Con.Res.',
}

// "house-119-2-225" -> { chamber:'House', congress:119, number:225 }
function parseRollCallId(id) {
  const m = /^([a-z]+)-(\d+)-\d+-(\d+)$/.exec(id || '')
  if (!m) return null
  return {
    chamber: m[1] === 'senate' ? 'Senate' : 'House',
    congress: Number(m[2]),
    number: Number(m[3]),
  }
}

// "119-hr-7401" -> { display:'H.R. 7401', href:'/bill/119/hr/7401' }
function parseBill(billId) {
  if (!billId) return null
  const parts = billId.split('-')
  if (parts.length < 3) return null
  const [congress, type, ...rest] = parts
  const number = rest.join('-')
  return {
    display: `${BILL_TYPE_LABELS[type] || type.toUpperCase()} ${number}`,
    href: `/bill/${congress}/${type}/${number}`,
  }
}

// Result word, derived only from a tally we trust. Uses the real thresholds:
// cloture needs 60 in the Senate, suspension of the rules needs two-thirds,
// everything else is a simple majority. Returns null when we shouldn't assert.
function deriveResult(question, yea, nay, chamber) {
  if (yea == null || nay == null) return null
  const q = (question || '').toLowerCase()
  if (q.includes('cloture')) return yea >= 60 ? 'Cloture invoked' : 'Cloture rejected'
  if (q.includes('nomination') || q.includes('confirmation')) return yea > nay ? 'Confirmed' : 'Rejected'
  if (q.includes('suspend')) return yea / (yea + nay) >= 2 / 3 ? 'Passed' : 'Failed'
  if (q.includes('proceed')) return yea > nay ? 'Motion agreed to' : 'Motion rejected'
  if (yea === nay) return 'Failed on a tie'
  return yea > nay ? 'Passed' : 'Failed'
}

function tallyFor(stats, chamber) {
  if (!stats) return { yea: null, nay: null, valid: false }
  const yea = (stats.dem_yea || 0) + (stats.rep_yea || 0) + (stats.ind_yea || 0)
  const nay = (stats.dem_nay || 0) + (stats.rep_nay || 0) + (stats.ind_nay || 0)
  const total = yea + nay
  const max = CHAMBER_SIZE[chamber] || 435
  // Reject impossible totals (double-counted ETL rows) and empty rows.
  const valid = total > 0 && total <= max
  return valid ? { yea, nay, valid: true } : { yea: null, nay: null, valid: false }
}

/**
 * Returns { votes: [...], recordedThrough: 'YYYY-MM-DD' | null } or null.
 * `votes` carries only presentable, trustworthy fields.
 */
export async function getRecentFloorVotes(fetchCount = 16) {
  try {
    const { data: calls, error } = await supabase
      .from('roll_calls')
      .select('id, bill_id, question, description, created_at')
      .order('created_at', { ascending: false })
      .limit(fetchCount)

    if (error || !calls?.length) return null

    const ids = calls.map((c) => c.id)
    const billIds = [...new Set(calls.map((c) => c.bill_id).filter(Boolean))]

    const [statsSettled, freshSettled] = await Promise.allSettled([
      supabase
        .from('roll_call_stats')
        .select('roll_call_id, dem_yea, dem_nay, rep_yea, rep_nay, ind_yea, ind_nay')
        .in('roll_call_id', ids),
      supabase.from('votes').select('voted_at').order('voted_at', { ascending: false }).limit(1),
    ])

    const statsMap = new Map()
    if (statsSettled.status === 'fulfilled' && Array.isArray(statsSettled.value.data)) {
      for (const s of statsSettled.value.data) statsMap.set(s.roll_call_id, s)
    }

    let recordedThrough = null
    if (freshSettled.status === 'fulfilled') {
      recordedThrough = freshSettled.value.data?.[0]?.voted_at ?? null
    }

    const votes = calls.map((c) => {
      const meta = parseRollCallId(c.id)
      const chamber = meta?.chamber || null
      const { yea, nay } = tallyFor(statsMap.get(c.id), chamber)
      return {
        id: c.id,
        chamber,
        number: meta?.number ?? null,
        question: c.question || null,
        // Nomination/procedural descriptions carry the real human substance.
        description: c.description || null,
        bill: parseBill(c.bill_id),
        yea,
        nay,
        result: deriveResult(c.question, yea, nay, chamber),
      }
    })

    return { votes, recordedThrough }
  } catch (err) {
    console.warn('[FloorVotes] query failed:', err)
    return null
  }
}
