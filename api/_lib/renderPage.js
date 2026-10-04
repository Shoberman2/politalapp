// HTML for the prerendered record pages. The output is a full document built
// by injecting into the real SPA shell (index.html), so humans get the same
// asset tags the app needs and bots get the record. React replaces #root on
// mount (createRoot().render(), not hydrate), so the markup mirrors the
// masthead from Navigation.jsx and the loaded-state class names of the React
// pages to keep the swap quiet. The roll-call page also embeds its data as
// JSON so the React page can render without refetching.

import { rollCallPath } from './rollCallResult.js'
import { billPath, billLabel } from './pages.js'
import { congressOrdinal } from './billCard.js'
import { SITE_ORIGIN as SITE } from './site.js'
import {
  RECORD_VOTE_LIMIT, recordPath, recordHeadline, recordSeatCode, recordSeatTitle, houseSeatTitle,
  recordSummary, recordDate, recordOgImagePath,
} from '../../shared/memberRecord.js'

export const ordinal = congressOrdinal

export function escapeHtml(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Only http(s) URLs may become href/src attributes, even after escaping.
export function safeUrl(u) {
  const s = String(u || '').trim()
  return /^https?:\/\//i.test(s) ? escapeHtml(s) : ''
}

// Raw (unescaped) URL for JSON-LD fields, or undefined when not http(s).
function httpUrl(u) {
  const s = String(u || '').trim()
  return /^https?:\/\//i.test(s) ? s : undefined
}

export function clampText(s, n) {
  if (!s) return ''
  const t = String(s).replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t
}

export function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin',
  WY: 'Wyoming', DC: 'District of Columbia', PR: 'Puerto Rico', GU: 'Guam', VI: 'U.S. Virgin Islands', AS: 'American Samoa',
  MP: 'Northern Mariana Islands',
}
export const stateName = (abbr) => STATE_NAMES[abbr] || abbr || ''

export function memberTitle(m) {
  if (m.chamber === 'senate') return 'Senator'
  return houseSeatTitle(m.state)
}

function partyShort(p) {
  const s = String(p || '')
  if (/^dem/i.test(s) || s === 'D') return 'D'
  if (/^rep/i.test(s) || s === 'R') return 'R'
  if (/^ind/i.test(s) || s === 'I') return 'I'
  return s.slice(0, 1).toUpperCase()
}

// Same mapping BillDetail.jsx applies to Congress.gov action text, keyed on
// the stage the ETL already classified.
export function stageStatus(stage) {
  switch (stage) {
    case 'enacted': return { label: 'Became Law', cls: 'status-enacted' }
    case 'passed_both': return { label: 'Passed Both Chambers · Awaiting Signature', cls: 'status-passed-both' }
    case 'passed_house': return { label: 'Passed House · Awaiting Senate', cls: 'status-passed' }
    case 'passed_senate': return { label: 'Passed Senate · Awaiting House', cls: 'status-passed' }
    case 'committee':
    case 'subcommittee': return { label: 'In Committee', cls: 'status-committee' }
    case 'introduced': return { label: 'Introduced', cls: 'status-introduced' }
    default: return stage ? { label: 'In Progress', cls: 'status-progress' } : null
  }
}

const COLOPHON_RC = 'Data from Congress.gov, the House Clerk, and the Senate. The result is derived from the tally and the question.'

// Mirrors Navigation.jsx so broadsheet.css styles the masthead before React mounts.
function chrome(inner) {
  return `<div class="app"><div class="bw bw-masthead"><div class="topbar-wrap"><div class="topbar"><a class="brand" href="/" aria-label="BallotWatch home"><span class="brand-mark"><img src="/capitol-logo.svg" alt="" /></span><span class="brand-name">BallotWatch</span></a><nav class="topnav"><a href="/all">Members</a><a href="/bills">Bills</a><a href="/map">Map</a><a href="/blog">Blog</a></nav><div class="topbar-right"><a class="btn btn-primary btn-sm" href="/my-representative"><span class="nav-cta-full">Find My Rep</span><span class="nav-cta-short">My Rep</span></a></div></div></div></div><main class="main-content">${inner}</main></div>`
}

function initials(name) {
  return String(name || '').split(' ').map((n) => n[0]).join('').slice(0, 2)
}

