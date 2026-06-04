import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Footer from './Footer'
import SEO from './SEO'
import { searchBills, getTrendingBills } from '../services/congress'
import { searchBillsInDb } from '../services/billsDb'
import { getBillDisplayTitle, formatBillId } from '../utils/billTitle'
import {
  BILL_ARCHIVE_START_DATE,
  BILL_CONGRESS_MIN,
  CONGRESS_MAX,
  formatCongressLabel,
} from '../utils/congressUtil'
import SponsorFilterPill from './SponsorFilterPill'
import '../styles/BillsPage.css'

// Feature flag (per outside-voice D16). Off by default; flip
// VITE_BILLS_SHOW_SPONSOR_FILTER=true in Vercel to enable.
const SHOW_SPONSOR_FILTER = import.meta.env.VITE_BILLS_SHOW_SPONSOR_FILTER === 'true'

const DEFAULT_CONGRESS_FILTER = String(CONGRESS_MAX)
const BILL_CONGRESS_OPTIONS = Array.from(
  { length: CONGRESS_MAX - BILL_CONGRESS_MIN + 1 },
  (_, i) => CONGRESS_MAX - i
)

function formatCongressFilterLabel(value) {
  if (value === 'all') return 'All Congresses Since 2001'
  return formatCongressLabel(Number(value))
}

// Fire-and-forget engagement counter. Failures silently ignored; the user
// must never wait on telemetry.
function bumpMetric(name) {
  try {
    fetch('/api/metrics/inc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric_name: name }),
      keepalive: true,
    }).catch(() => {})
  } catch (_) {
    /* no-op */
  }
}

// ---- status / chamber derivation (shared by the facet sidebar and bill rows)
function getBillStatus(bill) {
  const text = (bill.latestAction?.text || '').toLowerCase()
  if (text.includes('became public law') || text.includes('signed by president')) {
    return { key: 'law', label: 'Became Law', cls: 'st-law' }
  }
  if (text.includes('passed house') && text.includes('passed senate')) {
    return { key: 'both', label: 'Passed Both', cls: 'st-both' }
  }
  if (text.includes('passed house')) return { key: 'passed', label: 'Passed House', cls: 'st-passed' }
  if (text.includes('passed senate')) return { key: 'passed', label: 'Passed Senate', cls: 'st-passed' }
  if (text.includes('committee')) return { key: 'committee', label: 'In Committee', cls: 'st-committee' }
  if (text.includes('introduced')) return { key: 'introduced', label: 'Introduced', cls: 'st-introduced' }
  return { key: 'progress', label: 'In Progress', cls: 'st-progress' }
}

const STATUS_FACETS = [
  { key: 'law', label: 'Became law', color: 'var(--success)' },
  { key: 'both', label: 'Passed both', color: 'var(--accent)' },
  { key: 'passed', label: 'Passed one chamber', color: 'var(--info)' },
  { key: 'committee', label: 'In committee', color: 'var(--warning)' },
  { key: 'introduced', label: 'Introduced', color: 'var(--ink-3)' },
]

function billChamber(bill) {
  const t = String(bill.type || '').toLowerCase()
  if (t.startsWith('h')) return 'house'
  if (t.startsWith('s')) return 'senate'
  const origin = String(bill.originChamber || '').toLowerCase()
  if (origin.includes('house')) return 'house'
  if (origin.includes('senate')) return 'senate'
  return 'unknown'
}

