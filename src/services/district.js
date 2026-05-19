import axios from 'axios'
import { normalizeMemberImageUrl } from '../utils/memberImage'

// Congress.gov API
const CONGRESS_API_KEY = import.meta.env.VITE_CONGRESS_API_KEY || 'TylrF1qkaHLXnqNUgeBSbclgONTIxEpDCAqMrvOs'
const CONGRESS_BASE_URL = 'https://api.congress.gov/v3'

// Census Geocoder API (for address -> congressional district lookup)
// Free, no API key, uses JSONP to bypass CORS restrictions
const CENSUS_GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/address'

const congressApi = axios.create({
  baseURL: CONGRESS_BASE_URL,
  params: {
    api_key: CONGRESS_API_KEY,
    format: 'json'
  }
})

// US States with their abbreviations
export const US_STATES = [
  { name: 'Alabama', abbr: 'AL' },
  { name: 'Alaska', abbr: 'AK' },
  { name: 'Arizona', abbr: 'AZ' },
  { name: 'Arkansas', abbr: 'AR' },
  { name: 'California', abbr: 'CA' },
  { name: 'Colorado', abbr: 'CO' },
  { name: 'Connecticut', abbr: 'CT' },
  { name: 'Delaware', abbr: 'DE' },
  { name: 'Florida', abbr: 'FL' },
  { name: 'Georgia', abbr: 'GA' },
  { name: 'Hawaii', abbr: 'HI' },
  { name: 'Idaho', abbr: 'ID' },
  { name: 'Illinois', abbr: 'IL' },
  { name: 'Indiana', abbr: 'IN' },
  { name: 'Iowa', abbr: 'IA' },
  { name: 'Kansas', abbr: 'KS' },
  { name: 'Kentucky', abbr: 'KY' },
  { name: 'Louisiana', abbr: 'LA' },
  { name: 'Maine', abbr: 'ME' },
  { name: 'Maryland', abbr: 'MD' },
  { name: 'Massachusetts', abbr: 'MA' },
  { name: 'Michigan', abbr: 'MI' },
  { name: 'Minnesota', abbr: 'MN' },
  { name: 'Mississippi', abbr: 'MS' },
  { name: 'Missouri', abbr: 'MO' },
  { name: 'Montana', abbr: 'MT' },
  { name: 'Nebraska', abbr: 'NE' },
  { name: 'Nevada', abbr: 'NV' },
  { name: 'New Hampshire', abbr: 'NH' },
  { name: 'New Jersey', abbr: 'NJ' },
  { name: 'New Mexico', abbr: 'NM' },
  { name: 'New York', abbr: 'NY' },
  { name: 'North Carolina', abbr: 'NC' },
  { name: 'North Dakota', abbr: 'ND' },
  { name: 'Ohio', abbr: 'OH' },
  { name: 'Oklahoma', abbr: 'OK' },
  { name: 'Oregon', abbr: 'OR' },
  { name: 'Pennsylvania', abbr: 'PA' },
  { name: 'Rhode Island', abbr: 'RI' },
  { name: 'South Carolina', abbr: 'SC' },
  { name: 'South Dakota', abbr: 'SD' },
  { name: 'Tennessee', abbr: 'TN' },
  { name: 'Texas', abbr: 'TX' },
  { name: 'Utah', abbr: 'UT' },
  { name: 'Vermont', abbr: 'VT' },
  { name: 'Virginia', abbr: 'VA' },
  { name: 'Washington', abbr: 'WA' },
  { name: 'West Virginia', abbr: 'WV' },
  { name: 'Wisconsin', abbr: 'WI' },
  { name: 'Wyoming', abbr: 'WY' }
]

