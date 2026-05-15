import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import SEO from './SEO'
import { searchBills, getTrendingBills } from '../services/congress'
import { getBillDisplayTitle, formatBillId } from '../utils/billTitle'
import '../styles/BillsPage.css'

function BillsPage() {
  const navigate = useNavigate()
  const [bills, setBills] = useState([])
  const [trendingBills, setTrendingBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [congressFilter, setCongressFilter] = useState('119')
  const [billTypeFilter, setBillTypeFilter] = useState('all')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    getTrendingBills().then(setTrendingBills).catch(() => {})
  }, [])

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

      const result = await searchBills({
        congress: congressFilter !== 'all' ? parseInt(congressFilter) : null,
        billType: billTypeFilter !== 'all' ? billTypeFilter : null,
        limit: LIMIT,
        offset: currentOffset
      })

      const newBills = result.bills || []

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

  const filteredBills = bills.filter(bill => {
    if (!searchTerm) return true
    const query = searchTerm.toLowerCase()
    return (
      bill.title?.toLowerCase().includes(query) ||
      bill.number?.toString().includes(query) ||
      `${bill.type}${bill.number}`.toLowerCase().includes(query)
    )
  })

  const handleLoadMore = () => fetchBills(false)

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })

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
        <button className="retry-button" onClick={() => fetchBills(true)}>Try Again</button>
      </div>
    )
  }

  return (
    <div className="bills-page">
      <SEO
        title="Congressional Bill Tracker"
        description={
          trendingBills.length > 0
            ? `Trending now: ${trendingBills.slice(0, 3).map(b => b.headline).join(', ')}. Browse and search legislation from the U.S. Congress.`
            : 'Browse and search legislation from the U.S. Congress. Track bills, read AI-powered explanations, and follow the legislative process.'
        }
        path="/bills"
        schema={trendingBills.length > 0 ? {
          '@type': 'ItemList',
          name: 'Notable Congressional Bills',
          itemListElement: trendingBills.map((b, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            item: {
              '@type': 'Legislation',
              name: b.headline || b.title,
              description: b.whyItMatters,
              legislationIdentifier: `${b.type?.toUpperCase()} ${b.number}`,
              dateModified: b.latestAction?.actionDate
            }
          }))
        } : undefined}
      />

      <header className="bills-masthead">
        <div className="masthead-kicker">Congressional Index · {congressFilter === 'all' ? 'All Congresses' : `${congressFilter}th Congress`}</div>
        <h1 className="masthead-title">The <em>Bills</em> Desk</h1>
        <p className="masthead-deck">Every bill introduced in the U.S. House and Senate, searchable and explained in plain English. Updated daily from Congress.gov.</p>
        <div className="masthead-date-row">
          <span>{today}</span>
          <span>{filteredBills.length.toLocaleString()} bills shown</span>
        </div>
      </header>

      <div className="bills-search-shell">
        <div className="bills-search-input-wrap">
          <svg className="bills-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by title, bill number (H.R. 1234), or keyword"
            className="bills-search-field"
          />
        </div>
        <select
          value={congressFilter}
          onChange={(e) => setCongressFilter(e.target.value)}
          className="bills-filter-pill"
        >
          <option value="119">119th Congress</option>
          <option value="118">118th Congress</option>
          <option value="117">117th Congress</option>
          <option value="116">116th Congress</option>
          <option value="all">All Congresses</option>
        </select>
        <select
          value={billTypeFilter}
          onChange={(e) => setBillTypeFilter(e.target.value)}
          className="bills-filter-pill"
        >
          <option value="all">All bill types</option>
          <option value="hr">House Bills (H.R.)</option>
          <option value="s">Senate Bills (S.)</option>
          <option value="hjres">House Joint Resolutions</option>
          <option value="sjres">Senate Joint Resolutions</option>
          <option value="hres">House Resolutions</option>
          <option value="sres">Senate Resolutions</option>
        </select>
      </div>

      {trendingBills.length > 0 && (
        <div className="bills-trending-strip">
          <div className="trending-label">↑ Trending today</div>
          <div className="trending-pills">
            {trendingBills.slice(0, 6).map((b, i) => (
              <button
                key={`${b.congress}-${b.type}-${b.number}-${i}`}
                className="trending-pill"
                onClick={() => navigate(`/bill/${b.congress}/${b.type?.toLowerCase()}/${b.number}`)}
              >
                <span className="trending-num">{formatBillId(b)}</span>
                {b.headline || getBillDisplayTitle(b)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bills-results-bar">
        <div className="bills-count">
          Showing <strong>{filteredBills.length.toLocaleString()}</strong> bill{filteredBills.length !== 1 ? 's' : ''}
          {searchTerm && <span className="bills-count-filter"> matching "{searchTerm}"</span>}
        </div>
      </div>

      {filteredBills.length > 0 ? (
        <>
          <div className="bills-editorial-list">
            {filteredBills.map((bill, index) => (
              <BillRow
                key={`${bill.congress}-${bill.type}-${bill.number}-${index}`}
                bill={bill}
                onClick={() => navigate(`/bill/${bill.congress}/${bill.type?.toLowerCase()}/${bill.number}`)}
              />
            ))}
          </div>

          {hasMore && !searchTerm && (
            <div className="bills-load-more">
              <button onClick={handleLoadMore} disabled={loadingMore} className="bills-load-button">
                {loadingMore ? (
                  <><span className="loading-spinner-small"></span> Loading...</>
                ) : (
                  'Load more bills'
                )}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="bills-empty">
          <p>No bills found matching your criteria</p>
          <button className="bills-reset-button" onClick={() => {
            setSearchTerm('')
            setCongressFilter('119')
            setBillTypeFilter('all')
          }}>Reset filters</button>
        </div>
      )}
    </div>
  )
}

function getStatusInfo(bill) {
  const text = (bill.latestAction?.text || '').toLowerCase()
  if (text.includes('became public law') || text.includes('signed by president')) {
    return { label: 'Became Law', cls: 'status-enacted' }
  }
  if (text.includes('passed house') && text.includes('passed senate')) {
    return { label: 'Passed Both Chambers', cls: 'status-passed-both' }
  }
  if (text.includes('passed house')) return { label: 'Passed House', cls: 'status-passed' }
  if (text.includes('passed senate')) return { label: 'Passed Senate', cls: 'status-passed' }
  if (text.includes('committee')) return { label: 'In Committee', cls: 'status-committee' }
  if (text.includes('introduced')) return { label: 'Introduced', cls: 'status-introduced' }
  return { label: 'In Progress', cls: 'status-progress' }
}

function partyClass(party) {
  if (!party) return ''
  const p = party.toLowerCase()
  if (p.startsWith('d')) return 'party-tag-dem'
  if (p.startsWith('r')) return 'party-tag-rep'
  return 'party-tag-ind'
}

function partyAbbrev(party) {
  if (!party) return ''
  const p = party.toLowerCase()
  if (p.startsWith('d')) return 'D'
  if (p.startsWith('r')) return 'R'
  return 'I'
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function BillRow({ bill, onClick }) {
  const status = getStatusInfo(bill)
  const sponsor = bill.sponsors?.[0] || bill.sponsor
  const sponsorName = sponsor
    ? (sponsor.fullName || sponsor.name || `${sponsor.firstName || ''} ${sponsor.lastName || ''}`.trim())
    : null
  const sponsorParty = sponsor?.party
  const sponsorState = sponsor?.state
  const cosponsorCount = bill.cosponsors?.count

  return (
    <a className="bill-row" onClick={onClick} tabIndex={0} role="link">
      <div className="bill-row-rail">
        <div className="bill-row-id">{formatBillId(bill)}</div>
        {bill.policyArea?.name && <div className="bill-row-policy">{bill.policyArea.name}</div>}
      </div>
      <div className="bill-row-main">
        <h3 className="bill-row-title">{getBillDisplayTitle(bill)}</h3>
        {sponsorName && (
          <div className="bill-row-byline">
            Sponsored by <span className="bill-row-sponsor">{sponsorName}</span>
            {sponsorParty && (
              <span className={`bill-row-party ${partyClass(sponsorParty)}`}>
                {partyAbbrev(sponsorParty)}{sponsorState ? `-${sponsorState}` : ''}
              </span>
            )}
            {cosponsorCount > 0 && <> · with {cosponsorCount} cosponsor{cosponsorCount !== 1 ? 's' : ''}</>}
            {bill.introducedDate && <> · introduced {formatDate(bill.introducedDate)}</>}
          </div>
        )}
        {bill.latestAction?.text && (
          <p className="bill-row-summary">{bill.latestAction.text}</p>
        )}
      </div>
      <div className="bill-row-side">
        <span className={`bill-row-status ${status.cls}`}>
          <span className="bill-row-status-dot"></span>{status.label}
        </span>
        {bill.latestAction?.actionDate && (
          <div className="bill-row-meta">
            Last action<br /><span className="bill-row-meta-date">{formatDate(bill.latestAction.actionDate)}</span>
          </div>
        )}
      </div>
    </a>
  )
}

export default BillsPage
