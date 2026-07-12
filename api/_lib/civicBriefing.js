import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from './supabase.js'
import { getHeader, getRequestUrl, readJsonBody, sendResponse } from './request.js'

export { getHeader, getRequestUrl, readJsonBody, sendResponse } from './request.js'

export const briefingCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
}

const CONGRESS_API_BASE = 'https://api.congress.gov/v3'
const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY
  || process.env.VITE_CONGRESS_API_KEY
  || ''
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'

const STATE_ABBR = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR',
  California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID',
  Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS',
  Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
  Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV',
  Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC',
}

const STATE_NAME_LOOKUP = Object.fromEntries(
  Object.entries(STATE_ABBR).map(([name, abbr]) => [name.toLowerCase(), abbr])
)

const BILL_TYPE_LABELS = {
  HR: 'H.R.',
  S: 'S.',
  HRES: 'H.Res.',
  SRES: 'S.Res.',
  HJRES: 'H.J.Res.',
  SJRES: 'S.J.Res.',
  HCONRES: 'H.Con.Res.',
  SCONRES: 'S.Con.Res.',
}

const BILL_TYPE_SLUGS = {
  hr: 'house-bill',
  s: 'senate-bill',
  hres: 'house-resolution',
  sres: 'senate-resolution',
  hjres: 'house-joint-resolution',
  sjres: 'senate-joint-resolution',
  hconres: 'house-concurrent-resolution',
  sconres: 'senate-concurrent-resolution',
}

export function handleBriefingCors(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: briefingCorsHeaders })
  }
  return null
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...briefingCorsHeaders, 'Content-Type': 'application/json' },
  })
}

export function apiError(message, status = 400, code = 'BAD_REQUEST') {
  return json({ error: { message, code } }, status)
}

export function errorStatus(err) {
  return Number.isInteger(err?.status) ? err.status : 500
}

export function errorCode(err) {
  return err?.code || (errorStatus(err) === 500 ? 'SERVER_ERROR' : 'BAD_REQUEST')
}

function withStatus(message, status, code) {
  const err = new Error(message)
  err.status = status
  err.code = code
  return err
}

export function requestOrigin(req) {
  const configured = process.env.VITE_PUBLIC_ORIGIN || process.env.PUBLIC_ORIGIN
  if (configured) return configured.replace(/\/$/, '')
  try {
    const url = new URL(getRequestUrl(req))
    return url.origin
  } catch {
    return 'http://localhost:3000'
  }
}

export async function getAuthedUser(req) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  const authHeader = getHeader(req, 'authorization')

  if (!supabaseUrl || !supabaseAnonKey) {
    throw withStatus('Supabase auth is not configured.', 500, 'SUPABASE_CONFIG_MISSING')
  }

  const supabase = createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    }
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    throw withStatus('Sign in to use Civic Briefings.', 401, 'UNAUTHORIZED')
  }
  return user
}

export async function getProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, subscription_status, current_period_end')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data || null
}

export async function requireActiveSubscription(userId) {
  const profile = await getProfile(userId)
  if (profile?.subscription_status !== 'active') {
    throw withStatus('Civic Briefings are included with BallotWatch Pro.', 402, 'SUBSCRIPTION_REQUIRED')
  }
  return profile
}

export function parseDistrictTarget(target) {
  const raw = String(target || '').trim()
  if (!raw) return null

  const compact = raw.replace(/\s+/g, ' ')
  const stateToken = Object.keys(STATE_NAME_LOOKUP)
    .sort((a, b) => b.length - a.length)
    .find((name) => compact.toLowerCase().startsWith(name))

  if (stateToken) {
    const rest = compact.slice(stateToken.length).trim().replace(/^[-,]?\s*(district\s*)?/i, '')
    const district = normalizeDistrict(rest)
    if (district !== null) return { state: STATE_NAME_LOOKUP[stateToken], district }
  }

  const match = compact.match(/^([A-Za-z]{2})\s*[- ]\s*(?:district\s*)?(\d{1,2}|al|at-large)$/i)
  if (!match) return null
  return {
    state: match[1].toUpperCase(),
    district: normalizeDistrict(match[2]),
  }
}

