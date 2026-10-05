// Homepage SEO and structured data, shared by the React landing (through
// src/components/SEO.jsx) and the server-rendered homepage (api/prerender.js
// kind=home), so what crawlers and AI answer engines read on `/` matches what
// visitors see. Plain JS with no React or Vite imports: the Node function
// imports this file directly.

import { BRAND } from '../config/brand.js'
import { LANDING_FAQ } from './landingFaq.js'
import { DATA_LICENSE, OPEN_DATA_TABLES, MANIFEST_URL, DATAPACKAGE_URL, openDataFiles, currentCongress } from '../../shared/openData.js'

export const SITE_URL = 'https://www.ballotwatch.io'
export const GITHUB_URL = 'https://github.com/Shoberman2/politalapp'
export const DEFAULT_OG_IMAGE = `${SITE_URL}/congress.jpg`

// <title> (60 characters or fewer) and meta description (155 or fewer). Both
// lead with what people actually type: "how did my representative vote" and
// "congressional voting record".
export const HOME_TITLE = 'How Did My Rep Vote? Congress Voting Records | BallotWatch'
export const HOME_DESCRIPTION = 'How did your representative vote? Search the congressional voting record: every roll call, bill and member of Congress, linked to its official source.'

export const HOME_H1 = 'How did your representative vote this week?'

// One plain-language paragraph: what BallotWatch is, for people and for
// answer engines quoting a definition.
export const HOME_ABOUT = `${BRAND.name} is a free, open-source, nonpartisan record of the U.S. Congress. Enter your address to find your House representative and both senators (a ZIP code alone finds your senators), then see how each of them voted on every recorded roll call in the 119th Congress, read what each bill does in plain English, and write to them about a specific vote. Every vote, bill and member comes from Congress.gov, the House Clerk and the Senate, is refreshed daily, and links to its official source.`

// Feature blurbs for the server-rendered homepage. `href` null means the link
// depends on live data (the record card and Tell your rep point at real
// records); the renderer fills it in or falls back.
export const HOME_FEATURES = [
  { id: 'find', title: 'Know who speaks for you.', body: 'Your address finds your House member and both senators, from U.S. Census district data. A ZIP code alone finds your senators.', href: '/my-representative', label: 'Find my reps' },
  { id: 'votes', title: 'See exactly how they voted.', body: 'Every roll call, this week’s and every one before it, with each member’s yea or nay linked to the official record.', href: '/this-week', label: 'This week on the floor' },
  { id: 'bills', title: 'Bills in plain English.', body: 'What a bill would actually change and who it affects, written from the official summary, with the full text one click away.', href: '/bills', label: 'Browse bills' },
  { id: 'record', title: 'Any record in 60 seconds.', body: 'The same one-screen card for every member: votes cast, votes missed, and the latest votes. No scores, no spin.', href: '/all', label: 'Pick a member' },
  { id: 'write', title: 'Then write to the person who cast it.', body: 'Your message starts with the facts of the vote. You add your words and send it yourself.', href: '/how-it-works', label: 'How Tell your rep works' },
  { id: 'alerts', title: 'Know before the vote.', body: 'Follow a bill and hear when it reaches committee, the floor, or a recorded vote. This one needs a free account.', href: '/alerts', label: 'Sign in to follow a bill' },
]

export const HOME_LINKS = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/methodology', label: 'Methodology' },
  { href: '/data-sources', label: 'Data sources' },
  { href: '/about', label: 'About' },
  { href: '/offices', label: 'For congressional offices' },
]

// One DataDownload per bulk file (gzip CSV and NDJSON, full archive and the
// current Congress), from the shared open-data catalog.
export function openDataDistributions(congress = currentCongress()) {
  const titles = Object.fromEntries(OPEN_DATA_TABLES.map((t) => [t.table, t.title]))
  return openDataFiles(congress).map((f) => ({
    '@type': 'DataDownload',
    name: `${titles[f.table]}, ${f.scope === 'congress' ? `${congress}th Congress` : 'full archive'} (${f.format === 'csv' ? 'CSV' : 'NDJSON'}, gzip)`,
    encodingFormat: f.format === 'csv' ? 'text/csv' : 'application/x-ndjson',
    fileFormat: 'application/gzip',
    contentUrl: f.url,
  }))
}

