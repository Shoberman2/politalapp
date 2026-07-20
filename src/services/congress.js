import axios from 'axios'
import { resolveMemberImageUrl, normalizeMemberImageUrl } from '../utils/memberImage'
import { CONGRESS_MAX } from '../utils/congressUtil'
import { supabase } from '../lib/supabase'

const BASE_URL = 'https://api.congress.gov/v3'
const API_KEY = import.meta.env.VITE_CONGRESS_API_KEY || ''

console.log('[Congress API] Initializing with base URL:', BASE_URL)
console.log('[Congress API] API Key present:', !!API_KEY)

const congressApi = axios.create({
  baseURL: BASE_URL,
  params: {
    api_key: API_KEY,
    format: 'json'
  }
})

// Add request interceptor for logging
congressApi.interceptors.request.use(
  (config) => {
    console.log(`[Congress API] Request: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`)
    console.log('[Congress API] Params:', config.params)
    return config
  },
  (error) => {
    console.error('[Congress API] Request Error:', error)
    return Promise.reject(error)
  }
)

function congressApiPathFromVoteUrl(voteUrl) {
  if (!voteUrl) return null
  if (voteUrl.startsWith('/')) return voteUrl
  if (voteUrl.startsWith(BASE_URL)) return voteUrl.slice(BASE_URL.length) || '/'
  return null
}

// Add response interceptor for logging
congressApi.interceptors.response.use(
  (response) => {
    console.log(`[Congress API] Response: ${response.status} from ${response.config.url}`)
    console.log('[Congress API] Data keys:', Object.keys(response.data || {}))
    return response
  },
  (error) => {
    console.error('[Congress API] Response Error:', error.response?.status, error.response?.data || error.message)
    return Promise.reject(error)
  }
)

export const getCurrentMembers = async (chamber = 'house') => {
  try {
    console.log(`[Congress API] Fetching ${chamber} members...`)

    // Use the /member endpoint with currentMember filter
    const response = await congressApi.get('/member', {
      params: {
        limit: 250,
        currentMember: true
      }
    })

    console.log(`[Congress API] Raw response members count: ${response.data.members?.length || 0}`)

    // Extract members from response
    let members = response.data.members || []

    // Filter by chamber
    members = members.filter(member => {
      const currentTerm = member.terms?.item?.[member.terms.item.length - 1]
      const memberChamber = currentTerm?.chamber?.toLowerCase() || ''
      const isMatch = chamber === 'house'
        ? memberChamber.includes('house') || memberChamber.includes('representative')
        : memberChamber.includes('senate')
      return isMatch
    })

    console.log(`[Congress API] Filtered ${chamber} members: ${members.length}`)

    // Normalize the data structure
    const partyAbbr = { 'democratic': 'D', 'republican': 'R', 'independent': 'I' }
    return members.map(member => {
      const currentTerm = member.terms?.item?.[member.terms.item.length - 1]
      const rawParty = (member.partyName || currentTerm?.party || '').toLowerCase()
      const partyCode = partyAbbr[rawParty] || rawParty.charAt(0).toUpperCase()
      return {
        bioguideId: member.bioguideId,
        name: member.name,
        firstName: member.firstName || '',
        lastName: member.lastName || '',
        state: member.state || currentTerm?.state,
        district: member.district || currentTerm?.district,
        party: partyCode,
        partyName: member.partyName || currentTerm?.party,
        chamber: chamber,
        imageUrl: resolveMemberImageUrl(member.bioguideId, member.depiction?.imageUrl),
        url: member.url || `https://www.congress.gov/member/${member.bioguideId}`,
        updateDate: member.updateDate
      }
    })
  } catch (error) {
    console.error('[Congress API] Error fetching current members:', error.response?.status, error.response?.data || error.message)
    throw error
  }
}

export const getMemberDetails = async (bioguideId) => {
  try {
    console.log(`[Congress API] Fetching member details for: ${bioguideId}`)
    const response = await congressApi.get(`/member/${bioguideId}`)
    console.log(`[Congress API] Member details received:`, response.data.member?.name || 'Unknown')
    return response.data.member
  } catch (error) {
    console.error('[Congress API] Error fetching member details:', error.response?.status, error.message)
    throw error
  }
}

/**
 * Fetch Senate votes from senate.gov XML feeds.
 * Congress.gov API doesn't have a Senate vote list endpoint,
 * so we use the official senate.gov roll call XML instead.
 */
