import { supabase } from '../lib/supabase'
import { deriveResult, parseRollCallId, parseBill, sane } from './floorVotes'
import { voteSourceUrl } from '../../api/_lib/rollCallResult.js'

// Matches api/_lib/site.js MAX_ROLL_CALL_ROWS: 435 + 100 plus slack.
const MAX_ROLL_CALL_ROWS = 600

export function billFromId(billId) {
  const p = parseBill(billId)
  return p ? { id: billId, label: p.display, href: p.href } : null
}

function countPositions(members) {
  const counted = { yea: 0, nay: 0, present: 0, notVoting: 0 }
  for (const r of members) {
    if (r.position === 'Yea') counted.yea += 1
    else if (r.position === 'Nay') counted.nay += 1
    else if (r.position === 'Present') counted.present += 1
    else counted.notVoting += 1
  }
  return counted
}

/**
 * Adapt the server-rendered page data (api/_lib/pages.js getRollCallPage,
 * embedded by api/prerender.js as #__bw_page) to the shape this page uses,
 * so the first render needs no fetch.
 */
export function fromPrerender(data) {
  if (!data || data.kind !== 'vote' || !data.id) return null
  const meta = parseRollCallId(data.id)
  if (!meta) return null
  return {
    id: data.id,
    ...meta,
    question: data.question || null,
    description: data.description || null,
    votedAt: data.voted_at || null,
    bill: data.bill ? { ...billFromId(data.bill.id), title: data.bill.title || null, source_url: data.bill.source_url || null } : null,
    tally: data.tally || null,
    party: data.party || null,
    result: data.result || null,
    sourceUrl: data.source_url || null,
    votes: (data.votes || []).map((v) => ({ position: v.position, member: v.member })),
  }
}

/**
 * One roll call for the /vote page: the roll call row, the bill, the tally
 * (stats table first, member votes as fallback), the party split, the derived
 * result, and every member's vote sorted by name. Returns null when the roll
 * call does not exist.
 */
export async function getRollCall({ congress, chamber, session, roll }) {
  const key = String(chamber || '').toLowerCase()
  if (!['house', 'senate'].includes(key)) return null
  const id = `${key}-${Number(congress)}-${Number(session)}-${Number(roll)}`
  const meta = parseRollCallId(id)
  if (!meta) return null

  const [{ data: rc }, { data: stats }, { data: rows }] = await Promise.all([
    supabase.from('roll_calls').select('id, bill_id, question, description, voted_at').eq('id', id).maybeSingle(),
    supabase.from('roll_call_stats').select('dem_yea, dem_nay, rep_yea, rep_nay, ind_yea, ind_nay').eq('roll_call_id', id).maybeSingle(),
    supabase.from('votes').select('position, source_url, voted_at, politicians:politician_id ( id, name, party, state, district )').eq('roll_call_id', id).limit(MAX_ROLL_CALL_ROWS),
  ])
  if (!rc) return null

  let bill = null
  if (rc.bill_id) {
    const { data } = await supabase.from('bills').select('id, title, source_url').eq('id', rc.bill_id).maybeSingle()
    bill = { ...billFromId(rc.bill_id), title: data?.title || null, source_url: data?.source_url || null }
  }

  const members = (rows || []).filter((r) => r.politicians)
  const counted = countPositions(members)
  const statYea = stats ? (stats.dem_yea || 0) + (stats.rep_yea || 0) + (stats.ind_yea || 0) : null
  const statNay = stats ? (stats.dem_nay || 0) + (stats.rep_nay || 0) + (stats.ind_nay || 0) : null
  const hasStats = statYea != null && statYea + statNay > 0
  const tally = hasStats
    ? { yea: statYea, nay: statNay, present: counted.present, notVoting: counted.notVoting }
    : (members.length ? counted : null)
  const trusted = tally ? sane(tally.yea, tally.nay, meta.chamber) : false
  const result = trusted ? deriveResult(rc.question, tally.yea, tally.nay, meta.chamber, rc.description) : null

  return {
    id,
    ...meta,
    question: rc.question || null,
    description: rc.description || null,
    votedAt: rc.voted_at || members[0]?.voted_at || null,
    bill,
    tally: trusted ? tally : null,
    party: stats ? {
      dem: { yea: stats.dem_yea || 0, nay: stats.dem_nay || 0 },
      rep: { yea: stats.rep_yea || 0, nay: stats.rep_nay || 0 },
      ind: { yea: stats.ind_yea || 0, nay: stats.ind_nay || 0 },
    } : null,
    result,
    sourceUrl: voteSourceUrl(id, members[0]?.source_url),
    votes: members
      .map((r) => ({ position: r.position, member: r.politicians }))
      .sort((a, b) => a.member.name.localeCompare(b.member.name)),
  }
}