function BillsPage() {
  const navigate = useNavigate()
  const [bills, setBills] = useState([])
  const [trendingBills, setTrendingBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [congressFilter, setCongressFilter] = useState(DEFAULT_CONGRESS_FILTER)
  const [billTypeFilter, setBillTypeFilter] = useState('all')
  const [sponsorFilter, setSponsorFilter] = useState(null)
  const [cosponsorFilter, setCosponsorFilter] = useState(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  // Client-side facets over the loaded result set.
  const [statusFacet, setStatusFacet] = useState('all')   // 'all' | status key
  const [policyFacet, setPolicyFacet] = useState(null)    // policy-area name | null
  const [chamberFacet, setChamberFacet] = useState(null)  // 'house' | 'senate' | null
  const [sortKey, setSortKey] = useState('latest')

  const isSearching =
    searchTerm.trim().length >= 2 ||
    sponsorFilter != null ||
    cosponsorFilter != null
  const selectedCongress = congressFilter !== 'all' ? parseInt(congressFilter, 10) : null
  const usesArchiveBrowse =
    !isSearching &&
    (congressFilter === 'all' || (selectedCongress != null && selectedCongress < CONGRESS_MAX))

  useEffect(() => {
    getTrendingBills().then(setTrendingBills).catch(() => {})
  }, [])

  const LIMIT = 20

  useEffect(() => {
    if (isSearching) return
    fetchBills(true)
  }, [congressFilter, billTypeFilter, isSearching])

  useEffect(() => {
    if (!isSearching) return
    const term = searchTerm.trim()

    setSearching(true)
    const handle = setTimeout(async () => {
      try {
        const results = await searchBillsInDb({
          query: term,
          congress: congressFilter !== 'all' ? parseInt(congressFilter) : null,
          introducedFrom: congressFilter === 'all' ? BILL_ARCHIVE_START_DATE : null,
          billType: billTypeFilter !== 'all' ? billTypeFilter : null,
          sponsorBioguideId: sponsorFilter?.bioguideId || null,
          cosponsorBioguideId: cosponsorFilter?.bioguideId || null,
          limit: 100,
        })
        setBills(results)
        setHasMore(false)
        setOffset(results.length)
        setError(null)
      } catch (err) {
        console.error('[BillsPage] Search failed:', err)
        setError(`Search failed: ${err.message || 'Unknown error'}`)
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(handle)
  }, [searchTerm, congressFilter, billTypeFilter, sponsorFilter, cosponsorFilter, isSearching])

  const fetchBills = async (reset = false) => {
    try {
      if (reset) {
        setLoading(true)
        setOffset(0)
      } else {
        setLoadingMore(true)
      }

      const currentOffset = reset ? 0 : offset

      const newBills = usesArchiveBrowse
        ? await searchBillsInDb({
            congress: selectedCongress,
            introducedFrom: congressFilter === 'all' ? BILL_ARCHIVE_START_DATE : null,
            billType: billTypeFilter !== 'all' ? billTypeFilter : null,
            limit: LIMIT,
            offset: currentOffset,
          })
        : (await searchBills({
            congress: selectedCongress,
            billType: billTypeFilter !== 'all' ? billTypeFilter : null,
            limit: LIMIT,
            offset: currentOffset,
          })).bills || []

      if (reset) {
        setBills(newBills)
      } else {
        setBills((prev) => [...prev, ...newBills])
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

  // Facet counts derived from the loaded bills.
  const facetData = useMemo(() => {
    const status = {}
    const policy = {}
    const chamber = { house: 0, senate: 0 }
    for (const b of bills) {
      const s = getBillStatus(b).key
      status[s] = (status[s] || 0) + 1
      const p = b.policyArea?.name
      if (p) policy[p] = (policy[p] || 0) + 1
      const c = billChamber(b)
      if (c === 'house' || c === 'senate') chamber[c] += 1
    }
    const topPolicies = Object.entries(policy)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }))
    return { status, policy: topPolicies, chamber }
  }, [bills])

  // Apply the client-side facets + sort to the loaded bills.
  const displayedBills = useMemo(() => {
    let list = bills
    if (statusFacet !== 'all') list = list.filter((b) => getBillStatus(b).key === statusFacet)
    if (policyFacet) list = list.filter((b) => b.policyArea?.name === policyFacet)
    if (chamberFacet) list = list.filter((b) => billChamber(b) === chamberFacet)

    const sorted = [...list]
    if (sortKey === 'latest') {
      sorted.sort((a, b) => new Date(b.latestAction?.actionDate || 0) - new Date(a.latestAction?.actionDate || 0))
    } else if (sortKey === 'cosponsors') {
      sorted.sort((a, b) => (b.cosponsors?.count || 0) - (a.cosponsors?.count || 0))
    } else if (sortKey === 'introduced') {
      sorted.sort((a, b) => new Date(b.introducedDate || 0) - new Date(a.introducedDate || 0))
    } else if (sortKey === 'number') {
      sorted.sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0))
    }
    return sorted
  }, [bills, statusFacet, policyFacet, chamberFacet, sortKey])

  const handleLoadMore = () => fetchBills(false)

  const resetAll = () => {
    setSearchTerm('')
    setCongressFilter(DEFAULT_CONGRESS_FILTER)
    setBillTypeFilter('all')
    setSponsorFilter(null)
    setCosponsorFilter(null)
    setStatusFacet('all')
    setPolicyFacet(null)
    setChamberFacet(null)
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
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
    <div className="bw bills-desk">
      <SEO
        title="Congressional Bill Tracker"
        description={
          trendingBills.length > 0
            ? `Trending now: ${trendingBills.slice(0, 3).map((b) => b.headline).join(', ')}. Browse and search legislation from the U.S. Congress.`
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
              dateModified: b.latestAction?.actionDate,
            },
          })),
        } : undefined}
      />

      {/* ===== MASTHEAD ===== */}
      <header className="page-masthead">
        <div className="pm-inner">
          <span className="pm-kicker kicker">Congressional Index / {formatCongressFilterLabel(congressFilter)}</span>
          <h1 className="pm-title">The <em>Bills</em> Desk</h1>
          <p className="pm-deck">Every bill introduced in the U.S. House and Senate, searchable, sourced and explained in plain English. Updated daily from the official Congress.gov record.</p>
          <div className="pm-meta">
            <span>{today}</span>
            <span><b>{bills.length.toLocaleString()}</b> bills loaded</span>
            <span>Source: <b>Congress.gov</b></span>
          </div>
        </div>
      </header>

      {/* ===== SEARCH SHELL ===== */}
      <div className="search-shell">
        <div className="ss-inner">
          <label className="search-field">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by title, bill number (H.R. 4821), sponsor or keyword..."
            />
          </label>
          <select className="filter-pill" aria-label="Congress" value={congressFilter} onChange={(e) => setCongressFilter(e.target.value)}>
            {BILL_CONGRESS_OPTIONS.map((congress) => (
              <option key={congress} value={String(congress)}>{formatCongressLabel(congress)}</option>
            ))}
            <option value="all">All Congresses Since 2001</option>
          </select>
          <select className="filter-pill" aria-label="Bill type" value={billTypeFilter} onChange={(e) => setBillTypeFilter(e.target.value)}>
            <option value="all">All bill types</option>
            <option value="hr">House Bills (H.R.)</option>
            <option value="s">Senate Bills (S.)</option>
            <option value="hjres">House Joint Resolutions</option>
            <option value="sjres">Senate Joint Resolutions</option>
            <option value="hres">House Resolutions</option>
            <option value="sres">Senate Resolutions</option>
          </select>
          {SHOW_SPONSOR_FILTER && (
            <>
              <SponsorFilterPill
                label="Sponsored by"
                selected={sponsorFilter}
                onChange={(p) => { setSponsorFilter(p); if (p) bumpMetric('sponsor_filter_used') }}
                ariaLabel="Filter by sponsor"
              />
              <SponsorFilterPill
                label="Cosponsored by"
                selected={cosponsorFilter}
                onChange={(p) => { setCosponsorFilter(p); if (p) bumpMetric('sponsor_filter_used') }}
                ariaLabel="Filter by cosponsor"
              />
            </>
          )}
        </div>
      </div>

      {/* ===== TRENDING ===== */}
      {trendingBills.length > 0 && (
        <div className="trending">
          <div className="tr-inner">
            <span className="tr-label">Trending today</span>
            <div className="tr-pills">
              {trendingBills.slice(0, 5).map((b, i) => (
                <button
                  key={`${b.congress}-${b.type}-${b.number}-${i}`}
                  className="tr-pill"
                  onClick={() => navigate(`/bill/${b.congress}/${b.type?.toLowerCase()}/${b.number}`)}
                >
                  <span className="n">{formatBillId(b)}</span>
                  <span className="t">{b.headline || getBillDisplayTitle(b)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== LAYOUT ===== */}
      <div className="bills-layout">
        {/* SIDEBAR */}
        <aside className="refine">
          <div className="facet">
            <h3>Status</h3>
            <div className="facet-list">
              <button className={`facet-item ${statusFacet === 'all' ? 'active' : ''}`} onClick={() => setStatusFacet('all')}>
                <span>All bills</span><span className="c">{bills.length.toLocaleString()}</span>
              </button>
              {STATUS_FACETS.map((s) => (
                <button
                  key={s.key}
                  className={`facet-item ${statusFacet === s.key ? 'active' : ''}`}
                  onClick={() => setStatusFacet((cur) => (cur === s.key ? 'all' : s.key))}
                >
                  <span className="facet-row"><span className="facet-status-dot" style={{ background: s.color }}></span>{s.label}</span>
                  <span className="c">{(facetData.status[s.key] || 0).toLocaleString()}</span>
                </button>
              ))}
            </div>
          </div>

          {facetData.policy.length > 0 && (
            <div className="facet">
              <h3>Policy Area</h3>
              <div className="facet-list">
                {facetData.policy.map((p) => (
                  <button
                    key={p.name}
                    className={`facet-item ${policyFacet === p.name ? 'active' : ''}`}
                    onClick={() => setPolicyFacet((cur) => (cur === p.name ? null : p.name))}
                  >
                    <span>{p.name}</span><span className="c">{p.count.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="facet">
            <h3>Chamber</h3>
            <div className="facet-list">
              <button className={`facet-item ${chamberFacet === 'house' ? 'active' : ''}`} onClick={() => setChamberFacet((c) => (c === 'house' ? null : 'house'))}>
                <span>House of Representatives</span><span className="c">{facetData.chamber.house.toLocaleString()}</span>
              </button>
              <button className={`facet-item ${chamberFacet === 'senate' ? 'active' : ''}`} onClick={() => setChamberFacet((c) => (c === 'senate' ? null : 'senate'))}>
                <span>Senate</span><span className="c">{facetData.chamber.senate.toLocaleString()}</span>
              </button>
            </div>
          </div>
        </aside>

        {/* RESULTS */}
        <main className="results">
          <div className="results-bar">
            <div className="results-count">
              Showing <b>{displayedBills.length.toLocaleString()}</b> of <b>{bills.length.toLocaleString()}</b> loaded / <span className="results-congress">{formatCongressFilterLabel(congressFilter)}</span>
              {searchTerm && <span className="results-filter"> matching "{searchTerm}"</span>}
              {sponsorFilter && <span className="results-filter"> sponsored by <b>{sponsorFilter.name}</b></span>}
              {cosponsorFilter && <span className="results-filter"> cosponsored by <b>{cosponsorFilter.name}</b></span>}
              {searching && <span className="results-filter"> / searching...</span>}
            </div>
            <div className="results-sort">
              Sort
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
                <option value="latest">Latest action</option>
                <option value="cosponsors">Most cosponsors</option>
                <option value="introduced">Recently introduced</option>
                <option value="number">Bill number</option>
              </select>
            </div>
          </div>

          {displayedBills.length > 0 ? (
            <>
              <div className="bill-list">
                {displayedBills.map((bill, index) => (
                  <BillRow
                    key={`${bill.congress}-${bill.type}-${bill.number}-${index}`}
                    bill={bill}
                    onClick={() => navigate(`/bill/${bill.congress}/${bill.type?.toLowerCase()}/${bill.number}`)}
                  />
                ))}
              </div>

              {hasMore && !isSearching && statusFacet === 'all' && !policyFacet && !chamberFacet && (
                <div className="load-more">
                  <button onClick={handleLoadMore} disabled={loadingMore} className="btn btn-ghost">
                    {loadingMore ? (<><span className="loading-spinner-small"></span> Loading...</>) : 'Load more bills'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="bills-empty">
              <p>No bills found matching your criteria</p>
              <button className="btn btn-ghost" onClick={resetAll}>Reset filters</button>
            </div>
          )}
        </main>
      </div>

      <Footer />
    </div>
  )
}

function partyClass(party) {
  if (!party) return ''
  const p = party.toLowerCase()
  if (p.startsWith('d')) return 'd'
  if (p.startsWith('r')) return 'r'
  return 'i'
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
  const status = getBillStatus(bill)
  const sponsor = bill.sponsors?.[0] || bill.sponsor
  const sponsorName = sponsor
    ? (sponsor.fullName || sponsor.name || `${sponsor.firstName || ''} ${sponsor.lastName || ''}`.trim())
    : null
  const sponsorParty = sponsor?.party
  const sponsorState = sponsor?.state
  const cosponsorCount = bill.cosponsors?.count

  return (
    <button type="button" className="bill-row" onClick={onClick}>
      <div className="bill-rail">
        <div className="rid">{formatBillId(bill)}</div>
        {bill.policyArea?.name && <div className="policy">{bill.policyArea.name}</div>}
      </div>
      <div className="bill-main">
        <h2 className="bill-title">{getBillDisplayTitle(bill)}</h2>
        {sponsorName && (
          <div className="bill-byline">
            Sponsored by <span className="sp">{sponsorName}</span>
            {sponsorParty && (
              <span className={`ptag ${partyClass(sponsorParty)}`}>
                {partyAbbrev(sponsorParty)}{sponsorState ? `-${sponsorState}` : ''}
              </span>
            )}
            {cosponsorCount > 0 && <> / with {cosponsorCount} cosponsor{cosponsorCount !== 1 ? 's' : ''}</>}
            {bill.introducedDate && <> / introduced {formatDate(bill.introducedDate)}</>}
          </div>
        )}
        {bill.latestAction?.text && (
          <p className="bill-summary">{bill.latestAction.text}</p>
        )}
      </div>
      <div className="bill-side">
        <span className={`bill-status ${status.cls}`}>
          <span className="dot"></span>{status.label}
        </span>
        {bill.latestAction?.actionDate && (
          <div className="bill-lastaction">Last action<b>{formatDate(bill.latestAction.actionDate)}</b></div>
        )}
      </div>
    </button>
  )
}

export default BillsPage
