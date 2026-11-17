// Full text, Markdown and structured data for the info pages. Three are built
// here from their data modules (/government, /glossary, /data-sources); the
// rest come from staticText.generated.js, rendered from their components. Crawlers and AI
// agents that do not run JavaScript get the same words React renders from the
// same data modules, instead of a headline and one paragraph.
//
// Each builder returns { html, markdown, jsonLd }:
//   html      sections placed under the page's H1 and lede
//   markdown  lines for the `Accept: text/markdown` view
//   jsonLd    extra schema.org blocks beside the page's WebPage block
// Only what the visible page says goes in here. Nothing is added for search.

import { escapeHtml } from './renderPage.js'
import { SITE_ORIGIN as SITE } from './site.js'
import { STATIC_TEXT } from './staticText.generated.js'
import { GLOSSARY, GLOSSARY_GROUPS } from '../../shared/glossary.js'
import { CIVICS_PRIMER } from '../../src/data/civicsPrimer.js'
import { DATA_SOURCES, titleCase } from '../../src/data/infoPages.js'
import {
  DEPARTMENTS, INDEPENDENT_AGENCIES, CONGRESS_CHECKS, GOV_LADDER, GOV_AS_OF, GOV_SOURCES,
} from '../../src/data/government.js'
import { DEPARTMENT_DETAIL, WORKFORCE_FACTS } from '../../src/data/governmentDeep.js'

const e = escapeHtml
const section = (inner) => `<section><div class="ip-inner">${inner}</div></section>`
const extLink = (url, label) => `<a href="${e(url)}" rel="noopener noreferrer">${e(label)}</a>`

const longDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
})

// "Marco Rubio, Secretary of State". Mirrors leaderLine() in GovernmentPage.jsx.
export function leaderLine(d) {
  if (!d.headName) return `${d.headTitle}: vacant`
  return `${d.headName}, ${d.acting ? 'Acting ' : ''}${d.headTitle}`
}

// Mirrors componentLeader() in GovernmentPage.jsx.
export function componentLeader(c) {
  if (!c.headTitle) return null
  if (!c.headName) return `${c.headTitle}: we could not confirm who holds this job`
  return `Run by ${c.headName}, ${c.acting ? 'Acting ' : ''}${c.headTitle}`
}

function departmentDetailHtml(d) {
  const detail = DEPARTMENT_DETAIL[d.id]
  if (!detail) return ''
  const comps = detail.components.map((c) => `<li><h4>${e(c.name)}</h4><p>${e(c.does)}</p>${componentLeader(c) ? `<p>${e(componentLeader(c))}${c.headSource ? ` · ${extLink(c.headSource, 'Source')}` : ''}</p>` : ''}${c.note ? `<p>${e(c.note)}</p>` : ''}</li>`).join('')
  const g = detail.congress || {}
  const laws = (g.laws || []).map((l) => `<li><b>${e(l.name)}.</b> ${e(l.what)}</li>`).join('')
  return `${comps ? `<h4>Inside the department</h4><ul>${comps}</ul>` : ''}
<h4>How Congress shapes it</h4>
<ul>${g.fundedBy ? `<li>Congress funds it each year through the ${e(g.fundedBy)}.</li>` : ''}${g.confirmed ? `<li>${e(g.confirmed)}</li>` : ''}${laws}</ul>${g.source ? `<p>${extLink(g.source, 'Source for the funding bill')}</p>` : ''}`
}

