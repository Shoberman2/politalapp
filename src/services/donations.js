import axios from 'axios'

// OpenFEC is public data, but programmatic requests require an API key.
const FEC_BASE_URL = 'https://api.open.fec.gov/v1'
const FEC_API_KEY = import.meta.env.VITE_FEC_API_KEY || 'DEMO_KEY'
const FEC_CACHE_VERSION = 'v2'

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

/** FEC cycles cover two calendar years and are named for the even year. */
export const getCurrentFecCycle = (date = new Date()) => {
  const year = date.getUTCFullYear()
  return year % 2 === 0 ? year : year + 1
}

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
      console.log(`[Donations API] Trying search variant: "${variant}"`)
      const response = await fecApi.get('/candidates/search/', {
        params: {
          q: variant,
          per_page: 20
        }
      })

      const variantCandidates = response.data.results || []
      console.log(`[Donations API] Variant "${variant}" found ${variantCandidates.length} candidates`)

      if (variantCandidates.length === 0) continue
      if (!state) return variantCandidates

      const stateFiltered = variantCandidates.filter(c => c.state === state)
      if (stateFiltered.length > 0) {
        console.log(`[Donations API] Filtered to ${stateFiltered.length} candidates in ${state}`)
        return stateFiltered
      }

      // Keep looking instead of ever attributing another state's candidate.
      candidates = variantCandidates
    }

    return state ? [] : candidates
  } catch (error) {
    console.error('[Donations API] Error searching candidates:', error.response?.data || error.message)
    return []
  }
}

const primaryCommitteeForCycle = (committees, cycle) => [...committees].sort((a, b) => {
  const score = (committee) => {
    let value = 0
    if (committee.designation === 'P') value += 100
    if (committee.cycles?.includes(cycle)) value += 50
    if (committee.designation === 'A') value += 10
    return value
  }
  return score(b) - score(a)
})[0]

const aggregateContributions = (contributions) => {
  const donorMap = {}
  const corporateDonors = []

  const isMajorCompany = (employer) => {
    if (!employer) return false
    const upperEmployer = employer.toUpperCase()
    return MAJOR_COMPANIES.some(company => upperEmployer.includes(company))
  }

  contributions.forEach(contrib => {
    const name = contrib.contributor_name || contrib.committee_name || 'Unknown'
    const employer = contrib.contributor_employer || ''
    const entityType = contrib.entity_type || 'IND'

    if (!donorMap[name]) {
      donorMap[name] = {
        name,
        occupation: contrib.contributor_occupation || '',
        employer,
        city: contrib.contributor_city || '',
        state: contrib.contributor_state || '',
        totalAmount: 0,
        contributionCount: 0,
        isCorporate: isMajorCompany(employer),
        entityType,
      }
    }
    donorMap[name].totalAmount += contrib.contribution_receipt_amount || 0
    donorMap[name].contributionCount += 1

    if (isMajorCompany(employer)) {
      const company = employer.toUpperCase()
      const existingCorp = corporateDonors.find(c => c.company === company)
      if (existingCorp) {
        existingCorp.totalAmount += contrib.contribution_receipt_amount || 0
        existingCorp.donorCount += 1
      } else {
        corporateDonors.push({
          company,
          totalAmount: contrib.contribution_receipt_amount || 0,
          donorCount: 1,
        })
      }
    }
  })

  return {
    donors: Object.values(donorMap)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 30),
    corporateDonors: corporateDonors.sort((a, b) => b.totalAmount - a.totalAmount),
  }
}

// Get current-cycle totals and top itemized receipts for a candidate.
export const getCandidateDonors = async (candidateId, cycle = getCurrentFecCycle()) => {
  try {
    console.log(`[Donations API] Fetching cycle ${cycle} finance data for candidate ID: ${candidateId}`)

    const [committeeResponse, totalsResponse] = await Promise.all([
      fecApi.get('/candidate/' + candidateId + '/committees/', {
        params: { cycle, per_page: 100 },
      }),
      fecApi.get('/candidate/' + candidateId + '/totals/', {
        params: { cycle, per_page: 1 },
      }),
    ])

    const committees = committeeResponse.data.results || []
    const totals = totalsResponse.data.results?.[0] || null
    console.log(`[Donations API] Found ${committees.length} committees`)

    if (committees.length === 0) {
      return {
        donors: [],
        totalRaised: totals?.receipts ?? null,
        totalSpent: totals?.disbursements ?? null,
        individualTotal: totals?.individual_contributions ?? null,
        pacTotal: totals?.other_political_committee_contributions ?? null,
        committees: [],
        cycle,
        coverageEndDate: totals?.coverage_end_date || null,
      }
    }

    const mainCommittee = primaryCommitteeForCycle(committees, cycle)
    const committeeId = mainCommittee.committee_id

    const receiptParams = {
      committee_id: committeeId,
      per_page: 100,
      sort: '-contribution_receipt_amount',
      two_year_transaction_period: cycle,
    }
    const [individualResponse, committeeDonorResponse] = await Promise.all([
      fecApi.get('/schedules/schedule_a/', {
        params: {
          ...receiptParams,
          // OpenFEC documents this filter as the non-earmarked individual
          // view to use when avoiding double-reported conduit transactions.
          is_individual: true,
        },
      }),
      fecApi.get('/schedules/schedule_a/', {
        params: {
          ...receiptParams,
          contributor_type: 'committee',
        },
      }),
    ])

    const contributions = [
      ...(individualResponse.data.results || []),
      ...(committeeDonorResponse.data.results || []),
    ]
    console.log(`[Donations API] Found ${contributions.length} current-cycle itemized receipts`)

    const { donors, corporateDonors } = aggregateContributions(contributions)

    console.log(`[Donations API] Aggregated to ${donors.length} unique donors`)
    console.log(`[Donations API] Found ${corporateDonors.length} major corporate connections`)

    return {
      donors,
      corporateDonors,
      corporateCount: corporateDonors.length,
      totalRaised: totals?.receipts ?? null,
      totalSpent: totals?.disbursements ?? null,
      cashOnHand: totals?.last_cash_on_hand_end_period ?? null,
      individualTotal: totals?.individual_contributions ?? null,
      pacTotal: totals?.other_political_committee_contributions ?? null,
      orgTotal: 0,
      cycle,
      coverageEndDate: totals?.coverage_end_date || null,
      committees: committees.map(c => ({
        id: c.committee_id,
        name: c.name,
        designation: c.designation,
      })),
    }
  } catch (error) {
    console.error('[Donations API] Error fetching donors:', error.message)
    return {
      donors: [],
      totalRaised: null,
      totalSpent: null,
      individualTotal: null,
      pacTotal: null,
      committees: [],
      cycle,
      dataUnavailable: true,
    }
  }
}