export function inferTargetKind(target) {
  return parseDistrictTarget(target) ? 'district' : 'candidate'
}

function normalizeDistrict(value) {
  const v = String(value || '').trim().toLowerCase()
  if (v === 'al' || v === 'at-large' || v === 'at large') return '0'
  if (/^\d{1,2}$/.test(v)) return String(parseInt(v, 10))
  return null
}

function currentCongress() {
  const now = new Date()
  return Math.floor((now.getUTCFullYear() - 1789) / 2) + 1
}

async function congressFetch(path, params = {}) {
  const url = new URL(`${CONGRESS_API_BASE}${path}`)
  url.searchParams.set('format', 'json')
  if (CONGRESS_API_KEY) url.searchParams.set('api_key', CONGRESS_API_KEY)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  }

  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw withStatus(`Congress.gov request failed (${response.status}). ${body}`.trim(), 502, 'CONGRESS_API_ERROR')
  }
  return response.json()
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function currentTerm(member) {
  const terms = member?.terms?.item || []
  return terms[terms.length - 1] || {}
}

function normalizeMember(member) {
  const term = currentTerm(member)
  const chamberRaw = String(term.chamber || '').toLowerCase()
  const chamber = chamberRaw.includes('senate') ? 'senate' : 'house'
  const rawState = member.state || term.state || ''
  const state = STATE_ABBR[rawState] || rawState
  const rawParty = (member.partyName || term.party || '').toLowerCase()
  const party = rawParty.startsWith('dem') ? 'D'
    : rawParty.startsWith('rep') ? 'R'
      : rawParty.startsWith('ind') ? 'I'
        : rawParty.charAt(0).toUpperCase()

  return {
    bioguideId: member.bioguideId,
    name: member.name,
    firstName: member.firstName || '',
    lastName: member.lastName || member.name?.split(',')[0] || '',
    state,
    district: member.district ?? term.district ?? null,
    party,
    partyName: member.partyName || term.party || '',
    chamber,
    profileUrl: member.url || `https://www.congress.gov/member/${member.bioguideId}`,
  }
}

async function getAllCurrentMembers() {
  const members = []
  let offset = 0
  const limit = 250

  while (offset < 1000) {
    const data = await congressFetch('/member', { limit, offset, currentMember: true })
    const batch = data.members || []
    members.push(...batch.map(normalizeMember))
    if (batch.length < limit) break
    offset += batch.length
  }

  return members.filter((member) => member.bioguideId && member.name)
}

async function resolveBriefingTarget(target) {
  const input = String(target || '').trim()
  if (input.length < 2) {
    throw withStatus('Enter a district or candidate name.', 400, 'TARGET_REQUIRED')
  }

  const members = await getAllCurrentMembers()
  const district = parseDistrictTarget(input)

  if (district) {
    const districtNumber = normalizeDistrict(district.district)
    const houseMembers = members.filter((member) => (
      member.chamber === 'house' && member.state === district.state
    ))

    let member = houseMembers.find((candidate) => normalizeDistrict(candidate.district) === districtNumber)
    if (!member && districtNumber === '0' && houseMembers.length === 1) member = houseMembers[0]
    if (!member) {
      throw withStatus(`No current House member was found for ${district.state}-${district.district}.`, 404, 'TARGET_NOT_FOUND')
    }
    return { input, kind: 'district', member }
  }

  const normalizedInput = normalizeName(input)
  const tokens = normalizedInput.split(' ').filter(Boolean)
  const exact = members.find((member) => (
    normalizeName(member.name) === normalizedInput
    || normalizeName(`${member.firstName} ${member.lastName}`) === normalizedInput
  ))
  const fuzzy = exact || members.find((member) => {
    const memberName = normalizeName(`${member.name} ${member.firstName} ${member.lastName}`)
    return tokens.every((token) => memberName.includes(token))
  })

  if (!fuzzy) {
    throw withStatus(`No current member of Congress matched "${input}".`, 404, 'TARGET_NOT_FOUND')
  }
  return { input, kind: 'candidate', member: fuzzy }
}