// Get congressional district from address
// Uses zip code extraction and state lookup since Census API has CORS issues
export const getDistrictFromAddress = async (address) => {
  try {
    console.log('[District API] Looking up district for address:', address)

    // Extract zip code from address
    const zipMatch = address.match(/\b(\d{5})(-\d{4})?\b/)
    if (!zipMatch) {
      console.log('[District API] No zip code found in address')
      // Try to extract state abbreviation
      const stateMatch = address.match(/\b([A-Z]{2})\b/)
      if (stateMatch && US_STATES.find(s => s.abbr === stateMatch[1])) {
        return {
          state: stateMatch[1],
          district: null,
          needsDistrict: true
        }
      }
      return null
    }

    const zipCode = zipMatch[1]
    console.log('[District API] Found zip code:', zipCode)

    // Use Zippopotam.us API (free, CORS-enabled)
    const response = await axios.get(`https://api.zippopotam.us/us/${zipCode}`)

    if (response.data) {
      const place = response.data.places?.[0]
      const stateAbbr = place?.['state abbreviation']

      console.log('[District API] Zip lookup result:', { state: stateAbbr, city: place?.['place name'] })

      if (stateAbbr) {
        // We have the state, but need to determine district
        // For at-large states (1 district), we can auto-select
        const atLargeStates = ['AK', 'DE', 'MT', 'ND', 'SD', 'VT', 'WY']

        if (atLargeStates.includes(stateAbbr)) {
          return {
            state: stateAbbr,
            district: '0', // At-large
            fullAddress: address
          }
        }

        // For other states, we'll need the user to select district
        // But we can pre-fill the state
        return {
          state: stateAbbr,
          district: null,
          needsDistrict: true,
          city: place?.['place name']
        }
      }
    }

    return null
  } catch (error) {
    console.error('[District API] Error looking up district:', error)

    // Fallback: try to extract state from address text
    const addressUpper = address.toUpperCase()
    for (const state of US_STATES) {
      if (addressUpper.includes(state.name.toUpperCase()) || addressUpper.includes(` ${state.abbr} `)) {
        return {
          state: state.abbr,
          district: null,
          needsDistrict: true
        }
      }
    }

    return null
  }
}

// FIPS codes to state abbreviations
const fipsToState = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY'
}

// Get representatives by state and district using Congress.gov API
export const getRepresentativesByState = async (stateAbbr, district = null) => {
  try {
    console.log(`[District API] Fetching representatives for ${stateAbbr}${district ? ` district ${district}` : ''}`)

    // Fetch all members with pagination
    const allMembers = []
    let offset = 0
    const limit = 250

    while (true) {
      const response = await congressApi.get('/member', {
        params: {
          currentMember: true,
          limit,
          offset
        }
      })

      const members = response.data.members || []
      if (members.length === 0) break

      allMembers.push(...members)
      offset += members.length

      if (members.length < limit) break
    }

    console.log(`[District API] Total members from API: ${allMembers.length}`)

    // Filter by state
    let filtered = allMembers.filter(member => {
      const memberState = getMemberState(member)
      return memberState === stateAbbr
    })

    console.log(`[District API] Members in ${stateAbbr}: ${filtered.length}`)

    // Filter by district if specified (House members only)
    if (district !== null && district !== undefined && district !== '') {
      const districtNum = parseInt(district)
      filtered = filtered.filter(member => {
        const chamber = getMemberChamber(member)
        const memberDistrict = parseInt(getMemberDistrict(member) || 0)

        // Include if it's a House member with matching district
        if (chamber === 'house') {
          return memberDistrict === districtNum
        }
        return false
      })
      console.log(`[District API] House members in district ${districtNum}: ${filtered.length}`)
    }

    // Normalize the data
    return filtered.map(member => {
      const chamber = getMemberChamber(member)
      return normalizeMember(member, chamber || 'house')
    })
  } catch (error) {
    console.error('[District API] Error getting representatives:', error)
    throw error
  }
}

// Map state names to abbreviations
const stateNameToAbbr = {}
US_STATES.forEach(s => {
  stateNameToAbbr[s.name.toLowerCase()] = s.abbr
  stateNameToAbbr[s.abbr.toLowerCase()] = s.abbr
})