// localStorage cache with 24-hour TTL
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

function getCachedDonations(key) {
  try {
    const raw = localStorage.getItem(`fec_${key}`)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL_MS) {
      localStorage.removeItem(`fec_${key}`)
      return null
    }
    return data
  } catch { return null }
}

function setCachedDonations(key, data) {
  try {
    localStorage.setItem(`fec_${key}`, JSON.stringify({ data, ts: Date.now() }))
  } catch { /* localStorage full or unavailable */ }
}

// Get donations summary for a politician by their name
export const getDonationsByPoliticianName = async (politicianName, state = '') => {
  try {
    const activeCycle = getCurrentFecCycle()
    // Check cache first
    const cacheKey = `${FEC_CACHE_VERSION}_${activeCycle}_${politicianName}_${state}`.toLowerCase().replace(/\s+/g, '_')
    const cached = getCachedDonations(cacheKey)
    if (cached) {
      console.log(`[Donations API] Cache hit for: ${politicianName}`)
      return cached
    }

    console.log(`[Donations API] Getting donations for: ${politicianName}, state: ${state}`)

    // Search for the candidate, passing state for filtering
    const candidates = await searchCandidateByName(politicianName, state)

    if (candidates.length === 0) {
      console.log(`[Donations API] No FEC candidate found for: ${politicianName}`)
      return null
    }

    const candidate = [...candidates].sort((a, b) => {
      const score = (entry) => {
        const years = entry.election_years || []
        const latest = Math.max(0, ...years.filter(year => year <= activeCycle))
        return (entry.state === state ? 10_000 : 0)
          + (years.includes(activeCycle) ? 5_000 : 0)
          + latest
      }
      return score(b) - score(a)
    })[0]

    const eligibleCycles = (candidate.election_years || [])
      .filter(year => Number.isInteger(year) && year <= activeCycle)
      .sort((a, b) => b - a)
    const selectedCycle = candidate.election_years?.includes(activeCycle)
      ? activeCycle
      : eligibleCycles[0] || activeCycle

    console.log(`[Donations API] Using candidate: ${candidate.name} (${candidate.candidate_id}) - ${candidate.state}`)

    // Get donors for this candidate
    const donorData = await getCandidateDonors(candidate.candidate_id, selectedCycle)

    const result = {
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

    // Never turn a transient FEC failure into a 24-hour cached "$0" claim.
    if (!result.dataUnavailable) setCachedDonations(cacheKey, result)

    return result
  } catch (error) {
    console.error('[Donations API] Error getting donations:', error.response?.data || error.message)
    return null
  }
}

/**
 * Get money-votes correlation for a politician.
 * Matches industry sectors of donors against policy_area of bills they voted on.
 * Returns: [{industry, donationAmount, billsVotedOn, yeaPercent, policyAreas}]
 */
export const getMoneyVotesCorrelation = async (industryBreakdown, votes, bills) => {
  // Lazy import to avoid circular dependency
  const { INDUSTRY_TO_POLICY } = await import('../data/industryMap.js')

  if (!industryBreakdown || !votes || !bills) return []

  const correlations = []

  for (const sector of industryBreakdown) {
    if (['Retired', 'Self-Employed', 'Not Disclosed', 'Other'].includes(sector.industry)) continue

    const policyAreas = INDUSTRY_TO_POLICY[sector.industry]
    if (!policyAreas || policyAreas.length === 0) continue

    // Find bills matching this industry's policy areas
    const matchingBillIds = bills
      .filter(b => b.policy_area && policyAreas.includes(b.policy_area))
      .map(b => b.id || b.bill_id)

    if (matchingBillIds.length === 0) continue

    // Find votes on those bills
    const matchingVotes = votes.filter(v => {
      const billId = v.bill_id || v.bills?.id
      return billId && matchingBillIds.includes(billId)
    })

    if (matchingVotes.length === 0) continue

    const yeaVotes = matchingVotes.filter(v =>
      v.position === 'Yea' || v.position === 'Yes'
    ).length

    correlations.push({
      industry: sector.industry,
      donationAmount: sector.totalAmount,
      donorCount: sector.donorCount,
      billsVotedOn: matchingVotes.length,
      yeaCount: yeaVotes,
      nayCount: matchingVotes.length - yeaVotes,
      yeaPercent: Math.round((yeaVotes / matchingVotes.length) * 100),
      policyAreas,
    })
  }

  return correlations.sort((a, b) => b.donationAmount - a.donationAmount)
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
