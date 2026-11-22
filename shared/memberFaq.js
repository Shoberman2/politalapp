// The member tally sentence and the three-question FAQ, shared by the
// prerendered page (api/_lib/renderPage.js, which also emits the FAQPage
// JSON-LD) and the React page (PoliticianDetail.jsx). One function builds the
// text for both, so the visible Q&A matches the schema after React mounts.
//
// Input: { name, party, state, district, stats } where stats is the newest
// member_stats row. Built only from those facts: without a complete row there
// is no sentence and no FAQ, never invented numbers. Neither text mentions the
// vote list or its links, because the two pages list votes differently.
import { BRAND } from '../src/config/brand.js'

const count = (v) => (v == null || v === '' ? NaN : Number(v))

function partyLetter(p) {
  const s = String(p || '')
  if (/^dem/i.test(s) || s === 'D') return 'D'
  if (/^rep/i.test(s) || s === 'R') return 'R'
  if (/^ind/i.test(s) || s === 'I') return 'I'
  return s.slice(0, 1).toUpperCase()
}

function ordinal(n) {
  const num = parseInt(n, 10)
  if (Number.isNaN(num)) return String(n)
  const v = num % 100
  const s = ['th', 'st', 'nd', 'rd']
  return `${num}${s[(v - 20) % 10] || s[v] || s[0]}`
}

export function memberTally(m) {
  const s = m?.stats
  if (!s || !m?.name) return null
  const total = count(s.total_votes)
  const yea = count(s.yea_count)
  const nay = count(s.nay_count)
  const notVoting = count(s.not_voting_count)
  const present = count(s.present_count ?? 0)
  if (![total, yea, nay, notVoting, present].every(Number.isFinite) || total <= 0 || !s.congress) return null
  return { congress: s.congress, total, yea, nay, present, notVoting }
}

function tallyCounts(t) {
  return `${t.yea} yea, ${t.nay} nay, ${t.present} present, ${t.notVoting} not voting`
}

function votesPhrase(t) {
  return `${t.total} recorded roll-call vote${t.total === 1 ? '' : 's'} in the ${ordinal(t.congress)} Congress`
}

function seatCode(m) {
  const party = partyLetter(m.party)
  const seat = [m.state, m.district ? String(m.district) : ''].filter(Boolean).join('-')
  return [party, seat].filter(Boolean).join('-')
}

export function memberTallySentence(m) {
  const t = memberTally(m)
  if (!t) return ''
  const code = seatCode(m)
  return `${m.name}${code ? ` (${code})` : ''} has ${votesPhrase(t)}: ${tallyCounts(t)}.`
}

export function memberFaq(m) {
  const t = memberTally(m)
  if (!t) return []
  const cong = `${ordinal(t.congress)} Congress`
  return [
    {
      q: `How did ${m.name} vote in the ${cong}?`,
      a: `${m.name} has ${votesPhrase(t)}: ${tallyCounts(t)}.`,
    },
    {
      q: `How many votes has ${m.name} missed?`,
      a: `${m.name} has ${t.notVoting} not-voting entr${t.notVoting === 1 ? 'y' : 'ies'} among ${t.total} recorded roll-call votes in the ${cong}. Not voting means no vote was recorded for the member on that roll call. The record does not give a reason.`,
    },
    {
      q: `Where does ${BRAND.name} get ${m.name}'s votes?`,
      a: 'From the official roll calls published by the House Clerk and the Senate, with member details from Congress.gov.',
    },
  ]
}

export function memberFaqJsonLd(m) {
  const faq = memberFaq(m)
  if (!faq.length) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  }
}