function officialBillNumber(bill) {
  const type = String(bill.type || '').toUpperCase()
  return `${BILL_TYPE_LABELS[type] || type} ${bill.number || ''}`.trim()
}

function officialBillUrl(bill) {
  if (bill.congress && bill.type && bill.number) {
    const slug = BILL_TYPE_SLUGS[String(bill.type).toLowerCase()]
    if (slug) return `https://www.congress.gov/bill/${bill.congress}th-congress/${slug}/${bill.number}`
  }
  return bill.url || 'https://www.congress.gov/'
}

async function getSponsoredLegislation(bioguideId, limit = 5) {
  const data = await congressFetch(`/member/${bioguideId}/sponsored-legislation`, { limit })
  return (data.sponsoredLegislation || []).slice(0, limit).map((bill) => ({
    number: officialBillNumber(bill),
    title: bill.title || 'Untitled legislation',
    introducedDate: bill.introducedDate || '',
    latestAction: bill.latestAction?.text || 'Introduced',
    sourceUrl: officialBillUrl(bill),
  }))
}

async function getMemberDetails(bioguideId) {
  const data = await congressFetch(`/member/${bioguideId}`)
  return data.member || null
}

function resultKind(result) {
  const text = String(result || '').toLowerCase()
  if (text.includes('reject') || text.includes('fail')) return 'failed'
  if (text.includes('passed') || text.includes('agreed') || text.includes('confirmed') || text.includes('invoked')) return 'passed'
  return 'recorded'
}

function clerkVoteUrl(vote) {
  const date = vote.startDate || vote.voteDate || vote.date || ''
  const year = new Date(date).getUTCFullYear() || new Date().getUTCFullYear()
  return vote.rollCallNumber ? `https://clerk.house.gov/Votes/${year}${vote.rollCallNumber}` : 'https://clerk.house.gov/Votes'
}

