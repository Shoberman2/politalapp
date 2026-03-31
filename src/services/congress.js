import axios from 'axios'

const BASE_URL = 'https://api.congress.gov/v3'
const API_KEY = import.meta.env.VITE_CONGRESS_API_KEY || 'TylrF1qkaHLXnqNUgeBSbclgONTIxEpDCAqMrvOs'

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

export const getMemberVotes = async (bioguideId, limit = 10) => {
  try {
    console.log(`[Congress API] Fetching votes for member: ${bioguideId}`)

    // First get member details to determine chamber
    const memberResponse = await congressApi.get(`/member/${bioguideId}`)
    const member = memberResponse.data.member

    // Determine current chamber from terms
    const terms = member?.terms || []
    const currentTerm = terms[terms.length - 1]
    const chamberRaw = currentTerm?.chamber?.toLowerCase() || ''
    const chamber = chamberRaw.includes('senate') ? 'Senate' : 'House'
    const currentCongress = 119

    console.log(`[Congress API] Member chamber: ${chamber}, Congress: ${currentCongress}`)

    // Use the correct vote endpoint: /vote/{congress}/{chamber}
    const votesResponse = await congressApi.get(`/vote/${currentCongress}/${chamber.toLowerCase()}`, {
      params: {
        limit: 50 // Fetch recent votes
      }
    })

    const votes = votesResponse.data?.votes || []
    console.log(`[Congress API] Found ${votes.length} chamber votes`)

    // For each vote, we need to get details to find this member's position
    const memberVotes = []

    for (const vote of votes) {
      if (memberVotes.length >= limit) break

      try {
        // Get vote details which includes member positions
        const voteUrl = vote.url?.replace('https://api.congress.gov/v3', '')
        if (!voteUrl) continue

        const voteDetailResponse = await congressApi.get(voteUrl)
        const voteDetail = voteDetailResponse.data?.vote

        // Find this member's position in the vote
        const memberPosition = voteDetail?.members?.find(m =>
          m.bioguideId === bioguideId
        )

        if (memberPosition) {
          memberVotes.push({
            rollNumber: voteDetail?.rollNumber || vote.rollNumber,
            date: voteDetail?.date || vote.date,
            question: voteDetail?.question || vote.question,
            description: voteDetail?.description || vote.description,
            result: voteDetail?.result || vote.result,
            billNumber: voteDetail?.bill?.number || vote.bill?.number,
            billTitle: voteDetail?.bill?.title || vote.bill?.title,
            position: memberPosition.votePosition || memberPosition.position || 'Unknown',
            chamber: chamber.toLowerCase()
          })
        }
      } catch (voteError) {
        // Skip individual vote errors, continue with others
        console.warn('[Congress API] Error fetching vote detail:', voteError.message)
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
        billNumber: `${bill.type}${bill.number}`,
        billTitle: bill.title,
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
      url: member.url || `https://www.congress.gov/member/${member.bioguideId}`,
      updateDate: member.updateDate
    }
  })
}

export const getAllCurrentMembers = async (onBatch) => {
  try {
    console.log('[Congress API] Fetching all current members (House + Senate)...')

    const allMembers = []
    let offset = 0
    const limit = 250 // Max allowed by Congress.gov API

    // Paginate through all results
    while (true) {
      console.log(`[Congress API] Fetching members batch at offset ${offset}...`)

      const response = await congressApi.get('/member', {
        params: {
          limit,
          offset,
          currentMember: true
        }
      })

      const members = response.data.members || []
      console.log(`[Congress API] Received ${members.length} members in this batch`)

      if (members.length === 0) break

      const processed = normalizeMemberBatch(members)
      allMembers.push(...processed)

      // Notify caller with incremental results
      if (onBatch) {
        onBatch([...allMembers])
      }

      offset += members.length

      // If we got fewer than the limit, we've reached the end
      if (members.length < limit) break
    }

    console.log(`[Congress API] Total members processed: ${allMembers.length}`)
    return allMembers
  } catch (error) {
    console.error('[Congress API] Error fetching all members:', error.response?.status, error.response?.data || error.message)
    throw error
  }
}