// Helper to normalize state to abbreviation
const normalizeState = (state) => {
  if (!state) return null
  const lower = state.toLowerCase().trim()
  // Check if it's already an abbreviation
  if (lower.length === 2) {
    return stateNameToAbbr[lower] || state.toUpperCase()
  }
  // Convert full name to abbreviation
  return stateNameToAbbr[lower] || null
}

// Helper to get current term from member - handles different API response structures
const getCurrentTerm = (member) => {
  // Try terms.item array structure
  if (member.terms?.item && Array.isArray(member.terms.item)) {
    return member.terms.item[member.terms.item.length - 1]
  }
  // Try terms as direct array
  if (Array.isArray(member.terms) && member.terms.length > 0) {
    return member.terms[member.terms.length - 1]
  }
  // Try currentTerm or latestTerm
  if (member.currentTerm) return member.currentTerm
  if (member.latestTerm) return member.latestTerm
  return null
}

// Helper to get member's state (normalized to abbreviation)
const getMemberState = (member) => {
  // Try direct state field first
  if (member.state) return normalizeState(member.state)
  // Try from current term
  const term = getCurrentTerm(member)
  if (term?.state) return normalizeState(term.state)
  if (term?.stateCode) return normalizeState(term.stateCode)
  return null
}

// Helper to get member's chamber
const getMemberChamber = (member) => {
  const term = getCurrentTerm(member)
  const chamber = term?.chamber?.toLowerCase() || member.chamber?.toLowerCase() || ''
  if (chamber.includes('senate')) return 'senate'
  if (chamber.includes('house') || chamber.includes('representative')) return 'house'
  return null
}

// Helper to get member's district
const getMemberDistrict = (member) => {
  const term = getCurrentTerm(member)
  return term?.district || member.district || null
}

// Shared cache for fetched members to avoid duplicate API calls
let _membersCachePromise = null
let _membersCacheTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

const fetchAllMembersWithCache = async () => {
  const now = Date.now()
  if (_membersCachePromise && (now - _membersCacheTime) < CACHE_TTL) {
    return _membersCachePromise
  }

  _membersCacheTime = now
  _membersCachePromise = (async () => {
    const allMembers = []
    let offset = 0
    const limit = 250

    while (true) {
      const response = await congressApi.get('/member', {
        params: {
          currentMember: true,
          limit,
          offset
        }
      })

      const members = response.data.members || []
      if (members.length === 0) break

      allMembers.push(...members)
      offset += members.length

      if (members.length < limit) break
    }

    console.log(`[District API] Cached ${allMembers.length} members`)
    return allMembers
  })()

  return _membersCachePromise
}

// Get House representative for a specific district
export const getHouseRepForDistrict = async (stateAbbr, district) => {
  try {
    console.log(`[District API] Fetching House rep for ${stateAbbr} district ${district}`)
    const allMembers = await fetchAllMembersWithCache()

    const districtNum = parseInt(district)
    const houseRep = allMembers.find(member => {
      const memberState = getMemberState(member)
      const chamber = getMemberChamber(member)
      const memberDistrict = parseInt(getMemberDistrict(member) || 0)
      return memberState === stateAbbr && chamber === 'house' && memberDistrict === districtNum
    })

    if (houseRep) {
      console.log(`[District API] Found House rep: ${houseRep.name}`)
      return normalizeMember(houseRep, 'house')
    }
    return null
  } catch (error) {
    console.error('[District API] Error getting House rep:', error)
    throw error
  }
}

// Get Senators for a state
export const getSenatorsForState = async (stateAbbr) => {
  try {
    console.log(`[District API] Fetching Senators for ${stateAbbr}`)
    const allMembers = await fetchAllMembersWithCache()

    const senators = allMembers.filter(member => {
      const memberState = getMemberState(member)
      const chamber = getMemberChamber(member)
      return memberState === stateAbbr && chamber === 'senate'
    })

    console.log(`[District API] Found ${senators.length} senators for ${stateAbbr}`)
    return senators.map(s => normalizeMember(s, 'senate'))
  } catch (error) {
    console.error('[District API] Error getting senators:', error)
    throw error
  }
}