// ---------- member ----------

export function memberMeta(m) {
  const title = `${m.name} Voting Record (${partyShort(m.party)}-${m.state}${m.district ? `-${m.district}` : ''})`
  const seat = m.chamber === 'senate'
    ? `U.S. Senator from ${stateName(m.state)}`
    : `U.S. ${memberTitle(m)} for ${stateName(m.state)}${m.district ? ` district ${m.district}` : ''}`
  const stats = m.stats
  const desc = clampText(
    `${m.name}, ${seat}. ${stats ? `${stats.total_votes} recorded votes in the ${ordinal(stats.congress)} Congress: ${stats.yea_count} yea, ${stats.nay_count} nay, ${stats.not_voting_count} not voting.` : `${m.voteCount} recorded votes.`} Every vote linked to the official roll call.`,
    200,
  )
  return { title, description: desc, canonical: `${SITE}/politician/${m.id}` }
}

export function memberJsonLd(m) {
  const meta = memberMeta(m)
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: m.name,
      jobTitle: m.chamber === 'senate' ? 'United States Senator' : 'United States Representative',
      identifier: m.id,
      image: httpUrl(m.photo_url),
      url: meta.canonical,
      sameAs: [m.source_url, m.congress_gov_url].map(httpUrl).filter(Boolean),
      memberOf: { '@type': 'Organization', name: m.chamber === 'senate' ? 'United States Senate' : 'United States House of Representatives' },
      affiliation: { '@type': 'Organization', name: m.party },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'BallotWatch', item: SITE },
        { '@type': 'ListItem', position: 2, name: 'Members', item: `${SITE}/all` },
        { '@type': 'ListItem', position: 3, name: m.name, item: meta.canonical },
      ],
    },
  ]
}

export function renderMemberBody(m) {
  const meta = memberMeta(m)
  const stats = m.stats
  const rows = m.votes.map((v) => {
    const vp = rollCallPath(v.roll_call_id)
    const bp = v.bill ? billPath(v.bill.id) : null
    const billText = v.bill ? `${escapeHtml(billLabel(v.bill.id))}${v.bill.title ? ` · ${escapeHtml(clampText(v.bill.title, 90))}` : ''}` : ''
    const src = safeUrl(v.source_url)
    return `<tr><td class="rc-mono">${escapeHtml(v.voted_at || '')}</td><td>${vp ? `<a href="${vp}">${escapeHtml(v.question || v.roll_call_id)}</a>` : escapeHtml(v.question || '')}</td><td>${bp ? `<a href="${bp}">${billText}</a>` : billText}</td><td class="rc-position rc-position-${escapeHtml(String(v.position || '').toLowerCase().replace(/\s+/g, '-'))}">${escapeHtml(v.position)}</td><td>${src ? `<a href="${src}" rel="noopener">Source</a>` : ''}</td></tr>`
  }).join('')

  const terms = m.terms.slice(0, 12).map((t) =>
    `<li>${escapeHtml(ordinal(t.congress))} Congress · ${escapeHtml(t.chamber === 'senate' ? 'Senate' : 'House')} · ${escapeHtml(t.state)}${t.district ? `-${escapeHtml(t.district)}` : ''} · ${escapeHtml(fmtDate(t.term_start))}${t.term_end ? ` to ${escapeHtml(fmtDate(t.term_end))}` : ' to present'}</li>`,
  ).join('')

  const photo = safeUrl(m.photo_url)
  const photoHtml = photo
    ? `<img class="pol-photo" src="${photo}" alt="${escapeHtml(m.name)}" />`
    : `<div class="pol-photo-placeholder"><span>${escapeHtml(initials(m.name))}</span></div>`

  return chrome(`<article class="pol">
  <nav class="pol-crumb"><a href="/">BallotWatch</a><span class="pol-crumb-sep">/</span><a href="/all">Members</a><span class="pol-crumb-sep">/</span><span>${escapeHtml(m.name)}</span></nav>
  <header class="pol-masthead">
    <div class="pol-photo-wrap">${photoHtml}</div>
    <div class="pol-lede">
      <div class="pol-kicker">${escapeHtml(memberTitle(m))} · ${escapeHtml(m.party)} · ${escapeHtml(stateName(m.state))}${m.district ? ` district ${escapeHtml(m.district)}` : ''}</div>
      <h1 class="pol-name">${escapeHtml(m.name)}</h1>
      <p class="pol-standfirst">${escapeHtml(meta.description)}</p>
      ${stats ? `<dl class="pol-meta-grid"><dt>Recorded votes</dt><dd><span class="pol-meta-mono">${Number(stats.total_votes) || 0}</span></dd><dt>Yea</dt><dd><span class="pol-meta-mono">${Number(stats.yea_count) || 0}</span></dd><dt>Nay</dt><dd><span class="pol-meta-mono">${Number(stats.nay_count) || 0}</span></dd><dt>Not voting</dt><dd><span class="pol-meta-mono">${Number(stats.not_voting_count) || 0}</span></dd><dt>Votes with party</dt><dd><span class="pol-meta-mono">${Number(stats.party_loyalty_pct) || 0}%</span></dd></dl>` : ''}
      <div class="pol-actions"><a class="pol-action-btn" href="${escapeHtml(recordPath(m.id))}">Record in 60 seconds</a> <a class="pol-action-btn" href="${safeUrl(m.congress_gov_url)}" rel="noopener">Congress.gov ↗</a> <a class="pol-action-btn" href="${safeUrl(m.source_url)}" rel="noopener">Bioguide ↗</a></div>
    </div>
  </header>
  ${terms ? `<section class="pol-editorial"><div class="pol-section-label">Terms of service</div><h2 class="pol-section-title">Congress history</h2><ul class="pol-terms">${terms}</ul></section>` : ''}
  <section class="pol-editorial">
    <div class="pol-section-label">Voting record · ${Number(m.voteCount) || 0} recorded votes${m.votes.length < m.voteCount ? ` · latest ${m.votes.length} shown` : ''}</div>
    <h2 class="pol-section-title">How <em>they voted</em></h2>
    <div class="rc-table-wrap"><table class="rc-table"><thead><tr><th>Date</th><th>Question</th><th>Bill</th><th>Vote</th><th>Record</th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>
  <footer class="rc-colophon">Data from Congress.gov, the House Clerk, and the Senate. ${m.updatedAt ? `Updated ${escapeHtml(fmtDate(m.updatedAt))}.` : ''} <a href="/methodology">Methodology</a> · <a href="/llms.txt">For agents</a></footer>
</article>`)
}