function government() {
  const checked = longDate(GOV_AS_OF)

  const rungs = GOV_LADDER.map((r) => `<li><h3>${e(r.title)}</h3><p>${e(r.body)}</p></li>`).join('')
  const depts = DEPARTMENTS.map((d) => `<li id="${e(d.id)}">
<h3>${e(d.name)}</h3>
<p>${e(d.does)}</p>
<dl>
<dt>Who runs it</dt><dd>${e(leaderLine(d))}</dd>
<dt>Founded</dt><dd>${e(d.founded)}</dd>
<dt>Inside it</dt><dd>${e(d.agencies.join(' · '))}</dd>
<dt>The building</dt><dd>${e(d.building)}, ${e(d.address)}</dd>
<dt>Who in Congress watches it</dt><dd>${e([...d.oversight.house, ...d.oversight.senate].join(', '))}</dd>
</dl>
<p>${extLink(d.website, 'Official website')} · ${extLink(d.headSource, 'Source for who runs it')}</p>
${departmentDetailHtml(d)}
</li>`).join('\n')
  const checks = CONGRESS_CHECKS.map((c) => `<li><h3>${e(c.title)}</h3><p>${e(c.body)}</p></li>`).join('')
  const indies = INDEPENDENT_AGENCIES.map((a) => `<li><h3>${e(a.name)}</h3><p>${e(a.does)}</p>${a.headName ? `<p>${e(`${a.headName}, ${a.acting ? 'Acting ' : ''}${a.headTitle}`)}</p>` : ''}</li>`).join('')

  const html = [
    section(`<ol class="gov-rungs">${rungs}</ol>`),
    section(`<h2>The 15 Departments</h2>
<p>Each one is a real building in or near Washington, with one person in charge.</p>
<ul class="gov-depts-text">${depts}</ul>`),
    ...(WORKFORCE_FACTS.length ? [section(`<h2>The Two Million Workers</h2>
<ul class="gov-workers">${WORKFORCE_FACTS.map((f) => `<li><p>${e(f.fact)}</p><p>${f.asOf ? `${e(f.asOf)} · ` : ''}${extLink(f.source, 'Source')}</p></li>`).join('')}</ul>`)] : []),
    section(`<h2>Where Congress Comes In</h2><ul class="gov-checks">${checks}</ul>
<p><a href="/this-week">See this week’s votes</a></p>`),
    section(`<h2>Outside The Departments</h2>
<p>Some agencies answer to the President or to Congress without sitting inside any department.</p>
<ul class="gov-indies">${indies}</ul>
<p>Checked on ${e(checked)}. People change jobs: each department links to the official page we checked. Sources: ${GOV_SOURCES.map((s) => extLink(s.url, s.label)).join(' · ')}</p>`),
  ].join('\n')

  const markdown = []
  for (const r of GOV_LADDER) markdown.push(`- **${r.title}.** ${r.body}`)
  markdown.push('', '## The 15 departments', '', `Checked on ${checked}.`, '',
    '| Department | Who runs it | What it does | Founded | Headquarters | Source |', '|---|---|---|---|---|---|')
  for (const d of DEPARTMENTS) {
    markdown.push(`| [${d.name}](${SITE}/government#${d.id}) | ${leaderLine(d)} | ${d.does} | ${d.founded} | ${d.building}, ${d.address} | ${d.headSource} |`)
  }
  for (const d of DEPARTMENTS) {
    const detail = DEPARTMENT_DETAIL[d.id]
    if (!detail) continue
    markdown.push('', `### Inside the ${d.name}`, '')
    for (const c of detail.components) markdown.push(`- **${c.name}**: ${c.does}${componentLeader(c) ? ` ${componentLeader(c)}.` : ''}${c.headSource ? ` Source: ${c.headSource}` : ''}`)
    const g = detail.congress || {}
    if (g.fundedBy) markdown.push(`- Funding: Congress funds it each year through the ${g.fundedBy}.`)
    if (g.confirmed) markdown.push(`- Senate confirmation: ${g.confirmed}`)
    for (const l of g.laws || []) markdown.push(`- Law: ${l.name}. ${l.what}`)
  }
  if (WORKFORCE_FACTS.length) {
    markdown.push('', '## The two million workers', '')
    for (const f of WORKFORCE_FACTS) markdown.push(`- ${f.fact}${f.asOf ? ` (${f.asOf})` : ''} Source: ${f.source}`)
  }
  markdown.push('', '## Where Congress comes in', '')
  for (const c of CONGRESS_CHECKS) markdown.push(`- **${c.title}.** ${c.body}`)
  markdown.push('', '## Outside the departments', '')
  for (const a of INDEPENDENT_AGENCIES) {
    markdown.push(`- **${a.name}**${a.headName ? ` (${a.headName}, ${a.acting ? 'Acting ' : ''}${a.headTitle})` : ''}: ${a.does}`)
  }
  markdown.push('', '## Sources', '')
  for (const s of GOV_SOURCES) markdown.push(`- ${s.label}: ${s.url}`)

  const jsonLd = [{
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'The 15 executive departments of the U.S. government',
    description: `Each federal executive department, who runs it and what it does. Checked on ${checked}.`,
    numberOfItems: DEPARTMENTS.length,
    itemListElement: DEPARTMENTS.map((d, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'GovernmentOrganization',
        '@id': `${SITE}/government#${d.id}`,
        name: d.name,
        description: d.does,
        url: `${SITE}/government#${d.id}`,
        sameAs: d.website,
        address: d.address,
        ...(d.headName ? { employee: { '@type': 'Person', name: d.headName, jobTitle: `${d.acting ? 'Acting ' : ''}${d.headTitle}` } } : {}),
        ...(DEPARTMENT_DETAIL[d.id]?.components?.length ? {
          subOrganization: DEPARTMENT_DETAIL[d.id].components.map((c) => ({
            '@type': 'GovernmentOrganization',
            name: c.name,
            description: c.does,
            ...(c.website ? { url: c.website } : {}),
            ...(c.headName ? { employee: { '@type': 'Person', name: c.headName, jobTitle: `${c.acting ? 'Acting ' : ''}${c.headTitle}` } } : {}),
          })),
        } : {}),
      },
    })),
  }]

  return { html, markdown, jsonLd, dateModified: GOV_AS_OF }
}

