import { useState, useEffect } from 'react'
import BillCard from './BillCard'
import { searchBills } from '../services/congress'
import '../styles/BillsPage.css'

function BillsPage() {
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [congressFilter, setCongressFilter] = useState('118')
  const [billTypeFilter, setBillTypeFilter] = useState('all')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const LIMIT = 20

  useEffect(() => {
    fetchBills(true)
  }, [congressFilter, billTypeFilter])

  const fetchBills = async (reset = false) => {
    try {
      if (reset) {
        setLoading(true)
        setOffset(0)
      } else {
        setLoadingMore(true)
      }

      const currentOffset = reset ? 0 : offset
      console.log(`[BillsPage] Fetching bills - Congress: ${congressFilter}, Type: ${billTypeFilter}, Offset: ${currentOffset}`)

      const result = await searchBills({
        congress: congressFilter !== 'all' ? parseInt(congressFilter) : null,
        billType: billTypeFilter !== 'all' ? billTypeFilter : null,
        limit: LIMIT,
        offset: currentOffset
      })

      const newBills = result.bills || []
      console.log(`[BillsPage] Received ${newBills.length} bills`)

      if (reset) {
        setBills(newBills)
      } else {
        setBills(prev => [...prev, ...newBills])
      }

      setHasMore(newBills.length === LIMIT)
      setOffset(currentOffset + newBills.length)
      setError(null)
    } catch (err) {
      console.error('[BillsPage] Error loading bills:', err)
      console.error('[BillsPage] Error status:', err.response?.status)
      console.error('[BillsPage] Error details:', err.response?.data)

      let errorMessage
      if (err.response?.status === 401 || err.response?.status === 403) {
        errorMessage = 'API key not configured or invalid. Please check the .env file.'
      } else if (err.response?.status === 429) {
        errorMessage = 'API rate limit reached. Please wait and try again.'
      } else {
        errorMessage = `Failed to load bills: ${err.message || 'Unknown error'}`
      }
      setError(errorMessage)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const handleSearch = (e) => {
    setSearchTerm(e.target.value)
  }

  const filteredBills = bills.filter(bill => {
    if (!searchTerm) return true
    const query = searchTerm.toLowerCase()
    return (
      bill.title?.toLowerCase().includes(query) ||
      bill.number?.toString().includes(query) ||
      `${bill.type}${bill.number}`.toLowerCase().includes(query)
    )
  })

  const handleLoadMore = () => {
    fetchBills(false)
  }

  if (loading) {
    return (
      <div className="bills-page-loading">
        <div className="loading-spinner"></div>
        <p>Loading bills...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bills-page-error">
        <div className="error-message">{error}</div>
        <button className="retry-button" onClick={() => fetchBills(true)}>
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="bills-page">
      <div className="bills-header">
        <h1>Congressional Bills</h1>
        <p className="bills-subtitle">Browse and search legislation from the U.S. Congress</p>
      </div>

      <div className="bills-filters">
        <input
          type="text"
          placeholder="Search bills by title or number..."
          value={searchTerm}
          onChange={handleSearch}
          className="bills-search-input"
        />

        <select
          value={congressFilter}
          onChange={(e) => setCongressFilter(e.target.value)}
          className="bills-filter-select"
        >
          <option value="118">118th Congress (2023-2024)</option>
          <option value="117">117th Congress (2021-2022)</option>
          <option value="116">116th Congress (2019-2020)</option>
          <option value="all">All Congresses</option>
        </select>

        <select
          value={billTypeFilter}
          onChange={(e) => setBillTypeFilter(e.target.value)}
          className="bills-filter-select"
        >
          <option value="all">All Bill Types</option>
          <option value="hr">House Bills (H.R.)</option>
          <option value="s">Senate Bills (S.)</option>
          <option value="hjres">House Joint Resolutions</option>
          <option value="sjres">Senate Joint Resolutions</option>
          <option value="hconres">House Concurrent Resolutions</option>
          <option value="sconres">Senate Concurrent Resolutions</option>
          <option value="hres">House Resolutions</option>
          <option value="sres">Senate Resolutions</option>
        </select>
      </div>

      <div className="bills-results-info">
        <span className="results-count">
          Showing {filteredBills.length} bill{filteredBills.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filteredBills.length > 0 ? (
        <>
          <div className="bills-grid">
            {filteredBills.map((bill, index) => (
              <BillCard
                key={`${bill.congress}-${bill.type}-${bill.number}-${index}`}
                bill={bill}
              />
            ))}
          </div>

          {hasMore && !searchTerm && (
            <div className="load-more-container">
              <button
                className="load-more-button"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <span className="loading-spinner-small"></span>
                    Loading...
                  </>
                ) : (
                  'Load More Bills'
                )}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="no-bills">
          <p>No bills found matching your criteria</p>
          <button className="reset-filters-button" onClick={() => {
            setSearchTerm('')
            setCongressFilter('118')
            setBillTypeFilter('all')
          }}>
            Reset Filters
          </button>
        </div>
      )}
    </div>
  )
}

export default BillsPage