const getSenateVotesFromXML = async (bioguideId, member, limit = 10) => {
  const congress = 119
  const lastName = member?.lastName || member?.name?.split(',')[0] || ''
  const state = member?.state || ''

  // Determine current session (1 = odd year, 2 = even year)
  const currentYear = new Date().getFullYear()
  const session = currentYear % 2 === 1 ? 1 : 2

  console.log(`[Senate XML] Fetching votes for ${lastName} (${state}), session ${session}`)

  // Fetch vote list XML
  const listUrl = `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${congress}_${session}.xml`
  const listResponse = await fetch(listUrl)
  if (!listResponse.ok) throw new Error(`Senate vote list failed: ${listResponse.status}`)
  const listXml = await listResponse.text()

  // Parse vote numbers from XML (most recent first)
  const voteNumbers = []
  const voteRegex = /<vote_number>(\d+)<\/vote_number>/g
  let match
  while ((match = voteRegex.exec(listXml)) !== null) {
    voteNumbers.push(match[1])
  }

  // Parse corresponding questions and results
  const voteEntries = []
  const entryRegex = /<vote>\s*<vote_number>(\d+)<\/vote_number>\s*<vote_date>([^<]*)<\/vote_date>\s*<issue>([^<]*)<\/issue>\s*<question>([^<]*)<\/question>\s*<result>([^<]*)<\/result>[^]*?<title>([^<]*)<\/title>\s*<\/vote>/g
  while ((match = entryRegex.exec(listXml)) !== null) {
    voteEntries.push({
      number: match[1],
      date: match[2].trim(),
      issue: match[3].trim(),
      question: match[4].trim(),
      result: match[5].trim(),
      title: match[6].trim()
    })
  }

  const entryMap = new Map(voteEntries.map(e => [e.number, e]))
  const recentVotes = voteNumbers.slice(0, Math.min(limit * 2, 30))

  console.log(`[Senate XML] Found ${voteNumbers.length} total votes, checking ${recentVotes.length}`)

  // Fetch individual vote XMLs in parallel batches to find this member's position
  const memberVotes = []
  const batchSize = 5

  for (let i = 0; i < recentVotes.length && memberVotes.length < limit; i += batchSize) {
    const batch = recentVotes.slice(i, i + batchSize)
    const results = await Promise.allSettled(
      batch.map(async (voteNum) => {
        const voteUrl = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${voteNum}.xml`
        const response = await fetch(voteUrl)
        if (!response.ok) return null
        const xml = await response.text()

        // Find this member by last name + state
        const memberRegex = new RegExp(
          `<member>[\\s\\S]*?<last_name>${lastName}</last_name>[\\s\\S]*?<state>${state}</state>[\\s\\S]*?<vote_cast>([^<]+)</vote_cast>[\\s\\S]*?</member>`
        )
        const memberMatch = xml.match(memberRegex)
        if (!memberMatch) return null

        const rawPosition = memberMatch[1].trim()
        const position = rawPosition === 'Yea' ? 'Yea'
          : rawPosition === 'Nay' ? 'Nay'
          : rawPosition === 'Present' ? 'Present'
          : rawPosition === 'Not Voting' ? 'Not Voting'
          : rawPosition || 'Unknown'

        // Extract vote date from the individual XML
        const dateMatch = xml.match(/<vote_date>([^<]+)<\/vote_date>/)
        const voteDate = dateMatch ? dateMatch[1].trim() : ''

        // Parse the date (format: "March 26, 2026, 05:30 PM")
        let formattedDate = ''
        try {
          const parsed = new Date(voteDate.replace(/,\s*\d{2}:\d{2}\s*(AM|PM)/, ''))
          if (!isNaN(parsed.getTime())) {
            formattedDate = parsed.toISOString().split('T')[0]
          }
        } catch (e) { /* use empty string */ }

        const entry = entryMap.get(voteNum)

        return {
          rollNumber: parseInt(voteNum, 10),
          date: formattedDate,
          question: entry?.question || '',
          description: entry?.title || '',
          result: entry?.result || '',
          billNumber: entry?.issue || null,
          billTitle: entry?.title || entry?.question || '',
          position,
          chamber: 'senate'
        }
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value && memberVotes.length < limit) {
        memberVotes.push(result.value)
      }
    }
  }

  console.log(`[Senate XML] Found ${memberVotes.length} votes for ${lastName}`)
  return memberVotes
}

export const getMemberVotes = async (bioguideId, limit = 10) => {
  try {
    console.log(`[Congress API] Fetching votes for member: ${bioguideId}`)

    // First get member details to determine chamber and name
    const memberResponse = await congressApi.get(`/member/${bioguideId}`)
    const member = memberResponse.data.member

    const termsArray = member?.terms?.item || []
    const currentTerm = termsArray[termsArray.length - 1]
    const chamberRaw = currentTerm?.chamber?.toLowerCase() || ''
    const chamber = chamberRaw.includes('senate') ? 'senate' : 'house'
    const currentCongress = 119

    console.log(`[Congress API] Member chamber: ${chamber}, Congress: ${currentCongress}`)

    if (chamber === 'senate') {
      return await getSenateVotesFromXML(bioguideId, member, limit)
    }

    // House: use Congress.gov API /house-vote/{congress}
    const votesResponse = await congressApi.get(`/house-vote/${currentCongress}`, {
      params: { limit: 20 }
    })

    const votes = votesResponse.data?.houseRollCallVotes || []
    console.log(`[Congress API] Found ${votes.length} house votes`)

    const validVotes = votes
      .filter(v => v.rollCallNumber && v.sessionNumber)
      .slice(0, limit)

    const batchSize = 5
    const memberVotes = []

    for (let i = 0; i < validVotes.length; i += batchSize) {
      const batch = validVotes.slice(i, i + batchSize)
      const results = await Promise.allSettled(
        batch.map(async (vote) => {
          const membersResponse = await congressApi.get(
            `/house-vote/${currentCongress}/${vote.sessionNumber}/${vote.rollCallNumber}/members`
          )
          const membersData = membersResponse.data?.houseRollCallVoteMemberVotes
          const members = membersData?.results || []
          const memberPosition = members.find(m => m.bioguideID === bioguideId)

          if (!memberPosition) return null

          const rawPosition = memberPosition.voteCast || ''
          const position = rawPosition === 'Yea' || rawPosition === 'Aye' ? 'Yea'
            : rawPosition === 'Nay' || rawPosition === 'No' ? 'Nay'
            : rawPosition === 'Present' ? 'Present'
            : rawPosition === 'Not Voting' ? 'Not Voting'
            : rawPosition || 'Unknown'

          return {
            rollNumber: vote.rollCallNumber,
            date: vote.startDate || vote.voteDate || vote.date,
            question: vote.voteQuestion || vote.question || '',
            description: vote.legislationType || vote.issue || '',
            result: vote.result || '',
            billNumber: vote.legislationNumber || null,
            billTitle: vote.voteQuestion || vote.question || '',
            position,
            chamber: 'house'
          }
        })
      )

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          memberVotes.push(result.value)
        }
      }
    }

    console.log(`[Congress API] Found ${memberVotes.length} votes for this member`)
    return memberVotes
  } catch (error) {
    console.error('[Congress API] Error fetching member votes:', error.message)

    // Fallback: return sponsored legislation as "activity" instead
    try {
      console.log('[Congress API] Falling back to sponsored legislation')
      const sponsoredResponse = await congressApi.get(`/member/${bioguideId}/sponsored-legislation`, {
        params: { limit: 10 }
      })

      const bills = sponsoredResponse.data?.sponsoredLegislation || []

      return bills.map(bill => ({
        rollNumber: null,
        date: bill.introducedDate,
        question: 'Sponsored Bill',
        description: bill.title,
        result: bill.latestAction?.text || 'Introduced',
        billNumber: bill.type && bill.number ? `${bill.type}${bill.number}` : null,
        billTitle: bill.title || 'Sponsored Bill',
        position: 'Sponsor',
        chamber: bill.originChamber?.toLowerCase() || 'unknown',
        isSponsoredBill: true
      }))
    } catch (fallbackError) {
      console.error('[Congress API] Fallback also failed:', fallbackError.message)
      return []
    }
  }
}

export const getMemberSponsorship = async (bioguideId) => {
  try {
    console.log(`[Congress API] Fetching sponsored legislation for: ${bioguideId}`)
    const response = await congressApi.get(`/member/${bioguideId}/sponsored-legislation`, {
      params: {
        limit: 20
      }
    })
    const bills = response.data.sponsoredLegislation || []
    console.log(`[Congress API] Found ${bills.length} sponsored bills`)
    return bills
  } catch (error) {
    console.error('[Congress API] Error fetching member sponsorship:', error.response?.status, error.message)
    return []
  }
}

export const getRecentBills = async (limit = 20) => {
  try {
    console.log(`[Congress API] Fetching recent bills, limit: ${limit}`)
    const response = await congressApi.get('/bill', {
      params: {
        limit,
        sort: 'updateDate+desc'
      }
    })
    const bills = response.data.bills || []
    console.log(`[Congress API] Found ${bills.length} recent bills`)
    return bills
  } catch (error) {
    console.error('[Congress API] Error fetching recent bills:', error.response?.status, error.message)
    throw error
  }
}

export const getBillDetails = async (congress, billType, billNumber) => {
  try {
    const response = await congressApi.get(`/bill/${congress}/${billType}/${billNumber}`)
    return response.data.bill
  } catch (error) {
    console.error('Error fetching bill details:', error)
    throw error
  }
}

export const getBillText = async (congress, billType, billNumber) => {
  try {
    const response = await congressApi.get(`/bill/${congress}/${billType}/${billNumber}/text`)
    return response.data.textVersions || []
  } catch (error) {
    console.error('Error fetching bill text:', error)
    return []
  }
}

const STATE_NAME_TO_ABBR = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
  'Puerto Rico': 'PR', 'American Samoa': 'AS', 'Guam': 'GU',
  'Northern Mariana Islands': 'MP', 'U.S. Virgin Islands': 'VI',
}

const normalizeMemberBatch = (members) => {
  const partyAbbr = { 'democratic': 'D', 'republican': 'R', 'independent': 'I' }
  return members.map(member => {
    const currentTerm = member.terms?.item?.[member.terms.item.length - 1]
    const chamberRaw = currentTerm?.chamber?.toLowerCase() || ''
    const chamber = chamberRaw.includes('senate') ? 'senate' : 'house'
    const rawParty = (member.partyName || currentTerm?.party || '').toLowerCase()
    const party = partyAbbr[rawParty] || rawParty.charAt(0).toUpperCase()
    const rawState = member.state || currentTerm?.state || ''
    const state = STATE_NAME_TO_ABBR[rawState] || rawState

    return {
      bioguideId: member.bioguideId,
      name: member.name,
      firstName: member.firstName || '',
      lastName: member.lastName || '',
      state: state,
      district: member.district || currentTerm?.district,
      party: party,
      partyName: member.partyName || currentTerm?.party,
      chamber: chamber,
      imageUrl: resolveMemberImageUrl(member.bioguideId, member.depiction?.imageUrl),
      // The API's own portrait URL — a reliable fallback for members not yet in
      // the unitedstates collection (e.g. brand-new members), whose high-res
      // `imageUrl` 404s. Congress.gov serves these at a hashed path.
      photoFallbackUrl: normalizeMemberImageUrl(member.depiction?.imageUrl),
      url: member.url || `https://www.congress.gov/member/${member.bioguideId}`,
      updateDate: member.updateDate
    }
  })
}

export const getAllCurrentMembers = async (onBatch) => {
  try {
    console.log('[Congress API] Fetching all current members (House + Senate)...')

    const limit = 250 // Max allowed by Congress.gov API

    // The first page also reports the true total via pagination.count. We used
    // to walk the pages one-at-a-time, which took ~15-20s and left the table
    // looking half-empty (House only, "Senate vacant") for most of that time.
    // Fetch page one, then request every remaining page in parallel.
    const first = await congressApi.get('/member', {
      params: { limit, offset: 0, currentMember: true },
    })
    const firstBatch = first.data.members || []
    const total = first.data.pagination?.count ?? firstBatch.length

    let allMembers = normalizeMemberBatch(firstBatch)

    const offsets = []
    for (let offset = limit; offset < total; offset += limit) offsets.push(offset)

    // Surface the first page right away, but flag whether the roster is complete
    // so the caller can hold a loading state until every chamber is in (and never
    // render a half-empty, "Senate vacant" table).
    if (onBatch) onBatch([...allMembers], offsets.length === 0)

    if (offsets.length) {
      const pages = await Promise.all(
        offsets.map((offset) =>
          congressApi
            .get('/member', { params: { limit, offset, currentMember: true } })
            .then((r) => normalizeMemberBatch(r.data.members || []))
            .catch((err) => {
              console.error(`[Congress API] Member page @${offset} failed:`, err.response?.status || err.message)
              return []
            })
        )
      )
      for (const page of pages) allMembers.push(...page)

      // De-dupe defensively in case page windows overlap.
      const seen = new Set()
      allMembers = allMembers.filter((m) => {
        if (!m.bioguideId) return true
        if (seen.has(m.bioguideId)) return false
        seen.add(m.bioguideId)
        return true
      })
    }

    console.log(`[Congress API] Total members processed: ${allMembers.length}`)
    if (onBatch) onBatch([...allMembers], true)
    return allMembers
  } catch (error) {
    console.error('[Congress API] Error fetching all members:', error.response?.status, error.response?.data || error.message)
    throw error
  }
}

// A small, real sample of current members for the landing illustration: real
// names, parties, and headshots instead of blank placeholders. Prefers a House
// + Senate mix so the "your senators and representative" framing reads true.
// Best-effort: returns [] on failure so the caller can fall back to a skeleton.
export const getFeaturedMembers = async (count = 3) => {
  try {
    // Only feature members with a published portrait, so the landing shows real
    // congressional faces — never blank avatars (brand-new members often have no
    // photo yet). The API returns all House members first, then senators, so we
    // pull the first House page plus the tail for two senators to match the
    // "your two senators and your House member" framing.
    const hasPhoto = (m) => m.depiction?.imageUrl
    const houseRes = await congressApi.get('/member', {
      params: { limit: 40, currentMember: true },
    })
    const total = houseRes.data.pagination?.count ?? 0
    const senRes = total
      ? await congressApi.get('/member', {
          params: { limit: 60, offset: Math.max(0, total - 60), currentMember: true },
        }).catch(() => null)
      : null

    const reps = normalizeMemberBatch((houseRes.data.members || []).filter(hasPhoto))
      .filter((m) => m.name && m.bioguideId && m.chamber === 'house')
    const senators = normalizeMemberBatch((senRes?.data?.members || []).filter(hasPhoto))
      .filter((m) => m.name && m.bioguideId && m.chamber === 'senate')

    const picked = [reps[0], senators[0], senators[1]].filter(Boolean)
    // Backfill from either chamber if a page came up short.
    for (const m of [...reps, ...senators]) {
      if (picked.length >= count) break
      if (!picked.some((p) => p.bioguideId === m.bioguideId)) picked.push(m)
    }
    return picked.slice(0, count)
  } catch (err) {
    console.warn('[Congress API] getFeaturedMembers failed:', err.message)
    return []
  }
}

function canonicalBillId(bill) {
  const type = bill.type?.toLowerCase()
  if (!bill.congress || !type || bill.number == null) return null
  return `${bill.congress}-${type}-${bill.number}`
}

async function enrichBillsWithSponsorsFromDb(bills) {
  const ids = [...new Set(bills.map(canonicalBillId).filter(Boolean))]
  if (ids.length === 0) return bills

  try {
    const { data, error } = await supabase
      .from('bills')
      .select('id, sponsor_bioguide_id, sponsor_name, sponsor_party, sponsor_state')
      .in('id', ids)

    if (error) throw error

    const sponsorsByBill = new Map((data || []).map((row) => [row.id, row]))
    return bills.map((bill) => {
      const row = sponsorsByBill.get(canonicalBillId(bill))
      const sponsor = row?.sponsor_bioguide_id
        ? {
            bioguideId: row.sponsor_bioguide_id,
            fullName: row.sponsor_name || null,
            party: row.sponsor_party || null,
            state: row.sponsor_state || null,
          }
        : null
      return {
        ...bill,
        sponsors: sponsor ? [sponsor] : (bill.sponsors || []),
      }
    })
  } catch (error) {
    console.warn('[Congress API] Sponsor batch lookup failed:', error.message)
    return bills
  }
}

const searchBillsInFlight = new Map()

async function fetchBillsSearch(options = {}) {
  try {
    const { query, congress = CONGRESS_MAX, billType, limit = 20, offset = 0 } = options
    const normalizedBillType = billType?.toLowerCase()

    const params = {
      limit,
      offset,
      sort: 'updateDate+desc'
    }

    let endpoint = '/bill'

    if (congress) {
      endpoint = `/bill/${congress}`
    }

    if (normalizedBillType && congress) {
      endpoint = `/bill/${congress}/${normalizedBillType}`
    }

    const response = await congressApi.get(endpoint, { params })
    let bills = response.data.bills || []

    if (normalizedBillType && !congress) {
      bills = bills.filter((bill) => bill.type?.toLowerCase() === normalizedBillType)
    }

    // Client-side filtering by query if provided
    if (query) {
      const lowerQuery = query.toLowerCase()
      bills = bills.filter(bill =>
        bill.title?.toLowerCase().includes(lowerQuery) ||
        bill.number?.toString().includes(lowerQuery)
      )
    }

    // The list endpoint omits sponsors. Resolve all visible sponsor bylines in
    // one database round-trip instead of one Congress.gov detail request per bill.
    const enriched = await enrichBillsWithSponsorsFromDb(bills)

    return {
      bills: enriched,
      pagination: response.data.pagination || { count: bills.length }
    }
  } catch (error) {
    console.error('Error searching bills:', error)
    throw error
  }
}

export const searchBills = (options = {}) => {
  const key = JSON.stringify({
    query: options.query || '',
    congress: options.congress ?? CONGRESS_MAX,
    billType: options.billType?.toLowerCase() || '',
    limit: options.limit ?? 20,
    offset: options.offset ?? 0,
  })
  const inFlight = searchBillsInFlight.get(key)
  if (inFlight) return inFlight

  const request = fetchBillsSearch(options)
  searchBillsInFlight.set(key, request)
  const clear = () => {
    if (searchBillsInFlight.get(key) === request) searchBillsInFlight.delete(key)
  }
  request.then(clear, clear)
  return request
}

export const getBillCosponsors = async (congress, billType, billNumber) => {
  try {
    const response = await congressApi.get(`/bill/${congress}/${billType}/${billNumber}/cosponsors`)
    return response.data.cosponsors || []
  } catch (error) {
    console.error('Error fetching bill cosponsors:', error)
    return []
  }
}

export const getBillCommittees = async (congress, billType, billNumber) => {
  try {
    const response = await congressApi.get(`/bill/${congress}/${billType}/${billNumber}/committees`)
    return response.data.committees || []
  } catch (error) {
    console.error('Error fetching bill committees:', error)
    return []
  }
}

export const getBillActions = async (congress, billType, billNumber) => {
  try {
    const response = await congressApi.get(`/bill/${congress}/${billType}/${billNumber}/actions`)
    return response.data.actions || []
  } catch (error) {
    console.error('Error fetching bill actions:', error)
    return []
  }
}

export const getVoteTalliesFromActions = async (actions) => {
  try {
    if (!actions || actions.length === 0) return []

    // Find actions that have recordedVotes (roll call votes)
    const actionsWithVotes = actions.filter(
      action => action.recordedVotes && action.recordedVotes.length > 0
    )

    if (actionsWithVotes.length === 0) return []

    const tallies = []

    for (const action of actionsWithVotes) {
      for (const recordedVote of action.recordedVotes) {
        try {
          // recordedVote.url is typically a full URL to the Congress.gov vote detail.
          // Senate actions can point at senate.gov XML, which is not CORS-readable
          // from the browser, so only fetch URLs our Congress.gov client can serve.
          const voteUrl = recordedVote.url
          const relativePath = congressApiPathFromVoteUrl(voteUrl)
          if (!relativePath) continue

          // Fetch via our congressApi instance (adds api_key and format params).
          const response = await congressApi.get(relativePath)
          const voteDetail = response.data?.vote

          if (voteDetail) {
            tallies.push({
              chamber: recordedVote.chamber || voteDetail.chamber || '',
              date: recordedVote.date || voteDetail.date || action.actionDate,
              rollNumber: recordedVote.rollNumber || voteDetail.rollNumber,
              result: voteDetail.result || recordedVote.result || '',
              totalYea: voteDetail.totalYea ?? voteDetail.yea?.total ?? 0,
              totalNay: voteDetail.totalNay ?? voteDetail.nay?.total ?? 0,
              totalNotVoting: voteDetail.totalNotVoting ?? voteDetail.notVoting?.total ?? 0,
              totalPresent: voteDetail.totalPresent ?? voteDetail.present?.total ?? 0,
              question: voteDetail.question || ''
            })
          }
        } catch (voteErr) {
          console.warn('[Congress API] Error fetching vote tally:', voteErr.message)
        }
      }
    }

    return tallies
  } catch (error) {
    console.error('[Congress API] Error getting vote tallies:', error.message)
    return []
  }
}

// --- Notable / "In the News" bills pipeline ---

const ACTION_SCORES = [
  { pattern: /became public law/i, score: 100 },
  { pattern: /signed by president/i, score: 100 },
  { pattern: /resolving differences/i, score: 90 },
  { pattern: /passed (house|senate) and (house|senate)/i, score: 85 },
  { pattern: /cloture/i, score: 80 },
  { pattern: /passed (house|senate)/i, score: 80 },
  { pattern: /motion to reconsider/i, score: 75 },
  { pattern: /amendment/i, score: 60 },
  { pattern: /reported by/i, score: 55 },
  { pattern: /ordered to be reported/i, score: 50 },
  { pattern: /hearing/i, score: 40 },
  { pattern: /committee/i, score: 35 },
  { pattern: /introduced/i, score: 10 }
]

function scoreBill(bill) {
  const text = bill.latestAction?.text || ''
  for (const { pattern, score } of ACTION_SCORES) {
    if (pattern.test(text)) return score
  }
  return 0
}

// localStorage cache helpers (24hr TTL for editorial content)
const NB_EDITORIAL_TTL = 24 * 60 * 60 * 1000

function nbCacheGet(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data, expiry } = JSON.parse(raw)
    if (Date.now() > expiry) {
      localStorage.removeItem(key)
      return null
    }
    return data
  } catch {
    return null
  }
}