export const searchBills = async (options = {}) => {
  try {
    const { query, congress = 119, billType, limit = 20, offset = 0 } = options

    const params = {
      limit,
      offset,
      sort: 'updateDate+desc'
    }

    let endpoint = '/bill'

    if (congress) {
      endpoint = `/bill/${congress}`
    }

    if (billType) {
      endpoint = `/bill/${congress}/${billType.toLowerCase()}`
    }

    const response = await congressApi.get(endpoint, { params })
    let bills = response.data.bills || []

    // Client-side filtering by query if provided
    if (query) {
      const lowerQuery = query.toLowerCase()
      bills = bills.filter(bill =>
        bill.title?.toLowerCase().includes(lowerQuery) ||
        bill.number?.toString().includes(lowerQuery)
      )
    }

    // The list endpoint doesn't include sponsor data — fetch detail for each bill
    const enriched = await Promise.all(
      bills.map(async (bill) => {
        try {
          const type = bill.type?.toLowerCase()
          const detail = await congressApi.get(`/bill/${bill.congress}/${type}/${bill.number}`)
          return { ...bill, sponsors: detail.data.bill?.sponsors || [] }
        } catch {
          return bill
        }
      })
    )

    return {
      bills: enriched,
      pagination: response.data.pagination || { count: bills.length }
    }
  } catch (error) {
    console.error('Error searching bills:', error)
    throw error
  }
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
          // recordedVote.url is typically a full URL to the vote detail
          // e.g., https://api.congress.gov/v3/vote/118/house/123
          const voteUrl = recordedVote.url
          if (!voteUrl) continue

          // Fetch via our congressApi instance (adds api_key and format params)
          const relativePath = voteUrl.replace('https://api.congress.gov/v3', '')
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

  // Fetch sponsor details in parallel
  const enriched = await Promise.allSettled(
    scored.map(async (bill) => {
      try {
        const detail = await getBillDetails(bill.congress, bill.type?.toLowerCase(), bill.number)
        return {
          congress: bill.congress,
          type: bill.type?.toLowerCase(),
          number: bill.number,
          title: detail.title || bill.title,
          sponsors: detail.sponsors || [],
          latestAction: detail.latestAction || bill.latestAction,
          introducedDate: detail.introducedDate,
          originChamber: detail.originChamber,
          _score: bill._score
        }
      } catch {
        return {
          congress: bill.congress,
          type: bill.type?.toLowerCase(),
          number: bill.number,
          title: bill.title,
          sponsors: [],
          latestAction: bill.latestAction,
          _score: bill._score
        }
      }
    })
  )

  return enriched
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)
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

export const explainBillWithAI = async (billTitle, billSummary, billText = '') => {
  try {
    const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY

    if (!OPENAI_API_KEY) {
      const fallbackText = `This bill, titled "${billTitle}", ${billSummary ? billSummary.toLowerCase() : 'is currently under review in Congress.'}`
      return {
        explanation: fallbackText,
        paragraphs: [fallbackText, 'AI explanation requires an OpenAI API key. Add VITE_OPENAI_API_KEY to your .env file to enable AI-powered explanations.'],
        isPlaceholder: true
      }
    }

    const prompt = `You are a nonpartisan expert at explaining U.S. legislation in plain language.

Explain this bill clearly for an average citizen:

Title: ${billTitle}
${billSummary ? `Summary: ${billSummary}` : ''}
${billText ? `Bill Text (excerpt): ${billText.slice(0, 2000)}` : ''}

Write at least 2 full paragraphs in plain English explaining what this bill does, why it matters, and who it affects.
Do NOT use numbered lists or bullet points. Write in flowing paragraph form only.
Do NOT include any source citations, references, footnotes, or URLs.
Keep your response factual and balanced. Avoid political bias.`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 0.7
      })
    })

    if (!response.ok) {
      throw new Error('OpenAI API request failed')
    }

    const data = await response.json()
    const aiResponse = data.choices[0]?.message?.content || ''

    // Strip any URLs/citations that slip through
    const cleaned = aiResponse
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\[\d+\]/g, '')
      .replace(/\(source:.*?\)/gi, '')
      .trim()

    // Split into paragraphs on double newlines
    const paragraphs = cleaned
      .split(/\n\s*\n/)
      .map(p => p.replace(/\n/g, ' ').trim())
      .filter(p => p.length > 0)

    const explanation = paragraphs[0] || `This bill addresses ${billTitle}.`

    return {
      explanation,
      paragraphs,
      fullResponse: aiResponse,
      isPlaceholder: false
    }
  } catch (error) {
    console.error('Error explaining bill with AI:', error)
    const fallbackText = `This bill, titled "${billTitle}", ${billSummary ? billSummary.toLowerCase() : 'is currently under review in Congress.'}`
    return {
      explanation: fallbackText,
      paragraphs: [fallbackText, 'AI explanation temporarily unavailable. Please try again later.'],
      isPlaceholder: true,
      error: error.message
    }
  }
}
