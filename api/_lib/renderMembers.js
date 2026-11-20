// Server-rendered public members index (/members). One link per member in the
// same set as sitemap-members.xml, each to the slugged canonical page, grouped
// by chamber. The markup mirrors src/components/MembersIndex.jsx so React's
// mount replaces it in place, and the list is embedded as page data so the
// React page needs no fetch.

import { chrome, escapeHtml, injectIntoShell, stateName } from './renderPage.js'
import { SITE_ORIGIN as SITE } from './site.js'
import { memberPath } from '../../shared/memberSlug.js'
import { partyLetter, ordinalCongress } from '../../shared/memberRecord.js'
import { MEMBERS_CONGRESS, MEMBER_GROUPS, memberSeat } from '../../shared/membersIndex.js'

export const MEMBERS_TITLE = `Members of Congress, ${ordinalCongress(MEMBERS_CONGRESS)} Congress | BallotWatch`
export const MEMBERS_DESCRIPTION = `Every member of the ${ordinalCongress(MEMBERS_CONGRESS)} U.S. Congress with a recorded vote: senators, representatives and delegates, each linked to a source-cited voting record.`
export const MEMBERS_H1 = 'Members Of Congress'

function itemHtml(m) {
  return `<li><a href="${escapeHtml(memberPath(m.id, m.name))}">${escapeHtml(m.name)}</a> <span class="mi-meta">${escapeHtml(partyLetter(m.party))} · ${escapeHtml(stateName(m.state))} · ${escapeHtml(memberSeat(m))}</span></li>`
}

export function renderMembersBody(data) {
  const groups = data.groups
  const sections = MEMBER_GROUPS.filter(([key]) => groups[key]?.length).map(([key, label]) =>
    `<section><div class="ip-inner"><h2>${escapeHtml(label)}</h2><p class="mi-count">${groups[key].length} members</p><ul class="mi-list">${groups[key].map(itemHtml).join('')}</ul></div></section>`,
  ).join('\n')
  return chrome(`<div class="bw info-page ip-wide members-index">
  <section class="ip-hero"><div class="ip-inner">
    <h1 class="ip-title">${escapeHtml(MEMBERS_H1)}</h1>
    <p class="ip-lede">${data.total} members with a recorded vote in the ${escapeHtml(ordinalCongress(MEMBERS_CONGRESS))} Congress. Each page lists the member's votes, linked to the official roll call.</p>
  </div></section>
${sections}
</div>`)
}

export function membersJsonLd(data) {
  const url = `${SITE}/members`
  const ordered = MEMBER_GROUPS.flatMap(([key]) => data.groups[key] || [])
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: MEMBERS_TITLE,
      description: MEMBERS_DESCRIPTION,
      url,
      isPartOf: { '@id': `${SITE}/#website` },
      dateModified: data.updatedAt || undefined,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: ordered.length,
        itemListElement: ordered.map((m, i) => ({ '@type': 'ListItem', position: i + 1, name: m.name, url: `${SITE}${memberPath(m.id, m.name)}` })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'BallotWatch', item: SITE },
        { '@type': 'ListItem', position: 2, name: 'Members', item: url },
      ],
    },
  ]
}

// The compact list the React page reads from #__bw_page.
export function membersPageData(data) {
  return { kind: 'members', total: data.total, updatedAt: data.updatedAt || null, members: data.members }
}

export function renderMembersPage(shell, data) {
  return injectIntoShell(shell, {
    title: MEMBERS_TITLE,
    description: MEMBERS_DESCRIPTION,
    canonical: `${SITE}/members`,
    ogType: 'website',
    robots: 'index, follow',
    jsonLd: membersJsonLd(data),
    body: renderMembersBody(data),
    pageData: membersPageData(data),
  })
}

export function membersMarkdown(data) {
  const lines = [`# ${MEMBERS_H1}`, '', `${data.total} members with a recorded vote in the ${ordinalCongress(MEMBERS_CONGRESS)} Congress.`, '', `- Canonical: ${SITE}/members`]
  for (const [key, label] of MEMBER_GROUPS) {
    const list = data.groups[key] || []
    if (!list.length) continue
    lines.push('', `## ${label}`, '')
    for (const m of list) lines.push(`- [${m.name}](${SITE}${memberPath(m.id, m.name)}) (${partyLetter(m.party)}-${m.state}${m.district ? `-${m.district}` : ''}, ${memberSeat(m)})`)
  }
  lines.push('', `Record URL patterns, API and MCP: ${SITE}/llms.txt`)
  return lines.join('\n') + '\n'
}

// Body for an unknown member id (and other missing members): 404 with a title
// and robots meta that do not look like the homepage.
export function notFoundHtml(shell, { title = 'Member not found | BallotWatch', heading = 'Member Not Found', note = 'We do not hold a member with that id.' } = {}) {
  return injectIntoShell(shell, {
    title,
    description: note,
    canonical: null,
    ogType: 'website',
    robots: 'noindex',
    jsonLd: [],
    body: chrome(`<div class="bw info-page"><section class="ip-hero"><div class="ip-inner"><h1 class="ip-title">${escapeHtml(heading)}</h1><p class="ip-lede">${escapeHtml(note)} <a href="/members">Browse all members of Congress</a>.</p></div></section></div>`),
  })
}
