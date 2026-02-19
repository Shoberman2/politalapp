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
        district: currentTerm?.district,
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

export const getAllCurrentMembers = async () => {
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

      allMembers.push(...members)
      offset += members.length

      // If we got fewer than the limit, we've reached the end
      if (members.length < limit) break
    }

    console.log(`[Congress API] Total members received: ${allMembers.length}`)

    // Process and normalize member data
    const partyAbbr = { 'democratic': 'D', 'republican': 'R', 'independent': 'I' }
    const processed = allMembers.map(member => {
      const currentTerm = member.terms?.item?.[member.terms.item.length - 1]
      const chamberRaw = currentTerm?.chamber?.toLowerCase() || ''
      const chamber = chamberRaw.includes('senate') ? 'senate' : 'house'
      const rawParty = (member.partyName || currentTerm?.party || '').toLowerCase()
      const party = partyAbbr[rawParty] || rawParty.charAt(0).toUpperCase()

      return {
        bioguideId: member.bioguideId,
        name: member.name,
        firstName: member.firstName || '',
        lastName: member.lastName || '',
        state: member.state || currentTerm?.state,
        district: currentTerm?.district,
        party: party,
        partyName: member.partyName || currentTerm?.party,
        chamber: chamber,
        url: member.url || `https://www.congress.gov/member/${member.bioguideId}`,
        updateDate: member.updateDate
      }
    })

    console.log(`[Congress API] Processed ${processed.length} members`)
    return processed
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

    return {
      bills,
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
