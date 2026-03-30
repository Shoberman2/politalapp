import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMemberDashboardData } from '../services/supabaseVotes'
import { getMemberVotes, explainBillWithAI } from '../services/congress'
import '../styles/VoteDashboard.css'

function VoteDashboard({ bioguideId }) {
  const navigate = useNavigate()
  const [dashData, setDashData] = useState(null)
  const [fallbackVotes, setFallbackVotes] = useState(null)
  const [loading, setLoading] = useState(true)
  const [usingFallback, setUsingFallback] = useState(false)
  const [visibleCount, setVisibleCount] = useState(20)
  const [expandedBill, setExpandedBill] = useState(null)
  const [billExplanations, setBillExplanations] = useState({})
  const statsRef = useRef(null)
  const [statsAnimated, setStatsAnimated] = useState(false)

  useEffect(() => {
    loadData()
  }, [bioguideId])

  // Animate stats bar on first render
  useEffect(() => {
    if (!loading && dashData?.stats && statsRef.current) {
      const timer = setTimeout(() => setStatsAnimated(true), 100)
      return () => clearTimeout(timer)
    }
  }, [loading, dashData])

  const loadData = async () => {
    setLoading(true)
    setUsingFallback(false)

    // Try Supabase first
    const supaData = await getMemberDashboardData(bioguideId)

    if (supaData) {
      setDashData(supaData)
      setLoading(false)
      return
    }

    // Fall back to live API
    setUsingFallback(true)
    try {
      const votes = await getMemberVotes(bioguideId, 50)
      setFallbackVotes(votes || [])
    } catch (err) {
      console.error('[VoteDashboard] Fallback also failed:', err)
      setFallbackVotes([])
    }
    setLoading(false)
  }

  const handleExpandBill = async (billTitle, billSummary, index) => {
    if (expandedBill === index) {
      setExpandedBill(null)
      return
    }
    setExpandedBill(index)
    if (!billExplanations[index]) {
      const explanation = await explainBillWithAI(billTitle, billSummary)
      setBillExplanations(prev => ({ ...prev, [index]: explanation }))
    }
  }

  const parseBillId = (billId) => {
    if (!billId) return null
    // Format: "119-hr-1234"
    const parts = billId.split('-')
    if (parts.length >= 3) {
      return { congress: parts[0], type: parts[1], number: parts.slice(2).join('-') }
    }
    return null
  }

  const parseBillNumber = (billNumber) => {
    if (!billNumber) return null
    const match = billNumber.match(/^(HR|S|HRES|SRES|HJRES|SJRES|HCONRES|SCONRES)\.?\s*(\d+)$/i)
    if (match) {
      return { type: match[1].toLowerCase(), number: match[2], congress: 119 }
    }
    return null
  }

  const navigateToBill = (parsed) => {
    if (parsed) {
      navigate(`/bill/${parsed.congress}/${parsed.type}/${parsed.number}`)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getVoteClass = (position) => {
    const pos = position?.toLowerCase()
    if (pos === 'yea' || pos === 'yes' || pos === 'aye') return 'dash-vote-yea'
    if (pos === 'nay' || pos === 'no') return 'dash-vote-nay'
    if (pos === 'sponsor') return 'dash-vote-sponsor'
    return 'dash-vote-other'
  }

  const getBillDescription = (vote) => {
    if (vote.bill?.crs_summary) return vote.bill.crs_summary
    if (vote.bill?.summary) return vote.bill.summary
    return null
  }

  if (loading) {
    return (
      <section className="vote-dashboard">
        <h2 className="dash-section-title">Voting Record</h2>
        <div className="dash-loading">
          <div className="dash-skeleton-stats"></div>
          <div className="dash-skeleton-card"></div>
          <div className="dash-skeleton-card"></div>
          <div className="dash-skeleton-card"></div>
        </div>
      </section>
    )
  }

  // Supabase data available
  if (dashData) {
    const { votes, stats, isStale, lastRun } = dashData
    const displayVotes = votes.slice(0, visibleCount)

    return (
      <section className="vote-dashboard">
        <h2 className="dash-section-title">Voting Record</h2>

        {isStale && (
          <div className="dash-stale-banner">
            Data last updated {lastRun ? formatDate(lastRun.toISOString()) : 'unknown'}.
            Some recent votes may not be reflected yet.
          </div>
        )}

        {/* Stats Bar */}
        {stats && stats.total_votes >= 5 && (
          <div className="dash-stats-bar" ref={statsRef}>
            <div className="dash-stat-primary">
              <span className={`dash-stat-number ${statsAnimated ? 'animated' : ''}`}>
                {stats.party_loyalty_pct}%
              </span>
              <span className="dash-stat-label">Party Loyalty</span>
              <div className="dash-loyalty-bar">
                <div
                  className="dash-loyalty-fill"
                  style={{ width: statsAnimated ? `${stats.party_loyalty_pct}%` : '0%' }}
                />
              </div>
            </div>

            <div className="dash-stat-secondary">
              <span className="dash-stat-number-sm">
                {stats.yea_count + stats.nay_count + stats.present_count}
              </span>
              <span className="dash-stat-label">
                of {stats.total_votes} Votes Cast
              </span>
              <span className="dash-stat-detail">
                {Math.round(((stats.yea_count + stats.nay_count + stats.present_count) / stats.total_votes) * 100)}% attendance
              </span>
            </div>

            <div className="dash-stat-breakdown">
              <span className="dash-count dash-count-yea">{stats.yea_count} Yea</span>
              <span className="dash-count dash-count-nay">{stats.nay_count} Nay</span>
              <span className="dash-count dash-count-other">{stats.present_count} Present</span>
              <span className="dash-count dash-count-other">{stats.not_voting_count} Missed</span>
            </div>
          </div>
        )}

        {/* Vote Cards */}
        <div className="dash-vote-list">
          {displayVotes.length > 0 ? displayVotes.map((vote, index) => {
            const parsed = parseBillId(vote.bill_id)
            const description = getBillDescription(vote)
            const billTitle = vote.bill?.title || 'Procedural Vote'
            const isExpanded = expandedBill === index
            const explanation = billExplanations[index]

            return (
              <div key={`${vote.roll_call_id}-${index}`} className="dash-vote-card">
                <div
                  className="dash-card-content"
                  onClick={() => parsed && navigateToBill(parsed)}
                  style={{ cursor: parsed ? 'pointer' : 'default' }}
                >
                  {/* Metadata line */}
                  <div className="dash-card-meta">
                    {vote.bill_id && (
                      <span className="dash-bill-number">
                        {vote.bill_id.split('-').slice(1).join('-').toUpperCase()}
                      </span>
                    )}
                    <span
                      className={`dash-vote-badge ${getVoteClass(vote.position)}`}
                      aria-label={`Voted ${vote.position}`}
                    >
                      {vote.position}
                    </span>
                    <span className="dash-card-date">{formatDate(vote.voted_at)}</span>
                  </div>

                  {/* Bill title */}
                  <h4 className="dash-bill-title">{billTitle}</h4>

                  {/* Description */}
                  {description && (
                    <p className="dash-bill-desc">
                      {description.length > 200 ? description.slice(0, 200) + '...' : description}
                    </p>
                  )}
                </div>

                {/* AI explanation expand */}
                {vote.bill && (
                  <button
                    className="dash-explain-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleExpandBill(billTitle, description || '', index)
                    }}
                  >
                    {isExpanded ? 'Hide explanation' : 'Explain this bill'}
                  </button>
                )}

                {isExpanded && (
                  <div className="dash-explanation">
                    {explanation ? (
                      <div className="dash-explanation-content">
                        {explanation.paragraphs?.map((p, i) => (
                          <p key={i}>{p}</p>
                        )) || <p>{explanation.explanation}</p>}
                      </div>
                    ) : (
                      <div className="dash-explanation-loading">
                        <div className="loading-spinner-small"></div>
                        <span>Generating explanation...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          }) : (
            <div className="dash-empty">
              <p>No voting records available for this representative in the current Congress.</p>
              <p className="dash-empty-sub">
                Voting records appear here after roll call votes are recorded.
              </p>
            </div>
          )}
        </div>

        {/* Load more */}
        {votes.length > visibleCount && (
          <button
            className="dash-load-more"
            onClick={() => setVisibleCount(prev => prev + 20)}
          >
            Show more votes ({votes.length - visibleCount} remaining)
          </button>
        )}
      </section>
    )
  }

  // Fallback: live API data
  if (fallbackVotes) {
    return (
      <section className="vote-dashboard">
        <h2 className="dash-section-title">Voting Record</h2>

        {usingFallback && (
          <div className="dash-stale-banner">
            Loading from Congress.gov (may be slow). Pre-computed data not yet available.
          </div>
        )}

        <div className="dash-vote-list">
          {fallbackVotes.length > 0 ? fallbackVotes.map((vote, index) => {
            const parsed = parseBillNumber(vote.billNumber)

            return (
              <div key={index} className="dash-vote-card">
                <div
                  className="dash-card-content"
                  onClick={() => parsed && navigateToBill(parsed)}
                  style={{ cursor: parsed ? 'pointer' : 'default' }}
                >
                  <div className="dash-card-meta">
                    {vote.billNumber && (
                      <span className="dash-bill-number">{vote.billNumber}</span>
                    )}
                    <span
                      className={`dash-vote-badge ${getVoteClass(vote.position)}`}
                      aria-label={`Voted ${vote.position}`}
                    >
                      {vote.position || 'N/A'}
                    </span>
                    <span className="dash-card-date">{formatDate(vote.date)}</span>
                  </div>
                  <h4 className="dash-bill-title">
                    {vote.billTitle || vote.description || vote.question || 'Vote'}
                  </h4>
                </div>
              </div>
            )
          }) : (
            <div className="dash-empty">
              <p>No voting records available.</p>
            </div>
          )}
        </div>
      </section>
    )
  }

  return null
}

export default VoteDashboard