async function getHouseVotes(bioguideId, limit = 5) {
  const congress = currentCongress()
  const data = await congressFetch(`/house-vote/${congress}`, { limit: 24 })
  const votes = (data.houseRollCallVotes || []).filter((vote) => vote.rollCallNumber && vote.sessionNumber)
  const memberVotes = []

  for (const vote of votes.slice(0, 14)) {
    if (memberVotes.length >= limit) break
    const memberData = await congressFetch(
      `/house-vote/${congress}/${vote.sessionNumber}/${vote.rollCallNumber}/members`
    ).catch(() => null)
    const memberPosition = memberData?.houseRollCallVoteMemberVotes?.results
      ?.find((row) => row.bioguideID === bioguideId)
    if (!memberPosition) continue

    const rawPosition = memberPosition.voteCast || ''
    const position = rawPosition === 'Aye' || rawPosition === 'Yea' ? 'Yea'
      : rawPosition === 'No' || rawPosition === 'Nay' ? 'Nay'
        : rawPosition || 'Unknown'

    memberVotes.push({
      chamber: 'House',
      rollNumber: vote.rollCallNumber,
      date: vote.startDate || vote.voteDate || '',
      billNumber: vote.legislationNumber || '',
      title: vote.voteQuestion || vote.question || vote.issue || 'Recorded House vote',
      result: vote.result || '',
      resultKind: resultKind(vote.result),
      position,
      sourceUrl: clerkVoteUrl(vote),
    })
  }

  return memberVotes
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function getSenateVotes(member, limit = 5) {
  const congress = currentCongress()
  const session = new Date().getUTCFullYear() % 2 === 1 ? 1 : 2
  const lastName = member.lastName || member.name?.split(',')[0] || ''
  const state = member.state || ''
  const listUrl = `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${congress}_${session}.xml`
  const listResponse = await fetch(listUrl)
  if (!listResponse.ok) return []
  const listXml = await listResponse.text()

  const entries = new Map()
  const entryRegex = /<vote>\s*<vote_number>(\d+)<\/vote_number>\s*<vote_date>([^<]*)<\/vote_date>\s*<issue>([^<]*)<\/issue>\s*<question>([^<]*)<\/question>\s*<result>([^<]*)<\/result>[\s\S]*?<title>([^<]*)<\/title>\s*<\/vote>/g
  let entryMatch
  while ((entryMatch = entryRegex.exec(listXml)) !== null) {
    entries.set(entryMatch[1], {
      date: entryMatch[2].trim(),
      billNumber: entryMatch[3].trim(),
      question: entryMatch[4].trim(),
      result: entryMatch[5].trim(),
      title: entryMatch[6].trim(),
    })
  }

  const voteNumbers = [...listXml.matchAll(/<vote_number>(\d+)<\/vote_number>/g)]
    .map((match) => match[1])
    .slice(0, 20)
  const memberVotes = []

  for (const voteNum of voteNumbers) {
    if (memberVotes.length >= limit) break
    const sourceUrl = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${voteNum}.xml`
    const response = await fetch(sourceUrl).catch(() => null)
    if (!response?.ok) continue
    const xml = await response.text()
    const memberRegex = new RegExp(
      `<member>[\\s\\S]*?<last_name>${escapeRegex(lastName)}</last_name>[\\s\\S]*?<state>${escapeRegex(state)}</state>[\\s\\S]*?<vote_cast>([^<]+)</vote_cast>[\\s\\S]*?</member>`
    )
    const memberMatch = xml.match(memberRegex)
    if (!memberMatch) continue

    const entry = entries.get(voteNum) || {}
    const parsedDate = entry.date ? new Date(entry.date.replace(/,\s*\d{1,2}:\d{2}\s*(AM|PM)/i, '')) : null
    memberVotes.push({
      chamber: 'Senate',
      rollNumber: parseInt(voteNum, 10),
      date: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString().slice(0, 10) : '',
      billNumber: entry.billNumber || '',
      title: entry.title || entry.question || 'Recorded Senate vote',
      result: entry.result || '',
      resultKind: resultKind(entry.result),
      position: memberMatch[1].trim(),
      sourceUrl,
    })
  }

  return memberVotes
}

async function getRecentVotes(member, limit = 5) {
  const details = await getMemberDetails(member.bioguideId).catch(() => null)
  const normalized = details ? normalizeMember(details) : member
  if (normalized.chamber === 'senate') return getSenateVotes({ ...member, ...normalized }, limit)
  return getHouseVotes(member.bioguideId, limit)
}

export async function buildCivicBriefing({ target }) {
  const resolved = await resolveBriefingTarget(target)
  const { member } = resolved
  const [votes, bills] = await Promise.all([
    getRecentVotes(member, 5).catch(() => []),
    getSponsoredLegislation(member.bioguideId, 5).catch(() => []),
  ])

  const office = member.chamber === 'senate'
    ? `${member.state} senator`
    : `${member.state}-${member.district || 'AL'} representative`
  const party = member.party ? `${member.party}-${member.state}` : member.state
  const summary = [
    `${member.name} is currently listed as a ${office} in the Congress.gov member directory.`,
    votes.length
      ? `The recent-vote section below reflects ${votes.length} recorded roll call vote${votes.length === 1 ? '' : 's'} found in official House or Senate records.`
      : 'No recent recorded votes were available from the checked official feeds.',
    bills.length
      ? `The bill section highlights sponsored legislation from Congress.gov, ordered by the latest available records.`
      : 'No recently sponsored legislation was returned by Congress.gov for this member.',
  ]

  const positions = votes.slice(0, 4).map((vote) => ({
    topic: vote.billNumber || `Roll Call ${vote.rollNumber}`,
    statement: `${member.name} was recorded as "${vote.position}" on ${vote.title}.`,
    basis: 'Recorded roll call vote',
    sourceUrl: vote.sourceUrl,
  }))

  return {
    generatedAt: new Date().toISOString(),
    tone: 'Neutral, source-based',
    target: {
      input: resolved.input,
      kind: resolved.kind,
      name: member.name,
      bioguideId: member.bioguideId,
      party,
      state: member.state,
      district: member.district,
      chamber: member.chamber,
      profileUrl: member.profileUrl,
    },
    summary,
    votes,
    bills,
    positions,
    sources: [
      { label: 'Congress.gov member profile', url: member.profileUrl },
      { label: 'Congress.gov sponsored legislation', url: `${CONGRESS_API_BASE}/member/${member.bioguideId}/sponsored-legislation` },
      { label: member.chamber === 'senate' ? 'Senate roll call votes' : 'House Clerk roll call votes', url: member.chamber === 'senate' ? 'https://www.senate.gov/legislative/votes_new.htm' : 'https://clerk.house.gov/Votes' },
    ],
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function textFromBriefing(briefing) {
  const lines = [
    `BallotWatch Civic Briefing: ${briefing.target.name}`,
    '',
    ...briefing.summary,
    '',
    'Recent votes:',
    ...(briefing.votes.length ? briefing.votes.map((vote) => `- ${vote.position}: ${vote.title} (${vote.sourceUrl})`) : ['- No recent votes found.']),
    '',
    'Sponsored bills:',
    ...(briefing.bills.length ? briefing.bills.map((bill) => `- ${bill.number}: ${bill.title} (${bill.sourceUrl})`) : ['- No recent sponsored bills found.']),
    '',
    'Sources:',
    ...briefing.sources.map((source) => `- ${source.label}: ${source.url}`),
  ]
  return lines.join('\n')
}

export function renderBriefingEmail(briefing) {
  const date = new Date(briefing.generatedAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const subject = `BallotWatch Civic Briefing: ${briefing.target.name}`
  const sectionTitle = 'font:600 12px Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#1D4ED8;margin:0 0 12px;'
  const itemBox = 'border-top:1px solid #E8E6E1;padding:14px 0;'

  const voteRows = briefing.votes.length
    ? briefing.votes.map((vote) => `
      <div style="${itemBox}">
        <div style="font:600 13px Arial,sans-serif;color:#1A1A18;">${escapeHtml(vote.position)} / ${escapeHtml(vote.billNumber || `Roll Call ${vote.rollNumber}`)}</div>
        <div style="font:400 15px/1.45 Georgia,serif;color:#1A1A18;margin-top:4px;">${escapeHtml(vote.title)}</div>
        <div style="font:400 12px Arial,sans-serif;color:#6B6861;margin-top:6px;">${escapeHtml(vote.chamber)} / ${escapeHtml(vote.result || 'Recorded')} / <a href="${escapeHtml(vote.sourceUrl)}" style="color:#1D4ED8;">source</a></div>
      </div>
    `).join('')
    : `<div style="${itemBox};font:400 14px Arial,sans-serif;color:#6B6861;">No recent recorded votes were found in the checked official feeds.</div>`

  const billRows = briefing.bills.length
    ? briefing.bills.map((bill) => `
      <div style="${itemBox}">
        <div style="font:600 13px Arial,sans-serif;color:#1D4ED8;">${escapeHtml(bill.number)}</div>
        <div style="font:400 15px/1.45 Georgia,serif;color:#1A1A18;margin-top:4px;">${escapeHtml(bill.title)}</div>
        <div style="font:400 12px Arial,sans-serif;color:#6B6861;margin-top:6px;">${escapeHtml(bill.latestAction)} / <a href="${escapeHtml(bill.sourceUrl)}" style="color:#1D4ED8;">source</a></div>
      </div>
    `).join('')
    : `<div style="${itemBox};font:400 14px Arial,sans-serif;color:#6B6861;">No recently sponsored bills were returned by Congress.gov.</div>`

  const positionRows = briefing.positions.length
    ? briefing.positions.map((position) => `
      <li style="margin:0 0 10px;color:#1A1A18;">
        ${escapeHtml(position.statement)}
        <a href="${escapeHtml(position.sourceUrl)}" style="color:#1D4ED8;">source</a>
      </li>
    `).join('')
    : '<li style="margin:0;color:#6B6861;">No source-backed vote-position notes are available yet.</li>'

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#FAFAF7;color:#1A1A18;">
    <div style="display:none;max-height:0;overflow:hidden;">A neutral, source-linked briefing from BallotWatch.</div>
    <main style="max-width:680px;margin:0 auto;padding:32px 20px 40px;background:#FAFAF7;">
      <div style="border-top:3px solid #1A1A18;border-bottom:1px solid #E8E6E1;padding:18px 0 20px;">
        <div style="font:600 11px Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#1D4ED8;">BallotWatch Civic Briefing</div>
        <h1 style="font:400 38px/1 Georgia,serif;letter-spacing:0;color:#1A1A18;margin:10px 0 8px;">${escapeHtml(briefing.target.name)}</h1>
        <p style="font:400 14px/1.55 Arial,sans-serif;color:#6B6861;margin:0;">${escapeHtml(date)} / ${escapeHtml(briefing.target.party)} / Neutral, source-based summary</p>
      </div>

      <section style="padding:22px 0;border-bottom:1px solid #E8E6E1;">
        <p style="${sectionTitle}">Summary</p>
        ${briefing.summary.map((line) => `<p style="font:400 16px/1.55 Arial,sans-serif;margin:0 0 12px;color:#1A1A18;">${escapeHtml(line)}</p>`).join('')}
      </section>

      <section style="padding:22px 0;border-bottom:1px solid #E8E6E1;">
        <p style="${sectionTitle}">Recent Votes</p>
        ${voteRows}
      </section>

      <section style="padding:22px 0;border-bottom:1px solid #E8E6E1;">
        <p style="${sectionTitle}">Bills And Activity</p>
        ${billRows}
      </section>

      <section style="padding:22px 0;border-bottom:1px solid #E8E6E1;">
        <p style="${sectionTitle}">Observed Positions</p>
        <ul style="font:400 14px/1.5 Arial,sans-serif;margin:0;padding-left:20px;">${positionRows}</ul>
      </section>

      <footer style="padding-top:20px;font:400 12px/1.6 Arial,sans-serif;color:#6B6861;">
        This briefing uses public congressional records and avoids inferred intent beyond recorded votes, bill sponsorship, and official actions.
        <div style="margin-top:12px;">
          ${briefing.sources.map((source) => `<a href="${escapeHtml(source.url)}" style="color:#1D4ED8;margin-right:12px;">${escapeHtml(source.label)}</a>`).join('')}
        </div>
      </footer>
    </main>
  </body>
</html>`

  return { subject, html, text: textFromBriefing(briefing) }
}

function googleClientId() {
  return process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID || ''
}

function googleClientSecret() {
  return process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET || ''
}

export function googleRedirectUri(req) {
  return process.env.GMAIL_REDIRECT_URI || `${requestOrigin(req)}/api/briefings/gmail/callback`
}

export function assertGoogleConfig() {
  if (!googleClientId() || !googleClientSecret()) {
    throw withStatus('Google OAuth is not configured.', 500, 'GOOGLE_CONFIG_MISSING')
  }
}

export function buildGoogleAuthUrl({ state, redirectUri }) {
  assertGoogleConfig()
  const url = new URL(GOOGLE_AUTH_URL)
  url.searchParams.set('client_id', googleClientId())
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('scope', `openid email ${GMAIL_SEND_SCOPE}`)
  url.searchParams.set('state', state)
  return url.toString()
}

async function postGoogleToken(params) {
  assertGoogleConfig()
  const body = new URLSearchParams({
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    ...params,
  })
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw withStatus(data.error_description || data.error || 'Google token exchange failed.', 502, 'GOOGLE_TOKEN_ERROR')
  }
  return data
}

export async function exchangeGoogleCode({ code, redirectUri }) {
  return postGoogleToken({
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
}

export async function getGoogleUserInfo(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) return null
  return response.json()
}

function encryptionKey() {
  const secret = process.env.GMAIL_TOKEN_ENCRYPTION_KEY || ''
  if (!secret) return null

  try {
    const decoded = Buffer.from(secret, 'base64')
    if (decoded.length === 32) return decoded
  } catch {
    // Fall back to hashing the configured secret.
  }
  return crypto.createHash('sha256').update(secret).digest()
}

export function encryptSecret(value) {
  if (!value) return null
  const key = encryptionKey()
  if (!key) throw withStatus('Gmail token encryption key is missing.', 500, 'TOKEN_KEY_MISSING')

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decryptSecret(value) {
  if (!value) return null
  if (value.startsWith('plain:v1:')) return value.slice('plain:v1:'.length)
  if (!value.startsWith('enc:v1:')) return value

  const key = encryptionKey()
  if (!key) throw withStatus('Gmail token encryption key is missing.', 500, 'TOKEN_KEY_MISSING')
  const [, , ivRaw, tagRaw, encryptedRaw] = value.split(':')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64'))
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

async function refreshAccessToken(connection) {
  const refreshToken = decryptSecret(connection.refresh_token_ciphertext)
  if (!refreshToken) throw withStatus('Gmail is connected without a refresh token. Reconnect Gmail.', 409, 'GMAIL_RECONNECT_REQUIRED')
  const token = await postGoogleToken({
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const expiryDate = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : connection.expiry_date

  await supabaseAdmin
    .from('civic_briefing_gmail_connections')
    .update({
      access_token_ciphertext: encryptSecret(token.access_token),
      scope: token.scope || connection.scope,
      token_type: token.token_type || connection.token_type,
      expiry_date: expiryDate,
      revoked_at: null,
    })
    .eq('user_id', connection.user_id)

  return token.access_token
}

export async function getUsableGmailAccessToken(connection) {
  const expiresAt = connection.expiry_date ? new Date(connection.expiry_date).getTime() : 0
  if (!connection.access_token_ciphertext || expiresAt < Date.now() + 60_000) {
    return refreshAccessToken(connection)
  }
  return decryptSecret(connection.access_token_ciphertext)
}

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function encodeMimeHeader(value) {
  const header = String(value || '')
  return /^[\x00-\x7F]*$/.test(header)
    ? header
    : `=?UTF-8?B?${Buffer.from(header, 'utf8').toString('base64')}?=`
}

function makeMimeMessage({ from, to, subject, html, text }) {
  if (!to || !String(to).includes('@')) {
    throw withStatus('A valid destination email is required before sending Gmail.', 400, 'EMAIL_REQUIRED')
  }

  const boundary = `bw_${crypto.randomBytes(8).toString('hex')}`
  return [
    `To: ${to}`,
    `From: ${from || 'me'}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

export async function sendGmailMessage({ connection, to, subject, html, text }) {
  const accessToken = await getUsableGmailAccessToken(connection)
  const raw = base64Url(makeMimeMessage({
    from: connection.gmail_email || 'me',
    to,
    subject,
    html,
    text,
  }))
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw withStatus(data.error?.message || 'Gmail send failed.', 502, 'GMAIL_SEND_FAILED')
  }
  return data
}

export async function revokeGoogleToken(token) {
  if (!token) return
  await fetch(GOOGLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  }).catch(() => null)
}
