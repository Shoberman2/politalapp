import axios from 'axios'

// FEC API (no key required, public data)
const FEC_BASE_URL = 'https://api.open.fec.gov/v1'
const FEC_API_KEY = import.meta.env.VITE_FEC_API_KEY || 'DEMO_KEY'

console.log('[Donations API] Initializing...')
console.log('[Donations API] FEC API Key present:', !!FEC_API_KEY)

// List of major corporations/companies to track
const MAJOR_COMPANIES = [
  'GOOGLE', 'ALPHABET', 'MICROSOFT', 'APPLE', 'AMAZON', 'META', 'FACEBOOK',
  'WALMART', 'EXXON', 'CHEVRON', 'BERKSHIRE', 'JOHNSON & JOHNSON', 'UNITEDHEALTH',
  'JPMORGAN', 'VISA', 'PROCTER & GAMBLE', 'MASTERCARD', 'BANK OF AMERICA', 'HOME DEPOT',
  'PFIZER', 'ABBVIE', 'COCA-COLA', 'PEPSICO', 'NIKE', 'DISNEY', 'NETFLIX',
  'BOEING', 'LOCKHEED', 'RAYTHEON', 'NORTHROP', 'GENERAL DYNAMICS',
  'GOLDMAN SACHS', 'MORGAN STANLEY', 'CITIGROUP', 'WELLS FARGO', 'BLACKROCK',
  'AT&T', 'VERIZON', 'COMCAST', 'T-MOBILE', 'CHARTER',
  'INTEL', 'NVIDIA', 'AMD', 'CISCO', 'ORACLE', 'IBM', 'SALESFORCE',
  'TESLA', 'FORD', 'GENERAL MOTORS', 'TOYOTA', 'HONDA',
  'MCDONALDS', 'STARBUCKS', 'CHIPOTLE',
  'CVS', 'WALGREENS', 'CIGNA', 'ANTHEM', 'HUMANA', 'AETNA',
  'SHELL', 'BP', 'CONOCOPHILLIPS', 'MARATHON', 'VALERO',
  'CATERPILLAR', '3M', 'HONEYWELL', 'UNION PACIFIC', 'UPS', 'FEDEX',
  'DELOITTE', 'KPMG', 'PWC', 'PRICEWATERHOUSE', 'ERNST & YOUNG', 'EY',
  'KOCH', 'BLACKSTONE', 'CARLYLE', 'KKR'
]

// Create FEC API client
const fecApi = axios.create({
  baseURL: FEC_BASE_URL,
  params: {
    api_key: FEC_API_KEY
  }
})

// Add request interceptor for logging
fecApi.interceptors.request.use(
  (config) => {
    console.log(`[FEC API] Request: ${config.method?.toUpperCase()} ${config.url}`)
    return config
  },
  (error) => {
    console.error('[FEC API] Request Error:', error)
    return Promise.reject(error)
  }
)

// Add response interceptor for logging
fecApi.interceptors.response.use(
  (response) => {
    console.log(`[FEC API] Response: ${response.status} from ${response.config.url}`)
    return response
  },
  (error) => {
    console.error('[FEC API] Response Error:', error.response?.status, error.response?.data || error.message)
    return Promise.reject(error)
  }
)

// Helper to normalize names for searching
const normalizeNameForSearch = (name) => {
  if (!name) return ''

  // Remove titles, suffixes, etc.
  let normalized = name
    .replace(/^(Rep\.|Sen\.|Representative|Senator)\s*/i, '')
    .replace(/\s+(Jr\.|Sr\.|III|II|IV)$/i, '')
    .trim()

  // If name is "LastName, FirstName" format, convert to "FirstName LastName"
  if (normalized.includes(',')) {
    const parts = normalized.split(',').map(p => p.trim())
    if (parts.length === 2) {
      normalized = `${parts[1]} ${parts[0]}`
    }
  }

  return normalized
}

// Extract last name for more reliable searching
const getLastName = (name) => {
  const normalized = normalizeNameForSearch(name)
  const parts = normalized.split(' ')
  return parts[parts.length - 1]
}

// Get candidate ID from FEC by name — tries multiple name formats for reliable matching
export const searchCandidateByName = async (name, state = '') => {
  try {
    const searchName = normalizeNameForSearch(name)
    const lastName = getLastName(name)
    // Extract first name from normalized "FirstName LastName"
    const parts = searchName.split(' ')
    const firstName = parts.length > 1 ? parts[0] : ''

    console.log(`[Donations API] Searching FEC for candidate: "${searchName}" (first: ${firstName}, last: ${lastName})`)

    // Build search variants in order of specificity
    const searchVariants = [
      searchName,                               // "John Smith"
      `${lastName}, ${firstName}`,              // "Smith, John" (FEC format)
      `${lastName} ${firstName}`,               // "Smith John"
      lastName                                   // "Smith" (broadest)
    ].filter(Boolean)

    let candidates = []

    for (const variant of searchVariants) {
      if (candidates.length > 0) break

      console.log(`[Donations API] Trying search variant: "${variant}"`)
      const response = await fecApi.get('/candidates/search/', {
        params: {
          q: variant,
          per_page: 20,
          is_active_candidate: true
        }
      })

      candidates = response.data.results || []
      console.log(`[Donations API] Variant "${variant}" found ${candidates.length} candidates`)
    }

    // Filter by state if provided
    if (state && candidates.length > 0) {
      const stateFiltered = candidates.filter(c => c.state === state)
      if (stateFiltered.length > 0) {
        console.log(`[Donations API] Filtered to ${stateFiltered.length} candidates in ${state}`)
        return stateFiltered
      }
    }

    return candidates
  } catch (error) {
    console.error('[Donations API] Error searching candidates:', error.response?.data || error.message)
    return []
  }
}