function nbCacheSet(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, expiry: Date.now() + NB_EDITORIAL_TTL }))
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      // Evict old notable-bill entries and retry
      const keysToRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k?.startsWith('nb_editorial_')) keysToRemove.push(k)
      }
      keysToRemove.forEach(k => localStorage.removeItem(k))
      try {
        localStorage.setItem(key, JSON.stringify({ data, expiry: Date.now() + NB_EDITORIAL_TTL }))
      } catch {
        // give up silently
      }
    }
  }
}

// In-memory promise cache (30 min)
let _notableBillsPromise = null
let _notableBillsCacheTime = 0
const NOTABLE_CACHE_TTL = 30 * 60 * 1000

async function fetchNotableBills() {
  const response = await congressApi.get('/bill/119', {
    params: { limit: 250, sort: 'updateDate+desc' }
  })
  const bills = response.data.bills || []

  // Score and sort
  const scored = bills
    .map(b => ({ ...b, _score: scoreBill(b) }))
    .filter(b => b._score >= 35)
    .sort((a, b) => b._score - a._score)
    .slice(0, 7)

  // The list payload already contains the fields used by the landing and Bills
  // views. Add sponsor bylines with one DB batch instead of seven bill-detail
  // requests to Congress.gov.
  return enrichBillsWithSponsorsFromDb(
    scored.map((bill) => ({
      ...bill,
      type: bill.type?.toLowerCase(),
    }))
  )
}

