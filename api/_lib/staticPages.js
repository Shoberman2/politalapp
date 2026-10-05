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
    h1: 'Read the record. Reach the people in it.',
    lede: `${name} takes the official record of Congress, links every fact to its source, and puts it next to the people who represent you.`,
    changefreq: 'monthly',
    priority: 0.8,
  },
  '/methodology': {
    title: 'Methodology',
    description: `Source, cadence, caveat, and code-reference notes for every ${name} feature that computes or explains something.`,
    h1: 'How each number is made',
    lede: 'For every feature that computes or explains something: the source behind it, how often it updates, and the caveat that belongs beside it.',
    changefreq: 'monthly',
    priority: 0.7,
  },
  '/data-sources': {
    title: 'How We Get Our Data',
    description: `Where ${name}'s data comes from: Congress.gov, the House Clerk, the U.S. Senate, docs.house.gov, the U.S. Census Bureau, and the FEC. What we take from each, how often, and what we compute.`,
    h1: 'How we get our data',
    lede: `Everything on ${name} comes from official public sources, shown as published and linked back to where it came from.`,
    changefreq: 'monthly',
    priority: 0.7,
  },
  '/about': {
    title: 'About',
    description: `${name} is an open-source, nonpartisan record of the U.S. Congress and a direct line to your representatives. Not affiliated with Congress or any party.`,
    h1: 'An open, nonpartisan record of Congress, and a direct line to the people in it.',
    lede: BRAND.mission,
    changefreq: 'monthly',
    priority: 0.6,
  },
  '/this-week': {
    title: 'This Week on the Floor',
    description: 'What the U.S. House has scheduled for floor consideration this week, from the Majority Leader’s weekly schedule, beside the roll-call votes Congress most recently recorded.',
    h1: 'This week on the floor',
    lede: 'What the House has scheduled for floor consideration, from the Majority Leader’s weekly schedule on docs.house.gov, beside the roll-call votes Congress has most recently recorded. A listing means a bill may come up that week; it is not a promise of a vote, and the schedule names the week, not the day.',
    changefreq: 'daily',
    priority: 0.9,
  },
  '/offices': {
    title: 'For Congressional Offices',
    description: 'A channel between constituents, their AI assistants, and congressional offices that answers from sources the office approves and never speaks for the Member. In development.',
    h1: 'Answer constituents from your own record. Receive mail your staff can use.',
    lede: 'We’re building a channel between constituents, the AI assistants they already use, and your office. It answers from sources your office approves, and it never speaks for the Member.',
    changefreq: 'monthly',
    priority: 0.5,
  },
  '/contact': {
    title: 'Contact',
    description: `How to reach ${name}: data corrections, security reports, and general questions.`,
    h1: 'How to reach us',
    lede: `${name} is a small, open-source project. The fastest way to reach us depends on what you need.`,
    changefreq: 'yearly',
    priority: 0.3,
  },
  '/privacy': {
    title: 'Privacy',
    description: `What ${name} collects, what it doesn't, and why. Tell your rep messages are never sent to or stored by us.`,
    h1: 'Privacy notice',
    lede: `You can read the whole congressional record on ${name} without an account. This page explains, in plain language, the small amount of information we do handle and why.`,
    changefreq: 'yearly',
    priority: 0.3,
  },
  '/terms': {
    title: 'Terms of Use',
    description: `Plain-language terms for using ${name}, its API, and its data.`,
    h1: 'Terms of use',
    lede: `By using ${name}, its API, or its MCP server, you agree to these terms. We’ve kept them short and plain.`,
    changefreq: 'yearly',
    priority: 0.3,
  },
}

export const STATIC_PATHS = Object.keys(STATIC_PAGES)

export function staticPageTitle(page) {
  return `${page.title} | ${name}`
}