// Get all representatives for a location (House + Senate)
export const getAllRepresentativesForLocation = async (stateAbbr, district = null) => {
  try {
    console.log(`[District API] Fetching ALL representatives for ${stateAbbr}${district ? ` district ${district}` : ''}`)

    const allMembers = await fetchAllMembersWithCache()

    // Filter by state
    const stateMembers = allMembers.filter(member => {
      const memberState = getMemberState(member)
      return memberState === stateAbbr
    })

    console.log(`[District API] Members in state ${stateAbbr}: ${stateMembers.length}`)

    const representatives = []

    // Find House representative for the district
    if (district !== null && district !== undefined && district !== '') {
      const districtNum = parseInt(district)
      const houseRep = stateMembers.find(member => {
        const chamber = getMemberChamber(member)
        const memberDistrict = parseInt(getMemberDistrict(member) || 0)
        return chamber === 'house' && memberDistrict === districtNum
      })
      if (houseRep) {
        console.log(`[District API] Found House rep: ${houseRep.name}`)
        representatives.push(normalizeMember(houseRep, 'house'))
      }
    }

    // Find both Senators for the state
    const senators = stateMembers.filter(member => {
      const chamber = getMemberChamber(member)
      return chamber === 'senate'
    })

    console.log(`[District API] Found ${senators.length} senators for ${stateAbbr}`)

    senators.forEach(senator => {
      representatives.push(normalizeMember(senator, 'senate'))
    })

    console.log(`[District API] Total representatives found: ${representatives.length}`)
    return representatives
  } catch (error) {
    console.error('[District API] Error getting all representatives:', error)
    throw error
  }
}

// Helper to normalize member data
const normalizeMember = (member, chamber) => {
  const term = getCurrentTerm(member)
  return {
    bioguideId: member.bioguideId,
    name: member.name,
    firstName: member.firstName || '',
    lastName: member.lastName || '',
    state: getMemberState(member),
    district: getMemberDistrict(member),
    party: member.partyName || term?.party,
    partyName: member.partyName || term?.party,
    chamber: chamber,
    imageUrl: normalizeMemberImageUrl(member.depiction?.imageUrl),
    url: member.url || `https://www.congress.gov/member/${member.bioguideId}`
  }
}

export const getDistrictsByState = async (stateAbbr) => {
  try {
    console.log(`[District API] Fetching districts for state: ${stateAbbr}`)

    // Fetch all members with pagination
    const allMembers = []
    let offset = 0
    const limit = 250

    while (true) {
      const response = await congressApi.get('/member', {
        params: {
          currentMember: true,
          limit,
          offset
        }
      })

      const members = response.data.members || []
      if (members.length === 0) break

      allMembers.push(...members)
      offset += members.length

      if (members.length < limit) break
    }

    console.log(`[District API] Total members for district lookup: ${allMembers.length}`)

    // Filter House members by state
    const stateHouseMembers = allMembers.filter(member => {
      const memberState = getMemberState(member)
      const chamber = getMemberChamber(member)
      return memberState === stateAbbr && chamber === 'house'
    })

    console.log(`[District API] House members in ${stateAbbr}: ${stateHouseMembers.length}`)

    const districts = [...new Set(stateHouseMembers.map(m => getMemberDistrict(m)))]
      .filter(d => d !== null && d !== undefined)
      .map(d => String(d))
      .sort((a, b) => parseInt(a) - parseInt(b))

    console.log(`[District API] Districts found for ${stateAbbr}:`, districts)

    // Handle at-large states (single district represented as "0" or "00")
    if (districts.length === 0) {
      // Check if this state has any house members at all - might be at-large
      const atLargeStates = ['AK', 'DE', 'MT', 'ND', 'SD', 'VT', 'WY']
      if (atLargeStates.includes(stateAbbr)) {
        console.log(`[District API] ${stateAbbr} is at-large state`)
        return ['0']
      }
    }

    return districts
  } catch (error) {
    console.error('[District API] Error getting districts:', error)
    return []
  }
}