// Strip HTML tags and grab the first meaningful sentence from CRS summary text
function extractBlurb(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  // Skip the bold title line CRS puts at the start, grab the next sentence
  const sentences = text.split(/(?<=\.)\s+/)
  const meaningful = sentences.find(s => s.length > 30 && !s.startsWith('This bill is titled'))
  return meaningful?.slice(0, 200) || sentences[1]?.slice(0, 200) || text.slice(0, 200)
}

// Build a headline from the bill title — take the short name if present, otherwise truncate
function buildHeadline(title) {
  if (!title) return ''
  // Many bills have a short title like "XYZ Act" — extract it
  const actMatch = title.match(/(?:the\s+)?(.{5,60}?\bAct\b)/i)
  if (actMatch) return actMatch[1]
  // For resolutions, trim common prefixes
  const cleaned = title
    .replace(/^A (bill|resolution|joint resolution|concurrent resolution) /i, '')
    .replace(/^(Providing|Expressing|Designating|Recognizing|Supporting|Calling) for /i, '$1: ')
  return cleaned.length > 80 ? cleaned.slice(0, 77) + '...' : cleaned
}

// Template-based "why it matters" from the latest action text
function buildTemplateBlurb(latestAction, title) {
  const action = (latestAction || '').toLowerCase()
  if (action.includes('became public law') || action.includes('signed by president')) {
    return 'Signed into law — this legislation is now in effect and will be implemented by federal agencies.'
  }
  if (action.includes('passed house') && action.includes('passed senate')) {
    return 'Passed both chambers of Congress and is heading to the President\'s desk for signature.'
  }
  if (action.includes('passed house')) {
    return 'Passed the House and now moves to the Senate for consideration.'
  }
  if (action.includes('passed senate')) {
    return 'Passed the Senate and now moves to the House for consideration.'
  }
  if (action.includes('cloture')) {
    return 'A cloture vote has been invoked, limiting debate and moving this bill closer to a final vote.'
  }
  if (action.includes('reported by') || action.includes('ordered to be reported')) {
    return 'Advanced out of committee and is now on the legislative calendar for floor action.'
  }
  if (action.includes('hearing')) {
    return 'Committee hearings are underway as lawmakers gather testimony on this legislation.'
  }
  if (action.includes('committee')) {
    return 'Referred to committee for review — this is where most of the detailed work on legislation happens.'
  }
  return title ? `This legislation is currently active in the ${action.includes('senate') ? 'Senate' : 'House'}.` : 'This legislation is currently active in Congress.'
}