// ---------- record in 60 seconds ----------
// One template for every member (shared/memberRecord.js). The class names
// match MemberRecord.jsx so React's mount replaces the markup in place.

export function recordMeta(r) {
  return {
    title: clampText(`${recordHeadline(r)} (${recordSeatCode(r)})`, 110),
    description: clampText(recordSummary(r, stateName), 200),
    canonical: `${SITE}${recordPath(r.id)}`,
    ogImage: `${SITE}${recordOgImagePath(r.id)}`,
  }
}

export function recordJsonLd(r) {
  const meta = recordMeta(r)
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      name: meta.title,
      url: meta.canonical,
      dateModified: r.updatedAt || undefined,
      mainEntity: {
        '@type': 'Person',
        name: r.name,
        identifier: r.id,
        jobTitle: r.chamber === 'senate' ? 'United States Senator' : 'United States Representative',
        url: `${SITE}/politician/${r.id}`,
        sameAs: [r.sources?.bioguide, r.sources?.congressGov].map(httpUrl).filter(Boolean),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'BallotWatch', item: SITE },
        { '@type': 'ListItem', position: 2, name: r.name, item: `${SITE}/politician/${r.id}` },
        { '@type': 'ListItem', position: 3, name: 'Record in 60 seconds', item: meta.canonical },
      ],
    },
  ]
}

function positionClass(p) {
  return `rc-position rc-position-${String(p || '').toLowerCase().replace(/\s+/g, '-')}`
}

