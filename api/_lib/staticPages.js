// Head and lede for the static info pages, so crawlers and agents that do not
// run JavaScript get a distinct title, description, canonical, H1 and opening
// paragraph per page instead of the same app shell. Titles and descriptions
// mirror the <SEO> props in each page component (SEO appends " | BallotWatch");
// keep the two in step when either changes. The full page is still rendered by
// React; this is only the head and the first screen of text.

import { BRAND } from '../../src/config/brand.js'

const name = BRAND.name

export const STATIC_PAGES = {
  '/how-it-works': {
    title: 'How It Works',
    description: `How ${name} works: read your members' voting record, write to them yourself, and follow what they vote on next. Every fact links to its official source.`,
    h1: 'Read The Record. Reach The People In It.',
    lede: `${name} takes the official record of Congress, links every fact to its source, and puts it next to the people who represent you.`,
    changefreq: 'monthly',
    priority: 0.8,
  },
  '/glossary': {
    title: 'Congress, Explained in Plain English',
    description: 'A plain-English glossary of the words Congress uses, from roll call and cloture to cosponsor and continuing resolution. No background in politics needed.',
    h1: 'Congress, Explained In Plain English',
    lede: 'No background in politics needed. Here is what every term on this site means, from roll call and cloture to cosponsor and continuing resolution.',
    changefreq: 'monthly',
    priority: 0.7,
  },
  '/government': {
    title: 'How The Government Works',
    description: 'Who runs the U.S. government, in plain English: the President, the 15 executive departments, who leads each one, what it does, and how Congress checks them.',
    h1: 'Who Runs The Government',
    lede: 'The President sits at the top of the executive branch. Fifteen departments do most of its work, each led by a person the President picks and the Senate confirms. Congress creates, funds and oversees all of them.',
    changefreq: 'monthly',
    priority: 0.7,
  },
  '/methodology': {
    title: 'Methodology',
    description: `Source, cadence, caveat, and code-reference notes for every ${name} feature that computes or explains something.`,
    h1: 'How Each Number Is Made',
    lede: 'For every feature that computes or explains something: the source behind it, how often it updates, and the caveat that belongs beside it.',
    changefreq: 'monthly',
    priority: 0.7,
  },
  '/data-sources': {
    title: 'How We Get Our Data',
    description: `Where ${name}'s data comes from: Congress.gov, the House Clerk, the U.S. Senate, docs.house.gov, the U.S. Census Bureau, and the FEC. What we take from each, how often, and what we compute.`,
    h1: 'How We Get Our Data',
    lede: `Everything on ${name} comes from official public sources, shown as published and linked back to where it came from.`,
    changefreq: 'monthly',
    priority: 0.7,
  },
  '/about': {
    title: 'About',
    description: `${name} is an open-source, nonpartisan record of the U.S. Congress and a direct line to your representatives. Not affiliated with Congress or any party.`,
    h1: 'An Open, Nonpartisan Record Of Congress',
    lede: BRAND.mission,
    changefreq: 'monthly',
    priority: 0.6,
  },
  '/this-week': {
    title: 'This Week on the Floor',
    description: 'What the U.S. House has scheduled for floor consideration this week, from the Majority Leader’s weekly schedule, beside the roll-call votes Congress most recently recorded.',
    h1: 'This Week On The Floor',
    lede: 'What the House plans to take up this week, from the weekly schedule its majority leader publishes on docs.house.gov, next to the votes Congress has just recorded. A listing means a bill may come up that week, not that it will, and the schedule names the week, not the day.',
    changefreq: 'daily',
    priority: 0.9,
  },
  '/offices': {
    title: 'For Congressional Offices',
    description: 'A channel between constituents, their AI assistants, and congressional offices that answers from sources the office approves and never speaks for the Member. In development.',
    h1: 'Answer Constituents From Your Own Record',
    lede: 'We’re building a channel between constituents, the AI assistants they already use, and your office. It answers from sources your office approves, and it never speaks for the Member.',
    changefreq: 'monthly',
    priority: 0.5,
  },
  '/open': {
    title: 'Open Data',
    description: `Download the full ${name} congressional record: every member, bill, roll call and vote as daily CSV and NDJSON files, CC0 public domain. Plus the API, MCP server, methodology and source code.`,
    h1: 'Congressional Records You Can Download, Inspect And Reuse',
    lede: `Every member, bill, roll call and vote ${name} has, as daily bulk files under /data/full/ (manifest at /data/full/manifest.json), dedicated to the public domain under CC0 1.0. The API, MCP server, methodology and code are open too.`,
    changefreq: 'daily',
    priority: 0.7,
  },
  '/contact': {
    title: 'Contact',
    description: `How to reach ${name}: data corrections, security reports, and general questions.`,
    h1: 'How To Reach Us',
    lede: `${name} is a small, open-source project. The fastest way to reach us depends on what you need.`,
    changefreq: 'yearly',
    priority: 0.3,
  },
  '/privacy': {
    title: 'Privacy',
    description: `What ${name} collects, what it doesn't, and why. Tell your rep messages are never sent to or stored by us.`,
    h1: 'Privacy Notice',
    lede: `You can read the whole congressional record on ${name} without an account. This page explains, in plain language, the small amount of information we do handle and why.`,
    changefreq: 'yearly',
    priority: 0.3,
  },
  '/terms': {
    title: 'Terms of Use',
    description: `Plain-language terms for using ${name}, its API, and its data.`,
    h1: 'Terms Of Use',
    lede: `By using ${name}, its API, or its MCP server, you agree to these terms. We’ve kept them short and plain.`,
    changefreq: 'yearly',
    priority: 0.3,
  },
}

export const STATIC_PATHS = Object.keys(STATIC_PAGES)

export function staticPageTitle(page) {
  return `${page.title} | ${name}`
}
