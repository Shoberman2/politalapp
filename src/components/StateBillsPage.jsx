import { useState, useEffect } from 'react'
import StateBillCard from './StateBillCard'
import { US_STATES, getSavedLocation } from '../services/district'
import {
  fetchStateBills,
  aiSearchStateBills,
  rankBillsByRelevance
} from '../services/stateBills'
import '../styles/StateBillsPage.css'

function StateBillsPage() {
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedState, setSelectedState] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('impact')
  const [aiMessage, setAiMessage] = useState(null)
  const [isAiSearch, setIsAiSearch] = useState(false)

  // Auto-detect user's state on mount
  useEffect(() => {
    const saved = getSavedLocation()
    if (saved?.state) {
      setSelectedState(saved.state)
    }
  }, [])

  // Load bills when state changes
  useEffect(() => {
    if (selectedState) {
      loadBills()
    }
  }, [selectedState])

  const loadBills = async () => {
    setLoading(true)
    setError(null)
    setAiMessage(null)
    setIsAiSearch(false)

    try {
      let stateBills = await fetchStateBills(selectedState)

      // Try AI relevance ranking
      stateBills = await rankBillsByRelevance(selectedState, stateBills)

      setBills(stateBills)
    } catch (err) {
      console.error('[StateBillsPage] Error loading bills:', err)
      if (err.message?.includes('API key not configured')) {
        setError('LegiScan API key not configured. Add VITE_LEGISCAN_API_KEY to your .env file.')
      } else {
        setError(`Failed to load state bills: ${err.message || 'Unknown error'}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!searchQuery.trim() || !selectedState) return

    setSearching(true)
    setError(null)

    try {
      const result = await aiSearchStateBills(selectedState, searchQuery.trim())
      setBills(result.bills)
      setAiMessage(result.aiMessage)
      setIsAiSearch(result.isAI)
    } catch (err) {
      console.error('[StateBillsPage] Search error:', err)
      setError(`Search failed: ${err.message || 'Unknown error'}`)
    } finally {
      setSearching(false)
    }
  }

  const handleClearSearch = () => {
    setSearchQuery('')
    setAiMessage(null)
    setIsAiSearch(false)
    if (selectedState) loadBills()
  }

  // Filter and sort bills
  const displayBills = bills
    .filter(bill => {
      if (statusFilter === 'all') return true
      return bill.status === statusFilter
    })
    .sort((a, b) => {
      if (sortBy === 'impact') {
        return (b.aiScore || 0) - (a.aiScore || 0)
      }
      // Sort by recent activity
      if (!a.last_action_date) return 1
      if (!b.last_action_date) return -1
      return b.last_action_date.localeCompare(a.last_action_date)
    })

  if (!selectedState) {
    return (
      <div className="state-bills-page">
        <div className="state-bills-header">
          <h1>State Bills</h1>
          <p className="state-bills-subtitle">AI-powered state legislation tracker</p>
        </div>
        <div className="state-select-prompt">
          <p>Select a state to browse its current legislative session</p>
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="state-select-large"
          >
            <option value="">Choose a state...</option>
            {US_STATES.map(s => (
              <option key={s.abbr} value={s.abbr}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>
    )
  }

  return (
    <div className="state-bills-page">
      <div className="state-bills-header">
        <h1>State Bills</h1>
        <p className="state-bills-subtitle">AI-powered state legislation tracker</p>
      </div>

      <div className="state-bills-controls">
        <select
          value={selectedState}
          onChange={(e) => setSelectedState(e.target.value)}
          className="state-bills-filter-select"
        >
          <option value="">Choose a state...</option>
          {US_STATES.map(s => (
            <option key={s.abbr} value={s.abbr}>{s.name}</option>
          ))}
        </select>

        <form className="ai-search-form" onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="Ask about legislation... (e.g., &quot;education funding bills&quot;)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ai-search-input"
            disabled={searching}
          />
          <button
            type="submit"
            className="ai-search-button"
            disabled={searching || !searchQuery.trim()}
          >
            {searching ? 'Searching...' : 'AI Search'}
          </button>
        </form>
      </div>

      {aiMessage && (
        <div className="ai-message-banner">
          <span className="ai-message-text">{aiMessage}</span>
          <button className="ai-message-clear" onClick={handleClearSearch}>
            Clear
          </button>
        </div>
      )}

      <div className="state-bills-filters">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="state-bills-filter-select"
        >
          <option value="all">All Statuses</option>
          <option value="Introduced">Introduced</option>
          <option value="Active">Active</option>
          <option value="Passed">Passed</option>
          <option value="Failed">Failed</option>
          <option value="Vetoed">Vetoed</option>
          <option value="Enrolled">Enrolled</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="state-bills-filter-select"
        >
          <option value="impact">Sort by AI Impact</option>
          <option value="recent">Sort by Recent Activity</option>
        </select>
      </div>

      {loading ? (
        <div className="state-bills-loading">
          <div className="loading-spinner"></div>
          <p>Loading {US_STATES.find(s => s.abbr === selectedState)?.name} bills...</p>
        </div>
      ) : error ? (
        <div className="state-bills-error">
          <div className="error-message">{error}</div>
          <button className="retry-button" onClick={loadBills}>
            Try Again
          </button>
        </div>
      ) : (
        <>
          <div className="state-bills-results-info">
            <span className="results-count">
              Showing {displayBills.length} bill{displayBills.length !== 1 ? 's' : ''}
              {isAiSearch ? ' (AI ranked)' : ''}
            </span>
          </div>

          {displayBills.length > 0 ? (
            <div className="state-bills-grid">
              {displayBills.map(bill => (
                <StateBillCard key={bill.bill_id} bill={bill} />
              ))}
            </div>
          ) : (
            <div className="no-state-bills">
              <p>No bills found matching your criteria</p>
              <button className="reset-filters-button" onClick={() => {
                setStatusFilter('all')
                handleClearSearch()
              }}>
                Reset Filters
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default StateBillsPage
