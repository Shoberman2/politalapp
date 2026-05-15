import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMemberDashboardData } from '../services/supabaseVotes'
import { getMemberVotes, explainBillWithAI } from '../services/congress'
import { GLOSSARY_FLAT } from '../data/proceduralGlossary'
import '../styles/VoteDashboard.css'

// ┌─────────────────────────────────────────────────────────────────────┐
// │ Procedural vote card — render conditions                            │
// │                                                                     │
// │   has roll_call.question?           render question + tooltips      │
// │   no roll_call.question?            fallback: bill.title → date     │
// │                                                                     │
// │ Future PRs will add (gated by roll_call.is_significant):            │
// │   - tactical badge between description and AI block                 │
// │   - AI narration block (.dash-explanation marginalia)               │
// │   - "Why was this explained?" methodology popover trigger           │
// │                                                                     │
// │ Storyboard: citizen scrolls voting record → sees plain-English     │
// │ question instead of "Procedural Vote" placeholder → reads or        │
// │ taps a glossary term for civics definition.                        │
// └─────────────────────────────────────────────────────────────────────┘

// Pre-compile the glossary regex array once at module load. Rebuilding
// these on every render across N visible cards is O(cards × terms) work
// per re-render — meaningful at 20+ procedural cards.
const GLOSSARY_PATTERNS = Object.entries(GLOSSARY_FLAT).map(([term, definition]) => ({
  term,
  definition,
  regex: new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
}))

/**
 * Inline glossary annotation for procedural question text.
 * Wraps any glossary-matched term in a tooltip-triggering span.
 * Mirrors the pattern in VotingHistory.jsx (now extracted to shared glossary).
 */
function annotateQuestion(text, activeTerm, setActiveTerm, tooltipRef) {
  if (!text) return text
  const matches = []
  for (const { term, definition, regex } of GLOSSARY_PATTERNS) {
    regex.lastIndex = 0 // reset since regex is shared across renders
    let match
    while ((match = regex.exec(text)) !== null) {
      matches.push({ start: match.index, end: match.index + match[0].length, term, original: match[0], definition })
    }
  }
  if (matches.length === 0) return text

  matches.sort((a, b) => a.start - b.start || b.end - a.end)
  const filtered = []
  let lastEnd = -1
  for (const m of matches) {
    if (m.start >= lastEnd) {
      filtered.push(m)
      lastEnd = m.end
    }
  }

  const parts = []
  let cursor = 0
  for (const m of filtered) {
    if (m.start > cursor) parts.push(text.slice(cursor, m.start))
    const key = `${m.term}-${m.start}`
    parts.push(
      <span
        key={key}
        className="glossary-term"
        role="button"
        tabIndex={0}
        aria-expanded={activeTerm === key}
        onClick={(e) => {
          e.stopPropagation()
          setActiveTerm(activeTerm === key ? null : key)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            setActiveTerm(activeTerm === key ? null : key)
          } else if (e.key === 'Escape') {
            setActiveTerm(null)
          }
        }}
      >
        {m.original}
        {activeTerm === key && (
          <span className="glossary-tooltip" ref={tooltipRef} role="tooltip">
            <strong>{m.original}</strong>
            <span>{m.definition}</span>
          </span>
        )}
      </span>
    )
    cursor = m.end
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts
}

/**
 * Returns a citizen-readable title for a procedural vote.
 * Fallback chain (E4 from /plan-eng-review):
 *   roll_call.question → bill.title → "Vote on {date}"
 */
function getProceduralTitle(vote) {
  const q = vote.roll_call?.question
  if (q && q.trim()) return q.trim()
  if (vote.bill?.title) return vote.bill.title
  if (vote.voted_at) {
    const date = new Date(vote.voted_at)
    if (!isNaN(date.getTime())) {
      return `Vote on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    }
  }
  return 'Vote'
}

function VoteDashboard({ bioguideId }) {
  const navigate = useNavigate()
  const [dashData, setDashData] = useState(null)
  const [fallbackVotes, setFallbackVotes] = useState(null)
  const [loading, setLoading] = useState(true)
  const [usingFallback, setUsingFallback] = useState(false)
  const [visibleCount, setVisibleCount] = useState(20)
  const [expandedBill, setExpandedBill] = useState(null)
  const [billExplanations, setBillExplanations] = useState({})
  const [activeGlossaryTerm, setActiveGlossaryTerm] = useState(null)
  const tooltipRef = useRef(null)
  // containerRef scopes the outside-click handler to this component's subtree
  // so a glossary-term click inside another component (e.g. VotingHistory) on
  // the same page doesn't accidentally close (or fail to close) our tooltip.
  const containerRef = useRef(null)
  const statsRef = useRef(null)
  const [statsAnimated, setStatsAnimated] = useState(false)

  useEffect(() => {
    loadData()
  }, [bioguideId])

  // Close glossary tooltip on outside click. Scoped: only react when the
  // click happens INSIDE our subtree (so cross-component glossary clicks
  // don't pollute state).
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target)) return
      if (tooltipRef.current && !tooltipRef.current.contains(e.target) && !e.target.closest('.glossary-term')) {
        setActiveGlossaryTerm(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

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

  const handleExpandBill = async (parsed, billTitle, billSummary, index) => {
    if (expandedBill === index) {
      setExpandedBill(null)
      return
    }
    setExpandedBill(index)
    if (!billExplanations[index]) {
      const explanation = await explainBillWithAI({
        congress: parsed?.congress,
        billType: parsed?.type,
        number: parsed?.number,
        title: billTitle,
        summary: billSummary,
      })
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
      <section className="vote-dashboard" ref={containerRef}>
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
            // Procedural votes have no bill_id (or have a roll_call.question
            // that isn't a final-passage vote). For those, render question
            // text + glossary tooltips. For bill votes, render bill title.
            const isProcedural = !vote.bill_id
            const procQuestion = vote.roll_call?.question?.trim() || null
            const billTitle = vote.bill?.title
              || (vote.bill_id ? vote.bill_id.split('-').slice(1).join(' ').toUpperCase()
              : getProceduralTitle(vote))
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
                        {vote.bill_id.split('-').slice(1).join(' ').toUpperCase()}
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

                  {/* Title: procedural cards render question text with
                      glossary tooltips; bill cards render plain bill title.
                      Procedural cards use a div (not h4) so the interactive
                      glossary-term spans inside don't violate ARIA semantics
                      (heading content should be static for screen readers). */}
                  {isProcedural && procQuestion ? (
                    <div className="dash-bill-title proc-question" role="heading" aria-level="4">
                      {annotateQuestion(procQuestion, activeGlossaryTerm, setActiveGlossaryTerm, tooltipRef)}
                    </div>
                  ) : (
                    <h4 className="dash-bill-title">{billTitle}</h4>
                  )}

                  {/* Description: for bill votes use bill summary; for
                      procedural votes use roll_call.description if present. */}
                  {description ? (
                    <p className="dash-bill-desc">
                      {description.length > 200 ? description.slice(0, 200) + '...' : description}
                    </p>
                  ) : isProcedural && vote.roll_call?.description ? (
                    <p className="dash-bill-desc">{vote.roll_call.description}</p>
                  ) : null}
                </div>

                {/* AI explanation expand (bill votes only — procedural
                    AI narration ships in PR 2 from a precomputed table). */}
                {vote.bill && (
                  <button
                    className="dash-explain-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleExpandBill(parsed, billTitle, description || '', index)
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