function glossary() {
  const entries = Object.entries(GLOSSARY)
  const inGroup = (g) => entries.filter(([, t]) => t.group === g.id)

  const primer = CIVICS_PRIMER.map((p) => `<li><h3>${e(p.title)}</h3><p>${e(p.body)}</p></li>`).join('')
  const groups = GLOSSARY_GROUPS.map((g) => `<div class="gl-group" id="group-${e(g.id)}">
<h2>${e(titleCase(g.title))}</h2>
<dl class="gl-list">
${inGroup(g).map(([id, t]) => `<div class="gl-entry" id="${e(id)}"><dt>${e(t.term)}</dt><dd>${e(t.def)}</dd></div>`).join('\n')}
</dl>
</div>`).join('\n')

  const html = [
    section(`<h2>Congress In One Minute</h2><ol class="ip-steps gl-primer">${primer}</ol>`),
    section(`${groups}
<p><a href="/this-week">See this week’s votes</a> · <a href="/government">Who runs the government</a></p>`),
  ].join('\n')

  const markdown = ['## Congress in one minute', '']
  for (const p of CIVICS_PRIMER) markdown.push(`- **${p.title}.** ${p.body}`)
  for (const g of GLOSSARY_GROUPS) {
    markdown.push('', `## ${g.title}`, '')
    for (const [id, t] of inGroup(g)) markdown.push(`- **${t.term}** (${SITE}/glossary#${id}): ${t.def}`)
  }

  const jsonLd = [{
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': `${SITE}/glossary#terms`,
    name: 'Glossary of U.S. Congress terms in plain English',
    url: `${SITE}/glossary`,
    hasDefinedTerm: entries.map(([id, t]) => ({
      '@type': 'DefinedTerm',
      '@id': `${SITE}/glossary#${id}`,
      name: t.term,
      description: t.def,
      url: `${SITE}/glossary#${id}`,
      inDefinedTermSet: `${SITE}/glossary#terms`,
    })),
  }]

  return { html, markdown, jsonLd }
}

function dataSources() {
  const items = DATA_SOURCES.map((s) => `<li>
<h3>${e(s.name)}</h3>
<p>${e(s.publisher)}. ${e(s.takes)}</p>
<p>Updated: ${e(s.cadence)}${s.cadenceNote ? `. ${e(s.cadenceNote)}` : ''}</p>
${s.url ? `<p>${extLink(s.url, s.linkLabel || s.url)}</p>` : ''}
</li>`).join('\n')
  const html = section(`<h2>Where Each Fact Comes From</h2><ul class="ip-sources-text">${items}</ul>
<p><a href="/methodology">How each number is made</a> · <a href="/open">Download the data</a></p>`)

  const markdown = ['| Source | Publisher | What we take | Updated | Link |', '|---|---|---|---|---|']
  for (const s of DATA_SOURCES) {
    markdown.push(`| ${s.name} | ${s.publisher} | ${s.takes} | ${s.cadence}${s.cadenceNote ? `. ${s.cadenceNote}` : ''} | ${s.url || ''} |`)
  }
  return { html, markdown, jsonLd: [] }
}

const BUILDERS = {
  '/government': government,
  '/glossary': glossary,
  '/data-sources': dataSources,
}

// Pages whose words live in their React component: the text is generated from
// the component by scripts/build-static-text.mjs.
function generated(path) {
  const page = STATIC_TEXT[path]
  return { html: page.html, markdown: page.markdown.split('\n'), jsonLd: [] }
}

// The paths whose full text is server-rendered (llms.txt and tests read this).
export const FULL_TEXT_PATHS = [...Object.keys(BUILDERS), ...Object.keys(STATIC_TEXT)]

export function staticContent(path) {
  if (Object.hasOwn(BUILDERS, path)) return BUILDERS[path]()
  if (Object.hasOwn(STATIC_TEXT, path)) return generated(path)
  return null
}