export function renderRecordBody(r) {
  const s = r.stats
  const photo = `https://unitedstates.github.io/images/congress/450x550/${encodeURIComponent(r.id)}.jpg`
  const party = partyShort(r.party)
  const seat = `${escapeHtml(recordSeatTitle(r))} · ${escapeHtml(stateName(r.state))}${r.district ? ` district ${escapeHtml(r.district)}` : ''}`

  const facts = s
    ? `<dl class="rec-facts"><div><dt>Roll calls, ${escapeHtml(ordinal(s.congress))} Congress</dt><dd>${s.total}</dd></div><div><dt>Votes cast</dt><dd>${s.cast}</dd></div><div><dt>Not voting</dt><dd>${s.notVoting} <span class="rec-facts-sub">(${s.notVotingPct}%)</span></dd></div></dl>`
    : `<p class="rec-note">Vote totals for the current Congress are not available yet.</p>`

  const rows = r.recentVotes.map((v) => {
    const q = escapeHtml(v.question || 'Recorded vote')
    const bill = v.bill ? ` <a class="rec-bill" href="${escapeHtml(v.bill.path)}">${escapeHtml(v.bill.label)}</a>` : ''
    const title = v.bill?.title ? `<div class="rec-vote-title">${escapeHtml(clampText(v.bill.title, 110))}</div>` : ''
    const question = v.path ? `<a href="${escapeHtml(v.path)}">${q}</a>` : q
    return `<tr><td class="rc-mono">${escapeHtml(recordDate(v.voted_at))}</td><td>${question}${bill}${title}</td><td class="${escapeHtml(positionClass(v.position))}">${escapeHtml(v.position || '')}</td><td class="rec-result">${v.result ? `<span class="rc-result rc-result-${escapeHtml(v.resultKind || '')}">${escapeHtml(v.result)}</span>` : '<span class="rec-muted">Not derived</span>'}</td><td class="rec-src">${safeUrl(v.source_url) ? `<a href="${safeUrl(v.source_url)}" rel="noopener">${v.chamber === 'Senate' ? 'Senate' : 'Clerk'} ↗</a>` : ''}</td></tr>`
  }).join('')

  const votesBlock = r.voteCount === 0
    ? `<p class="rec-note">No recorded votes for ${escapeHtml(r.name)} in BallotWatch data yet. A member who took office recently may not have voted on a roll call yet.</p>`
    : `${r.thin ? `<p class="rec-note">${escapeHtml(r.name)} has ${r.voteCount} recorded vote${r.voteCount === 1 ? '' : 's'} so far. All are shown.</p>` : ''}<div class="rc-table-wrap"><table class="rc-table rec-table"><thead><tr><th>Date</th><th>Question</th><th>Vote</th><th>Result</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table></div>`

  return chrome(`<article class="rec">
  <nav class="rc-crumb"><a href="/">BallotWatch</a><span class="rc-crumb-sep">/</span><a href="/politician/${escapeHtml(r.id)}">${escapeHtml(r.name)}</a><span class="rc-crumb-sep">/</span><span>Record in 60 seconds</span></nav>
  <header class="rec-head">
    <img class="rec-photo" src="${photo}" alt="${escapeHtml(r.name)}" width="96" height="117" />
    <div class="rec-id">
      <div class="rec-kicker">Record in 60 seconds${r.congress ? ` · ${escapeHtml(ordinal(r.congress))} Congress` : ''}</div>
      <h1 class="rec-name">${escapeHtml(r.name)}</h1>
      <div class="rec-seat"><span class="rec-party rec-party-${escapeHtml(party.toLowerCase())}">${escapeHtml(party)}</span>${seat} · ${r.chamber === 'senate' ? 'Senate' : 'House'}</div>
      ${r.servingSince && r.congress ? `<div class="rec-since">Serving in the ${escapeHtml(ordinal(r.congress))} Congress since <span class="rc-mono">${escapeHtml(fmtDate(r.servingSince))}</span></div>` : ''}
    </div>
  </header>
  ${facts}
  <section class="rec-section">
    <div class="rc-section-label">${r.voteCount ? `${r.recentVotes.length} most recent recorded vote${r.recentVotes.length === 1 ? '' : 's'}` : 'Recorded votes'}</div>
    ${votesBlock}
  </section>
  <div class="rec-actions"><a class="rc-action-btn" href="/politician/${escapeHtml(r.id)}">Full record →</a><button type="button" class="rc-action-btn" disabled>Copy link</button></div>
  <footer class="rec-colophon">
    <p>Every member's card uses this same template and the same facts. The votes listed are the ${RECORD_VOTE_LIMIT} most recent on record, not a selection. Results are derived from the official tally and the question.</p>
    <p>${r.updatedAt ? `Data recorded through ${escapeHtml(fmtDate(r.updatedAt))}. ` : ''}Sources: <a href="${safeUrl(r.sources.congressGov)}" rel="noopener">Congress.gov</a> · <a href="${safeUrl(r.sources.bioguide)}" rel="noopener">Bioguide</a> · <a href="${safeUrl(r.sources.chamberVotes)}" rel="noopener">${r.chamber === 'senate' ? 'Senate.gov roll call votes' : 'House Clerk roll call votes'}</a> · <a href="/methodology">Methodology</a></p>
  </footer>
</article>`)
}

