// Compact Markdown views of the same records, for agents that ask with
// `Accept: text/markdown`. About a tenth of the tokens of the HTML page.

import { rollCallPath } from './rollCallResult.js'
import { billPath, billLabel } from './pages.js'
import { congressOrdinal as ord } from './billCard.js'
import { SITE_ORIGIN as SITE } from './site.js'

function cell(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
}

export function memberMarkdown(m) {
  const seat = m.chamber === 'senate' ? `Senator, ${m.state}` : `Representative, ${m.state}${m.district ? `-${m.district}` : ''}`
  const lines = [
    `# ${m.name}`,
    '',
    `- Seat: ${seat}`,
    `- Party: ${m.party}`,
    `- Bioguide ID: ${m.id}`,
    `- Canonical: ${SITE}/politician/${m.id}`,
    `- Sources: ${m.congress_gov_url} · ${m.source_url}`,
    `- Recorded votes: ${m.voteCount}`,
  ]
  if (m.stats) lines.push(`- ${ord(m.stats.congress)} Congress: ${m.stats.total_votes} votes, ${m.stats.yea_count} yea, ${m.stats.nay_count} nay, ${m.stats.not_voting_count} not voting, votes with party ${m.stats.party_loyalty_pct}%`)
  if (m.updatedAt) lines.push(`- Data updated: ${m.updatedAt}`)
  if (m.terms.length) {
    lines.push('', '## Terms', '')
    for (const t of m.terms) lines.push(`- ${ord(t.congress)} Congress, ${t.chamber}, ${t.state}${t.district ? `-${t.district}` : ''}, ${t.term_start || ''}${t.term_end ? ` to ${t.term_end}` : ' to present'}`)
  }
  lines.push('', `## Latest ${m.votes.length} votes`, '', '| Date | Roll call | Question | Bill | Vote | Source |', '|---|---|---|---|---|---|')
  for (const v of m.votes) {
    const vp = rollCallPath(v.roll_call_id)
    lines.push(`| ${cell(v.voted_at)} | ${vp ? `[${cell(v.roll_call_id)}](${SITE}${vp})` : cell(v.roll_call_id)} | ${cell(v.question)} | ${v.bill ? `[${cell(billLabel(v.bill.id))}](${SITE}${billPath(v.bill.id)})${v.bill.title ? ` ${cell(v.bill.title)}` : ''}` : ''} | ${cell(v.position)} | ${v.source_url ? `[record](${v.source_url})` : ''} |`)
  }
  lines.push('', `Full record and API: ${SITE}/llms.txt`)
  return lines.join('\n') + '\n'
}

export function rollCallMarkdown(rc) {
  const lines = [
    `# ${rc.chamber} roll call ${rc.roll}, ${ord(rc.congress)} Congress, session ${rc.session}`,
    '',
    `- Question: ${rc.question || ''}`,
  ]
  if (rc.description) lines.push(`- Description: ${rc.description}`)
  if (rc.bill) lines.push(`- Bill: [${billLabel(rc.bill.id)}](${SITE}${billPath(rc.bill.id)})${rc.bill.title ? ` ${rc.bill.title}` : ''}${rc.bill.source_url ? ` (${rc.bill.source_url})` : ''}`)
  if (rc.voted_at) lines.push(`- Date: ${rc.voted_at}`)
  if (rc.tally) lines.push(`- Tally: ${rc.tally.yea} yea, ${rc.tally.nay} nay${rc.tally.present ? `, ${rc.tally.present} present` : ''}${rc.tally.notVoting ? `, ${rc.tally.notVoting} not voting` : ''}`)
  if (rc.party) lines.push(`- By party: D ${rc.party.dem.yea}-${rc.party.dem.nay}, R ${rc.party.rep.yea}-${rc.party.rep.nay}, I ${rc.party.ind.yea}-${rc.party.ind.nay}`)
  if (rc.result) lines.push(`- Result (derived from tally and question): ${rc.result}`)
  lines.push(`- Canonical: ${SITE}${rollCallPath(rc.id)}`)
  if (rc.source_url) lines.push(`- Official record: ${rc.source_url}`)
  if (rc.updatedAt) lines.push(`- Data updated: ${rc.updatedAt}`)
  if (rc.votes.length) {
    lines.push('', `## Every member (${rc.votes.length})`, '', '| Member | Seat | Vote |', '|---|---|---|')
    for (const v of rc.votes) lines.push(`| [${cell(v.member.name)}](${SITE}/politician/${v.member.id}) | ${cell(v.member.party)} ${cell(v.member.state)}${v.member.district ? `-${cell(v.member.district)}` : ''} | ${cell(v.position)} |`)
  }
  lines.push('', `Full record and API: ${SITE}/llms.txt`)
  return lines.join('\n') + '\n'
}

export function billMarkdown(b) {
  const lines = [
    `# ${b.label}: ${b.title}`,
    '',
    `- Congress: ${ord(b.congress)}`,
    `- Bill ID: ${b.id}`,
  ]
  if (b.sponsor) lines.push(`- Sponsor: [${b.sponsor.name}](${SITE}/politician/${b.sponsor.id})${b.sponsor.party ? ` (${b.sponsor.party}-${b.sponsor.state || ''})` : ''}`)
  if (b.introduced_at) lines.push(`- Introduced: ${b.introduced_at}`)
  if (b.policy_area) lines.push(`- Policy area: ${b.policy_area}`)
  if (b.legislative_stage) lines.push(`- Stage: ${b.legislative_stage}`)
  lines.push(`- Canonical: ${SITE}${billPath(b.id)}`)
  if (b.source_url) lines.push(`- Source: ${b.source_url}`)
  if (b.updatedAt) lines.push(`- Data updated: ${b.updatedAt}`)
  if (b.summary) lines.push('', `## ${b.crs_summary ? 'Official CRS summary' : 'Summary'}`, '', b.summary.trim())
  lines.push('', '## Recorded votes', '')
  if (!b.rollCalls.length) lines.push('No recorded floor vote yet.')
  else {
    lines.push('| Date | Chamber | Question | Tally | Result | Page |', '|---|---|---|---|---|---|')
    for (const r of b.rollCalls) lines.push(`| ${cell(r.voted_at)} | ${cell(r.chamber)} | ${cell(r.question)} | ${r.tally ? `${r.tally.yea}-${r.tally.nay}` : ''} | ${cell(r.result)} | ${SITE}${rollCallPath(r.id)} |`)
  }
  lines.push('', `Full record and API: ${SITE}/llms.txt`)
  return lines.join('\n') + '\n'
}

export function renderMarkdown(data) {
  if (data.kind === 'member') return memberMarkdown(data)
  if (data.kind === 'vote') return rollCallMarkdown(data)
  return billMarkdown(data)
}