async function generateBillEditorial(title, latestAction, type, number, congress) {
  const cacheKey = `nb_editorial_${type}${number}`
  const cached = nbCacheGet(cacheKey)
  if (cached) return cached

  const headline = buildHeadline(title) || `${type?.toUpperCase()} ${number}`

  // Try CRS summary first
  try {
    const response = await congressApi.get(`/bill/${congress || 119}/${type}/${number}/summaries`)
    const summaries = response.data.summaries || []
    if (summaries.length > 0) {
      // Use the most recent summary
      const latest = summaries[summaries.length - 1]
      const blurb = extractBlurb(latest.text)
      if (blurb) {
        const result = { headline, whyItMatters: blurb }
        nbCacheSet(cacheKey, result)
        return result
      }
    }
  } catch {
    // CRS summary not available — fall through to template
  }

  // Fallback: template-based blurb
  const result = { headline, whyItMatters: buildTemplateBlurb(latestAction, title) }
  nbCacheSet(cacheKey, result)
  return result
}

export const getTrendingBills = async () => {
  const now = Date.now()
  if (_notableBillsPromise && (now - _notableBillsCacheTime) < NOTABLE_CACHE_TTL) {
    return _notableBillsPromise
  }

  _notableBillsCacheTime = now
  _notableBillsPromise = (async () => {
    try {
      const bills = await fetchNotableBills()
      if (bills.length === 0) return []

      // Generate editorial content in parallel
      const withEditorial = await Promise.all(
        bills.map(async (bill) => {
          const editorial = await generateBillEditorial(
            bill.title,
            bill.latestAction?.text,
            bill.type,
            bill.number,
            bill.congress
          )
          return { ...bill, ...editorial }
        })
      )

      return withEditorial
    } catch (err) {
      console.error('[Congress API] Notable bills pipeline failed:', err.message)
      return []
    }
  })()

  return _notableBillsPromise
}

export const explainBillWithAI = async ({ congress, billType, number, title, summary }) => {
  const fallback = (msg) => {
    const text = `This bill, titled "${title}", ${summary ? String(summary).toLowerCase() : 'is currently under review in Congress.'}`
    return {
      explanation: text,
      paragraphs: [text, msg],
      isPlaceholder: true,
    }
  }

  if (!congress || !billType || !number || !title) {
    return fallback('AI explanation unavailable: missing bill identifiers.')
  }

  try {
    const { supabase } = await import('../lib/supabase')
    const { data, error } = await supabase.functions.invoke('explain-bill', {
      body: { congress, billType, number, title, summary: summary || '' },
    })

    if (error) throw error
    if (!data?.paragraphs?.length) throw new Error('Empty response')

    return {
      explanation: data.explanation,
      paragraphs: data.paragraphs,
      cached: data.cached,
      isPlaceholder: false,
    }
  } catch (err) {
    console.error('Error explaining bill with AI:', err)
    return fallback('AI explanation temporarily unavailable. Please try again later.')
  }
}