// ---------- roll call ----------

export function rollCallMeta(rc) {
  const subject = rc.bill ? `${billLabel(rc.bill.id)}${rc.bill.title ? `: ${clampText(rc.bill.title, 80)}` : ''}` : (rc.description ? clampText(rc.description, 90) : '')
  const title = `${rc.chamber} Roll Call ${rc.roll} (${ordinal(rc.congress)} Congress)${rc.question ? `: ${rc.question}` : ''}${subject ? ` on ${subject}` : ''}`
  const t = rc.tally
  const desc = clampText(
    `${rc.chamber} vote ${rc.roll}, session ${rc.session} of the ${ordinal(rc.congress)} Congress${rc.voted_at ? `, ${fmtDate(rc.voted_at)}` : ''}. ${rc.question || 'Recorded vote'}${subject ? ` on ${subject}` : ''}. ${t ? `${t.yea} yea, ${t.nay} nay${rc.result ? `, ${rc.result.toLowerCase()}` : ''}.` : ''} How every member voted, linked to the official record.`,
    200,
  )
  return { title: clampText(title, 110), description: desc, canonical: `${SITE}${rollCallPath(rc.id)}` }
}

export function rollCallJsonLd(rc) {
  const meta = rollCallMeta(rc)
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: meta.title,
      description: meta.description,
      startDate: rc.voted_at || undefined,
      location: { '@type': 'Place', name: rc.chamber === 'Senate' ? 'United States Senate' : 'United States House of Representatives' },
      organizer: { '@type': 'GovernmentOrganization', name: 'United States Congress' },
      url: meta.canonical,
      sameAs: httpUrl(rc.source_url),
      about: rc.bill ? { '@type': 'Legislation', name: rc.bill.title || billLabel(rc.bill.id), legislationIdentifier: billLabel(rc.bill.id), url: httpUrl(rc.bill.source_url) } : undefined,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'BallotWatch', item: SITE },
        { '@type': 'ListItem', position: 2, name: 'Bills', item: `${SITE}/bills` },
        { '@type': 'ListItem', position: 3, name: `${rc.chamber} roll call ${rc.roll}`, item: meta.canonical },
      ],
    },
  ]
}