const ORG_ID = `${SITE_URL}/#organization`
const SITE_ID = `${SITE_URL}/#website`
const DATASET_ID = `${SITE_URL}/#dataset`

// JSON-LD blocks for `/`: Organization, WebSite, FAQPage, Dataset, one each.
// No SearchAction: /bills does not read a search query parameter, and a
// sitelinks search box that lands on an unfiltered page is worse than none.
// `dateModified` is the ETL's last successful run, when known.
export function homeJsonLd({ dateModified = null } = {}) {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: BRAND.name,
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/capitol-logo.png`,
    description: 'Free, open-source, nonpartisan record of the U.S. Congress: every member, recorded vote and bill, linked to its official source.',
    sameAs: [GITHUB_URL],
  }
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': SITE_ID,
    name: BRAND.name,
    url: `${SITE_URL}/`,
    description: HOME_DESCRIPTION,
    inLanguage: 'en-US',
    publisher: { '@id': ORG_ID },
  }
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    url: `${SITE_URL}/`,
    mainEntity: LANDING_FAQ.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
  const dataset = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': DATASET_ID,
    name: 'BallotWatch U.S. congressional voting record',
    description: 'Every member of the U.S. House and Senate, every recorded roll-call vote since the 119th Congress began, and the bills they voted on, with each member’s position and a link to the official source record. Ingested daily from Congress.gov, the House Clerk and the Senate, with districts from the U.S. Census Bureau and campaign finance from the FEC.',
    url: `${SITE_URL}/`,
    keywords: ['congressional voting record', 'roll call votes', 'U.S. Congress', 'House of Representatives', 'Senate', 'bills', 'legislation'],
    creator: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    isAccessibleForFree: true,
    // BallotWatch-derived data is CC0 1.0 (DATA_LICENSE.md); the federal
    // source records are public domain; the code is MIT (not the dataset).
    license: DATA_LICENSE.path,
    usageInfo: `${SITE_URL}/open#download`,
    isBasedOn: [
      'https://www.congress.gov/',
      'https://clerk.house.gov/Votes',
      'https://www.senate.gov/legislative/votes_new.htm',
      'https://www.census.gov/',
      'https://www.fec.gov/',
    ],
    temporalCoverage: '2025-01-03/..',
    spatialCoverage: { '@type': 'Place', name: 'United States' },
    distribution: [
      ...openDataDistributions(),
      { '@type': 'DataDownload', name: 'Open-data manifest: every bulk file with row count, size and SHA-256', encodingFormat: 'application/json', contentUrl: MANIFEST_URL },
      { '@type': 'DataDownload', name: 'Frictionless Data Package: column types, primary and foreign keys', encodingFormat: 'application/json', contentUrl: DATAPACKAGE_URL },
      { '@type': 'DataDownload', name: 'BallotWatch public API: recent roll-call votes (JSON, no key required for GET)', encodingFormat: 'application/json', contentUrl: `${SITE_URL}/api/v1/votes` },
      { '@type': 'DataDownload', name: 'OpenAPI description of the public API', encodingFormat: 'application/yaml', contentUrl: `${SITE_URL}/openapi.yaml` },
    ],
  }
  if (dateModified) dataset.dateModified = dateModified
  return [org, website, faq, dataset]
}

// The same blocks as one @graph, for <SEO schema={...}> on the client (SEO
// adds the @context).
export function homeJsonLdGraph(opts) {
  return {
    '@graph': homeJsonLd(opts).map(({ '@context': _ctx, ...rest }) => rest),
  }
}
