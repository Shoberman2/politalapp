import { supabase } from '../lib/supabase'
import { shapeMembers, groupMembers } from '../../shared/membersIndex.js'

const PAGE = 1000

async function all(table, columns, modify, orderBy) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).order(orderBy).range(from, from + PAGE - 1)
    if (modify) q = modify(q)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return out
}

/**
 * Every member with a recorded vote, shaped by the same function the server
 * uses (shared/membersIndex.js). Used when the page was reached by client-side
 * navigation, so there is no prerendered copy to read.
 */
export async function getMembersIndex() {
  const [politicians, stats, openTerms] = await Promise.all([
    all('politicians', 'id, name, chamber, state, district, party', null, 'id'),
    all('member_stats', 'politician_id, total_votes', (q) => q.gt('total_votes', 0), 'politician_id'),
    all('member_congress_terms', 'bioguide_id, congress, district', (q) => q.is('term_end', null), 'bioguide_id'),
  ])
  const members = shapeMembers({ politicians, votedIds: new Set(stats.map((r) => r.politician_id)), openTerms })
  return { members, total: members.length }
}

// The prerendered page embeds its list as #__bw_page.
export function membersFromPrerender(pageData) {
  if (!pageData || pageData.kind !== 'members' || !Array.isArray(pageData.members)) return null
  return { members: pageData.members, total: pageData.total ?? pageData.members.length }
}

export { groupMembers }