export function renderRollCallBody(rc) {
  const t = rc.tally
  const total = t ? t.yea + t.nay : 0
  const yeaPct = total ? (t.yea / total) * 100 : 0
  const bp = rc.bill ? billPath(rc.bill.id) : null
  const rows = rc.votes.map((v) => `<tr><td><a href="/politician/${escapeHtml(v.member.id)}">${escapeHtml(v.member.name)}</a></td><td class="rc-mono">${escapeHtml(partyShort(v.member.party))}-${escapeHtml(v.member.state || '')}${v.member.district ? `-${escapeHtml(v.member.district)}` : ''}</td><td class="rc-position rc-position-${escapeHtml(String(v.position).toLowerCase().replace(/\s+/g, '-'))}">${escapeHtml(v.position)}</td></tr>`).join('')
  const src = safeUrl(rc.source_url)
  const billSrc = safeUrl(rc.bill?.source_url)

  // Same control row RollCallPage.jsx renders, so mounting replaces it in
  // place instead of pushing the table down.
  const filter = `<div class="rc-filter"><input type="search" placeholder="Filter by name or state" aria-label="Filter members by name or state" disabled /><div class="rc-filter-positions" role="group" aria-label="Filter by vote"><button type="button" class="is-active" disabled>All</button><button type="button" disabled>Yea</button><button type="button" disabled>Nay</button><button type="button" disabled>Present</button><button type="button" disabled>Not Voting</button></div></div>`

  return chrome(`<article class="rc">
  <nav class="rc-crumb"><a href="/">BallotWatch</a><span class="rc-crumb-sep">/</span><a href="/bills">Bills</a><span class="rc-crumb-sep">/</span><span>${escapeHtml(rc.chamber)} roll call ${rc.roll}</span></nav>
  <header class="rc-masthead">
    <div class="rc-kicker">${escapeHtml(rc.chamber)} · Roll call ${rc.roll} · Session ${rc.session} · ${escapeHtml(ordinal(rc.congress))} Congress${rc.voted_at ? ` · ${escapeHtml(fmtDate(rc.voted_at))}` : ''}</div>
    <h1 class="rc-title">${escapeHtml(rc.question || 'Recorded vote')}${rc.bill && bp ? ` on <a href="${bp}">${escapeHtml(billLabel(rc.bill.id))}</a>` : ''}</h1>
    ${rc.bill?.title ? `<p class="rc-standfirst">${escapeHtml(rc.bill.title)}</p>` : (rc.description ? `<p class="rc-standfirst">${escapeHtml(rc.description)}</p>` : '')}
    ${t ? `<div class="rc-tally"><div class="rc-tally-head"><span class="rc-tally-numbers"><span class="rc-yea">${t.yea} Yea</span> · <span class="rc-nay">${t.nay} Nay</span>${t.present ? ` · ${t.present} Present` : ''}${t.notVoting ? ` · ${t.notVoting} Not voting` : ''}</span>${rc.result ? `<span class="rc-result rc-result-${escapeHtml(rc.resultKind || '')}">${escapeHtml(rc.result)}</span>` : ''}</div><div class="rc-tally-bar" aria-hidden="true"><span class="rc-tally-yea" style="width:${yeaPct.toFixed(1)}%"></span><span class="rc-tally-nay" style="width:${(100 - yeaPct).toFixed(1)}%"></span></div>${rc.party ? `<div class="rc-party">D ${rc.party.dem.yea}–${rc.party.dem.nay} · R ${rc.party.rep.yea}–${rc.party.rep.nay}${rc.party.ind.yea + rc.party.ind.nay ? ` · I ${rc.party.ind.yea}–${rc.party.ind.nay}` : ''}</div>` : ''}</div>` : '<p class="rc-standfirst rc-muted">Tally not yet recorded.</p>'}
    <div class="rc-actions">${src ? `<a class="rc-action-btn" href="${src}" target="_blank" rel="noopener noreferrer">Official record ↗</a>` : ''}${billSrc ? `<a class="rc-action-btn" href="${billSrc}" target="_blank" rel="noopener noreferrer">Bill on Congress.gov ↗</a>` : ''}</div>
  </header>
  <section class="rc-section">
    <div class="rc-section-label">Every member · ${rc.votes.length} recorded</div>
    <h2 class="rc-section-title">How <em>each member</em> voted</h2>
    ${rows ? `${filter}<div class="rc-table-wrap"><table class="rc-table"><thead><tr><th>Member</th><th>Seat</th><th>Vote</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="rc-muted">Member-level votes for this roll call have not been ingested yet.</p>'}
  </section>
  <footer class="rc-colophon">${COLOPHON_RC} <a href="/methodology">Methodology</a> · <a href="/llms.txt">For agents</a></footer>
</article>`)
}

// ---------- bill ----------

export function billMeta(b) {
  const title = `${b.label}: ${clampText(b.title, 90)} (${ordinal(b.congress)} Congress)`
  const latest = b.rollCalls[0]
  const desc = clampText(
    b.oneLiner || b.summary || `${b.label}, ${String(b.title || '').replace(/\.$/, '')}.${latest?.tally ? ` Latest vote: ${latest.chamber} ${latest.tally.yea} yea, ${latest.tally.nay} nay${latest.result ? `, ${latest.result.toLowerCase()}` : ''}.` : ''} Source-linked record on BallotWatch.`,
    200,
  )
  return { title: clampText(title, 110), description: desc, canonical: `${SITE}${billPath(b.id)}` }
}

export function billJsonLd(b) {
  const meta = billMeta(b)
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Legislation',
      name: b.title,
      legislationIdentifier: b.label,
      legislationType: b.billType.toUpperCase(),
      legislationDate: b.introduced_at || undefined,
      legislationLegalForce: b.legislative_stage === 'enacted' ? 'InForce' : undefined,
      url: meta.canonical,
      sameAs: httpUrl(b.source_url),
      abstract: b.summary ? clampText(b.summary, 500) : undefined,
      author: b.sponsor ? { '@type': 'Person', name: b.sponsor.name, url: `${SITE}/politician/${b.sponsor.id}` } : undefined,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'BallotWatch', item: SITE },
        { '@type': 'ListItem', position: 2, name: 'Bills', item: `${SITE}/bills` },
        { '@type': 'ListItem', position: 3, name: b.label, item: meta.canonical },
      ],
    },
  ]
}

export function renderBillBody(b) {
  const votes = b.rollCalls.map((r) => {
    const p = rollCallPath(r.id)
    return `<li class="bill-tally-card"><div class="bill-tally-chamber">${escapeHtml(r.chamber || '')}${r.voted_at ? ` · <span class="bill-tally-date">${escapeHtml(fmtDate(r.voted_at))}</span>` : ''}</div><div>${p ? `<a href="${p}">${escapeHtml(r.question || 'Recorded vote')}</a>` : escapeHtml(r.question || 'Recorded vote')}</div>${r.tally ? `<div class="rc-mono">${r.tally.yea} yea · ${r.tally.nay} nay${r.result ? ` · <span class="bill-tally-result ${escapeHtml(r.resultKind || '')}">${escapeHtml(r.result)}</span>` : ''}</div>` : ''}</li>`
  }).join('')
  const status = stageStatus(b.legislative_stage)
  const src = safeUrl(b.source_url)

  return chrome(`<article class="bill-detail">
  <nav class="bill-crumb"><a href="/">BallotWatch</a><span class="bill-crumb-sep">/</span><a href="/bills">Bills</a><span class="bill-crumb-sep">/</span><span>${escapeHtml(b.label)}</span></nav>
  <header class="bill-masthead">
    <div class="bill-id-row"><span class="bill-masthead-id">${escapeHtml(b.label)}</span><span class="bill-masthead-congress">${escapeHtml(ordinal(b.congress))} Congress</span>${status ? `<span class="bill-status-pill ${escapeHtml(status.cls)}"><span class="bill-status-pill-dot"></span>${escapeHtml(status.label)}</span>` : ''}</div>
    <h1 class="bill-masthead-title">${escapeHtml(b.title)}</h1>
    <p class="bill-masthead-byline">${b.sponsor ? `Sponsored by <a class="bill-byline-sponsor" href="/politician/${escapeHtml(b.sponsor.id)}">${escapeHtml(b.sponsor.name)}</a>${b.sponsor.party ? ` (${escapeHtml(b.sponsor.party)}-${escapeHtml(b.sponsor.state || '')})` : ''}${b.introduced_at ? ', ' : ''}` : ''}${b.introduced_at ? `introduced <span class="bill-byline-mono">${escapeHtml(fmtDate(b.introduced_at))}</span>` : ''}${b.policy_area ? ` · ${escapeHtml(b.policy_area)}` : ''}</p>
    <div class="bill-masthead-actions">${src ? `<a class="bill-action-btn" href="${src}" target="_blank" rel="noopener noreferrer">Congress.gov ↗</a>` : ''}</div>
  </header>
  <div class="bill-layout"><div class="bill-main">
    ${b.summary ? `<section class="bill-editorial-section"><div class="bill-section-label">${b.crs_summary ? 'Official CRS summary' : 'Summary'}</div><div class="bill-summary-body">${escapeHtml(b.summary).split(/\n{2,}/).map((p) => `<p>${p}</p>`).join('')}</div></section>` : ''}
    <section class="bill-editorial-section"><div class="bill-section-label">Floor votes</div><h2 class="bill-section-title">How the chambers <em>voted</em></h2>${votes ? `<ul class="bill-tally-grid">${votes}</ul>` : '<p>No recorded floor vote yet.</p>'}</section>
  </div></div>
  <footer class="rc-colophon">Data from Congress.gov. Summaries are the official CRS text. ${b.updatedAt ? `Updated ${escapeHtml(fmtDate(b.updatedAt))}.` : ''} <a href="/methodology">Methodology</a> · <a href="/llms.txt">For agents</a></footer>
</article>`)
}

// ---------- shell injection ----------

// Every replacement uses a function replacer so `$&`, `$'` and friends in the
// record text are inserted literally instead of being read as patterns.
function put(html, pattern, value) {
  return html.replace(pattern, () => value)
}

function jsonScript(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

export function injectIntoShell(shell, { title, description, canonical, robots, ogType = 'article', ogImage = null, jsonLd = [], body, pageData = null }) {
  let html = String(shell)
  const t = escapeHtml(title)
  const d = escapeHtml(description)
  const c = escapeHtml(canonical)
  html = put(html, /<title>[\s\S]*?<\/title>/i, `<title>${t}</title>`)
  html = put(html, /<meta name="description" content="[^"]*"\s*\/?>/i, `<meta name="description" content="${d}" />`)
  html = put(html, /<link rel="canonical" href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${c}" />`)
  html = put(html, /<meta property="og:type" content="[^"]*"\s*\/?>/i, `<meta property="og:type" content="${escapeHtml(ogType)}" />`)
  html = put(html, /<meta property="og:url" content="[^"]*"\s*\/?>/i, `<meta property="og:url" content="${c}" />`)
  html = put(html, /<meta property="og:title" content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${t}" />`)
  html = put(html, /<meta property="og:description" content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${d}" />`)
  html = put(html, /<meta name="twitter:title" content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${t}" />`)
  html = put(html, /<meta name="twitter:description" content="[^"]*"\s*\/?>/i, `<meta name="twitter:description" content="${d}" />`)
  if (ogImage) {
    const img = escapeHtml(ogImage)
    // A generated image: state its size so Facebook and LinkedIn can lay out
    // the preview on the first share instead of waiting to fetch the image.
    html = put(html, /<meta property="og:image" content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${img}" />\n    <meta property="og:image:width" content="1200" />\n    <meta property="og:image:height" content="630" />\n    <meta property="og:image:alt" content="${t}" />`)
    html = put(html, /<meta name="twitter:image" content="[^"]*"\s*\/?>/i, `<meta name="twitter:image" content="${img}" />`)
  }
  html = put(html, /<meta name="robots" content="[^"]*"\s*\/?>/i, `<meta name="robots" content="${escapeHtml(robots || 'index, follow')}" />`)
  // Replace the generic WebApplication block with page-specific JSON-LD.
  html = put(html, /<script type="application\/ld\+json">[\s\S]*?<\/script>/i, '')
  const ld = jsonLd.map((obj) => `<script type="application/ld+json">${jsonScript(obj)}</script>`).join('\n')
  const data = pageData ? `<script type="application/json" id="__bw_page">${jsonScript(pageData)}</script>\n` : ''
  html = put(html, /<\/head>/i, `${ld}\n${data}</head>`)
  html = put(html, /<div id="root"><\/div>/i, `<div id="root">${body}</div>`)
  return html
}

export function renderPage(shell, data) {
  let meta, jsonLd, body
  if (data.kind === 'member') { meta = memberMeta(data); jsonLd = memberJsonLd(data); body = renderMemberBody(data) }
  else if (data.kind === 'record') { meta = recordMeta(data); jsonLd = recordJsonLd(data); body = renderRecordBody(data) }
  else if (data.kind === 'vote') { meta = rollCallMeta(data); jsonLd = rollCallJsonLd(data); body = renderRollCallBody(data) }
  else { meta = billMeta(data); jsonLd = billJsonLd(data); body = renderBillBody(data) }
  return injectIntoShell(shell, {
    ...meta,
    ogType: data.kind === 'member' || data.kind === 'record' ? 'profile' : 'article',
    robots: data.indexable ? 'index, follow' : 'noindex, follow',
    jsonLd,
    body,
    // The React roll-call and record pages read this and skip their own fetch.
    pageData: data.kind === 'vote' || data.kind === 'record' ? data : null,
  })
}