// Get top contributors/donors for a candidate
export const getCandidateDonors = async (candidateId) => {
  try {
    console.log(`[Donations API] Fetching donors for candidate ID: ${candidateId}`)

    // Get committee information for the candidate
    const committeeResponse = await fecApi.get('/candidate/' + candidateId + '/committees/', {
      params: {
        per_page: 5
      }
    })

    const committees = committeeResponse.data.results || []
    console.log(`[Donations API] Found ${committees.length} committees`)

    if (committees.length === 0) {
      return { donors: [], totalRaised: 0, committees: [] }
    }

    // Get the main committee
    const mainCommittee = committees[0]
    const committeeId = mainCommittee.committee_id

    // Get top donors/contributions
    const donorsResponse = await fecApi.get('/schedules/schedule_a/', {
      params: {
        committee_id: committeeId,
        per_page: 20,
        sort: '-contribution_receipt_amount',
        is_individual: true
      }
    })

    const contributions = donorsResponse.data.results || []
    console.log(`[Donations API] Found ${contributions.length} individual contributions`)

    // Check if employer is a major company
    const isMajorCompany = (employer) => {
      if (!employer) return false
      const upperEmployer = employer.toUpperCase()
      return MAJOR_COMPANIES.some(company => upperEmployer.includes(company))
    }

    // Aggregate by donor name and track corporate connections
    const donorMap = {}
    const corporateDonors = []

    contributions.forEach(contrib => {
      const name = contrib.contributor_name || 'Unknown'
      const employer = contrib.contributor_employer || ''

      if (!donorMap[name]) {
        donorMap[name] = {
          name: name,
          occupation: contrib.contributor_occupation || '',
          employer: employer,
          city: contrib.contributor_city || '',
          state: contrib.contributor_state || '',
          totalAmount: 0,
          contributionCount: 0,
          isCorporate: isMajorCompany(employer)
        }
      }
      donorMap[name].totalAmount += contrib.contribution_receipt_amount || 0
      donorMap[name].contributionCount += 1

      // Track corporate donors separately
      if (isMajorCompany(employer)) {
        const existingCorp = corporateDonors.find(c => c.company === employer.toUpperCase())
        if (existingCorp) {
          existingCorp.totalAmount += contrib.contribution_receipt_amount || 0
          existingCorp.donorCount += 1
        } else {
          corporateDonors.push({
            company: employer.toUpperCase(),
            totalAmount: contrib.contribution_receipt_amount || 0,
            donorCount: 1
          })
        }
      }
    })

    const donors = Object.values(donorMap)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 15)

    // Sort corporate donors by total amount
    corporateDonors.sort((a, b) => b.totalAmount - a.totalAmount)

    console.log(`[Donations API] Aggregated to ${donors.length} unique donors`)
    console.log(`[Donations API] Found ${corporateDonors.length} major corporate connections`)

    return {
      donors,
      corporateDonors,
      corporateCount: corporateDonors.length,
      totalRaised: mainCommittee.receipts || 0,
      committees: committees.map(c => ({
        id: c.committee_id,
        name: c.name,
        receipts: c.receipts,
        disbursements: c.disbursements
      }))
    }
  } catch (error) {
    console.error('[Donations API] Error fetching donors:', error.message)
    return { donors: [], totalRaised: 0, committees: [] }
  }
}

// Get donations summary for a politician by their name
export const getDonationsByPoliticianName = async (politicianName, state = '') => {
  try {
    console.log(`[Donations API] Getting donations for: ${politicianName}, state: ${state}`)

    // Search for the candidate, passing state for filtering
    const candidates = await searchCandidateByName(politicianName, state)

    if (candidates.length === 0) {
      console.log(`[Donations API] No FEC candidate found for: ${politicianName}`)
      return null
    }

    // Find best match - prefer current/recent candidates
    let candidate = candidates[0]

    // If we have state, prefer that match
    if (state) {
      const stateMatch = candidates.find(c => c.state === state)
      if (stateMatch) {
        candidate = stateMatch
      }
    }

    // If multiple matches, prefer ones with recent election years
    if (candidates.length > 1) {
      const recentCandidates = candidates.filter(c =>
        c.election_years?.includes(2024) || c.election_years?.includes(2022) || c.election_years?.includes(2020)
      )
      if (recentCandidates.length > 0) {
        // If state specified, prefer state + recent
        const stateAndRecent = recentCandidates.find(c => c.state === state)
        if (stateAndRecent) {
          candidate = stateAndRecent
        } else if (!state) {
          candidate = recentCandidates[0]
        }
      }
    }

    console.log(`[Donations API] Using candidate: ${candidate.name} (${candidate.candidate_id}) - ${candidate.state}`)

    // Get donors for this candidate
    const donorData = await getCandidateDonors(candidate.candidate_id)

    return {
      candidate: {
        id: candidate.candidate_id,
        name: candidate.name,
        party: candidate.party_full,
        office: candidate.office_full,
        state: candidate.state,
        district: candidate.district,
        electionYears: candidate.election_years
      },
      ...donorData
    }
  } catch (error) {
    console.error('[Donations API] Error getting donations:', error.response?.data || error.message)
    return null
  }
}

// Get top industry/sector donors - placeholder for future OpenSecrets integration
export const getIndustryDonors = async (cid) => {
  // OpenSecrets API requires a key - not implemented
  console.log('[Donations API] Industry donors feature not yet implemented')
  return null
}

// Format currency for display
export const formatCurrency = (amount) => {
  if (!amount) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}
