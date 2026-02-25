import { useState, useEffect } from 'react'
import PoliticianCard from './PoliticianCard'
import SEO from './SEO'
import { getAllCurrentMembers } from '../services/congress'
import '../styles/AllPoliticians.css'

function AllPoliticians() {
  const [allMembers, setAllMembers] = useState([])
  const [filteredMembers, setFilteredMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [chamberFilter, setChamberFilter] = useState('all')
  const [partyFilter, setPartyFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState('all')

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        setLoading(true)
        console.log('[AllPoliticians] Starting to fetch all members...')
        const members = await getAllCurrentMembers()
        console.log(`[AllPoliticians] Successfully loaded ${members.length} members`)
        console.log('[AllPoliticians] Sample member:', members[0])
        setAllMembers(members)
        setFilteredMembers(members)
      } catch (err) {
        console.error('[AllPoliticians] Error loading politicians:', err)
        console.error('[AllPoliticians] Error status:', err.response?.status)
        console.error('[AllPoliticians] Error data:', err.response?.data)

        let errorMessage
        if (err.response?.status === 401 || err.response?.status === 403) {
          errorMessage = 'Congress.gov API key is invalid or expired. Get a free key at: https://api.congress.gov/sign-up/'
        } else if (err.response?.status === 429) {
          errorMessage = 'API rate limit exceeded. Please wait a moment and try again.'
        } else if (err.response?.status >= 500) {
          errorMessage = 'Congress.gov API server error. Please try again later.'
        } else if (err.code === 'NETWORK_ERROR' || err.message?.includes('Network')) {
          errorMessage = 'Network error. Please check your internet connection.'
        } else {
          errorMessage = `Failed to load politicians: ${err.message || 'Unknown error'}`
        }
        setError(errorMessage)
      } finally {
        setLoading(false)
      }
    }

    fetchMembers()
  }, [])

  useEffect(() => {
    let filtered = [...allMembers]

    if (searchTerm) {
      filtered = filtered.filter(member => {
        const name = member.name || `${member.firstName || member.first_name || ''} ${member.lastName || member.last_name || ''}`
        return name.toLowerCase().includes(searchTerm.toLowerCase())
      })
    }

    if (chamberFilter !== 'all') {
      filtered = filtered.filter(
        member => member.chamber?.toLowerCase() === chamberFilter
      )
    }

    if (partyFilter !== 'all') {
      filtered = filtered.filter(member => member.party === partyFilter)
    }

    if (stateFilter !== 'all') {
      filtered = filtered.filter(member => member.state === stateFilter)
    }

    // Sort alphabetically by last name
    filtered.sort((a, b) => {
      const nameA = a.name || ''
      const nameB = b.name || ''
      // Congress.gov returns names as "LastName, FirstName" so we can sort directly
      return nameA.localeCompare(nameB)
    })

    setFilteredMembers(filtered)
  }, [searchTerm, chamberFilter, partyFilter, stateFilter, allMembers])

  const uniqueStates = [...new Set(allMembers.map(m => m.state))].sort()

  if (loading) {
    return (
      <div className="all-politicians-loading">
        <div className="loading-spinner"></div>
        <p>Loading politicians...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="all-politicians-error">
        <div className="error-message">{error}</div>
        <p className="error-help">
          Need help? Check the API_GUIDE.md file in the project for setup instructions.
        </p>
      </div>
    )
  }

  return (
    <div className="all-politicians">
      <SEO
        title="All Members of Congress"
        description="Browse all 535 members of the U.S. Congress. Filter by chamber, party, and state. View voting records and profiles."
        path="/all"
      />
      <h2>All Politicians</h2>

      <div className="filters">
        <input
          type="text"
          placeholder="Search by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />

        <select
          value={chamberFilter}
          onChange={(e) => setChamberFilter(e.target.value)}
          className="filter-select"
        >
          <option value="all">All Chambers</option>
          <option value="house">House of Representatives (435 members)</option>
          <option value="senate">Senate (100 members)</option>
        </select>

        <select
          value={partyFilter}
          onChange={(e) => setPartyFilter(e.target.value)}
          className="filter-select"
        >
          <option value="all">All Parties</option>
          <option value="D">Democrat</option>
          <option value="R">Republican</option>
          <option value="I">Independent</option>
        </select>

        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="filter-select"
        >
          <option value="all">All States</option>
          {uniqueStates.map(state => (
            <option key={state} value={state}>{state}</option>
          ))}
        </select>
      </div>

      <div className="results-count">
        Showing {filteredMembers.length} of {allMembers.length} politicians
      </div>

      <div className="politicians-grid">
        {filteredMembers.map(member => (
          <PoliticianCard key={member.bioguideId || member.id} politician={member} />
        ))}
      </div>

      {filteredMembers.length === 0 && (
        <div className="no-results">
          No politicians found matching your criteria
        </div>
      )}
    </div>
  )
}

export default AllPoliticians