// JSONP helper for Census Geocoder (bypasses CORS restrictions)
const jsonpFetch = (url) => {
  return new Promise((resolve, reject) => {
    const callbackName = `__censusCallback_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Census Geocoder request timed out'))
    }, 15000)

    const cleanup = () => {
      clearTimeout(timeout)
      delete window[callbackName]
      if (script.parentNode) script.parentNode.removeChild(script)
    }

    window[callbackName] = (data) => {
      cleanup()
      resolve(data)
    }

    const script = document.createElement('script')
    script.src = `${url}&callback=${callbackName}`
    script.onerror = () => {
      cleanup()
      reject(new Error('Census Geocoder request failed'))
    }
    document.head.appendChild(script)
  })
}

// Get congressional district from address using the US Census Geocoder
// Free, no API key required, uses JSONP to work from the browser
export const getCongressionalDistrict = async (street, city, state, zip) => {
  try {
    console.log('[District API] Looking up congressional district via Census Geocoder')

    const params = new URLSearchParams({
      street,
      city,
      state,
      zip,
      benchmark: 'Public_AR_Current',
      vintage: 'Current_Current',
      format: 'jsonp'
    })

    const url = `${CENSUS_GEOCODER_URL}?${params}`
    const data = await jsonpFetch(url)

    const match = data?.result?.addressMatches?.[0]
    if (!match) {
      console.log('[District API] Census Geocoder: no address match found')
      return null
    }

    console.log('[District API] Census Geocoder matched address:', match.matchedAddress)

    // Find congressional district in geographies
    // Key looks like "119th Congressional Districts"
    const geographies = match.geographies || {}
    const cdKey = Object.keys(geographies).find(k => k.includes('Congressional District'))
    const cd = geographies[cdKey]?.[0]

    if (!cd) {
      console.log('[District API] Census Geocoder: no congressional district in response')
      return null
    }

    // BASENAME is the district number (e.g. "4")
    // At-large districts are "00" in Census data
    let district = cd.BASENAME
    if (district === '00') district = '0'

    // Extract state FIPS from GEOID (first 2 digits) as fallback
    const stateFips = cd.GEOID?.substring(0, 2)
    const stateAbbr = fipsToState[stateFips] || state

    console.log(`[District API] Census Geocoder result: ${stateAbbr} district ${district}`)

    return {
      district,
      state: stateAbbr
    }
  } catch (error) {
    console.error('[District API] Census Geocoder error:', error.message)
    return null
  }
}

export const saveLocation = (state, district) => {
  localStorage.setItem('userState', state)
  if (district) {
    localStorage.setItem('userDistrict', district)
  }
}

export const getSavedLocation = () => {
  return {
    state: localStorage.getItem('userState'),
    district: localStorage.getItem('userDistrict')
  }
}

export const clearSavedLocation = () => {
  localStorage.removeItem('userState')
  localStorage.removeItem('userDistrict')
}

// Search for US addresses using Nominatim (OpenStreetMap) API
// Free, no API key required, CORS-enabled
export const searchAddress = async (query) => {
  try {
    const params = new URLSearchParams({
      q: query,
      countrycodes: 'us',
      format: 'json',
      addressdetails: '1',
      limit: '5'
    })

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      { headers: { 'Accept': 'application/json' } }
    )

    if (!response.ok) return []

    const results = await response.json()

    return results
      .filter(r => r.address)
      .map(r => {
        const a = r.address
        const road = [a.house_number, a.road].filter(Boolean).join(' ')
        const city = a.city || a.town || a.village || a.hamlet || ''
        const stateName = a.state || ''
        const stateAbbr = normalizeState(stateName) || ''
        const zip = a.postcode || ''

        const parts = [road, city, stateAbbr, zip].filter(Boolean)

        return {
          display: parts.join(', '),
          street: road,
          city,
          state: stateAbbr,
          zip
        }
      })
      .filter(r => r.street && r.state)
  } catch (error) {
    console.error('[District API] Nominatim search error:', error)
    return []
  }
}
