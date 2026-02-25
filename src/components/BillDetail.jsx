import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getBillDetails, getBillText, getBillActions, getBillCosponsors, explainBillWithAI, getVoteTalliesFromActions } from '../services/congress'
import { InfoTip } from './Tooltip'
import '../styles/BillDetail.css'

function BillDetail() {
  const { congress, billType, number } = useParams()
  const navigate = useNavigate()

  const [bill, setBill] = useState(null)
  const [textVersions, setTextVersions] = useState([])
  const [actions, setActions] = useState([])
  const [cosponsors, setCosponsors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [voteTallies, setVoteTallies] = useState([])
  const [talliesLoading, setTalliesLoading] = useState(false)

  const [aiExplanation, setAiExplanation] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiExpanded, setAiExpanded] = useState(false)

  useEffect(() => {
    fetchBillData()
  }, [congress, billType, number])

  const fetchBillData = async () => {
    try {
      setLoading(true)

      const [billData, textData, actionsData, cosponsorsData] = await Promise.all([
        getBillDetails(congress, billType, number),
        getBillText(congress, billType, number),
        getBillActions(congress, billType, number),
        getBillCosponsors(congress, billType, number)
      ])

      setBill(billData)
      setTextVersions(textData)
      setActions(actionsData)
      setCosponsors(cosponsorsData)
      setError(null)

      // Fetch vote tallies from actions (non-blocking)
      setTalliesLoading(true)
      getVoteTalliesFromActions(actionsData)
        .then(tallies => setVoteTallies(tallies))
        .catch(err => console.error('Error loading vote tallies:', err))
        .finally(() => setTalliesLoading(false))
    } catch (err) {
      setError('Failed to load bill details. Please try again.')
      console.error('Error loading bill:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleExplainWithAI = async () => {
    if (aiExplanation && !aiExplanation.isPlaceholder) {
      setAiExpanded(!aiExpanded)
      return
    }

    try {
      setAiLoading(true)
      setAiExpanded(true)

      const summary = bill.summaries?.[0]?.text || ''
      const result = await explainBillWithAI(bill.title, summary)
      setAiExplanation(result)
    } catch (err) {
      console.error('Error getting AI explanation:', err)
      setAiExplanation({
        explanation: 'Failed to get AI explanation. Please try again.',
        keyPoints: [],
        isPlaceholder: true,
        error: err.message
      })
    } finally {
      setAiLoading(false)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getStatusBadge = () => {
    if (!bill) return null

    const latestAction = bill.latestAction?.text?.toLowerCase() || ''

    if (latestAction.includes('became public law') || latestAction.includes('signed by president')) {
      return <span className="status-badge enacted">Enacted</span>
    }
    if (latestAction.includes('passed house') && latestAction.includes('passed senate')) {
      return <span className="status-badge passed-both">Passed Both Chambers</span>
    }
    if (latestAction.includes('passed house') || latestAction.includes('passed senate')) {
      return <span className="status-badge passed">Passed One Chamber</span>
    }
    if (latestAction.includes('introduced')) {
      return <span className="status-badge introduced">Introduced</span>
    }
    return <span className="status-badge in-progress">In Progress</span>
  }

  if (loading) {
    return (
      <div className="bill-detail-loading">
        <div className="loading-spinner"></div>
        <p>Loading bill details...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bill-detail-error">
        <div className="error-message">{error}</div>
        <button className="back-button" onClick={() => navigate('/bills')}>
          Back to Bills
        </button>
      </div>
    )
  }

  if (!bill) {
    return (
      <div className="bill-detail-error">
        <div className="error-message">Bill not found</div>
        <button className="back-button" onClick={() => navigate('/bills')}>
          Back to Bills
        </button>
      </div>
    )
  }

  const sponsor = bill.sponsors?.[0]

  return (
    <div className="bill-detail">
      <button className="back-link" onClick={() => navigate('/bills')}>
        ← Back to Bills
      </button>

      <div className="bill-detail-header">
        <div className="bill-type-congress">
          <span className="bill-type-label">{billType.toUpperCase()}.{number}</span>
          <span className="congress-label">{congress}th Congress</span>
        </div>

        <h1 className="bill-detail-title">{bill.title}</h1>

        <div className="bill-status-row">
          {getStatusBadge()}
          {bill.introducedDate && (
            <span className="introduced-date">
              Introduced: {formatDate(bill.introducedDate)}
            </span>
          )}
        </div>
      </div>

      {/* Key Facts */}
      <section className="bill-key-facts">
        <div className="key-facts-grid">
          {sponsor && (
            <div className="key-fact">
              <span className="key-fact-label">Sponsor</span>
              <Link to={`/politician/${sponsor.bioguideId}`} className="key-fact-value key-fact-link">
                {sponsor.fullName || `${sponsor.firstName} ${sponsor.lastName}`}
              </Link>
              <span className="key-fact-desc">The member of Congress who introduced this bill</span>
            </div>
          )}
          {bill.introducedDate && (
            <div className="key-fact">
              <span className="key-fact-label">Introduced</span>
              <span className="key-fact-value">{formatDate(bill.introducedDate)}</span>
              <span className="key-fact-desc">Date the bill was formally submitted to Congress</span>
            </div>
          )}
          {cosponsors.length > 0 && (
            <div className="key-fact">
              <span className="key-fact-label">Cosponsors</span>
              <span className="key-fact-value">{cosponsors.length}</span>
              <span className="key-fact-desc">Members who publicly support this bill</span>
            </div>
          )}
          {bill.policyArea?.name && (
            <div className="key-fact">
              <span className="key-fact-label">Policy Area</span>
              <span className="key-fact-value">{bill.policyArea.name}</span>
              <span className="key-fact-desc">The primary topic or subject of this legislation</span>
            </div>
          )}
          {bill.committees?.count > 0 && (
            <div className="key-fact">
              <span className="key-fact-label">Committees</span>
              <span className="key-fact-value">{bill.committees.count}</span>
              <span className="key-fact-desc">Groups of members assigned to review and refine the bill before a full vote</span>
            </div>
          )}
          {actions.length > 0 && (
            <div className="key-fact">
              <span className="key-fact-label">Actions</span>
              <span className="key-fact-value">{actions.length}</span>
              <span className="key-fact-desc">Official steps taken on this bill (introductions, referrals, votes, etc.)</span>
            </div>
          )}
        </div>
      </section>

      {voteTallies.length > 0 && (
        <section className="bill-section vote-tallies-section">
          <h2><InfoTip text="A roll call vote is when each member of Congress individually records their vote — yea (yes), nay (no), present (abstain), or not voting.">Vote Results</InfoTip></h2>
          <div className="vote-tallies-list">
            {voteTallies.map((tally, index) => {
              const total = tally.totalYea + tally.totalNay
              const yeaPct = total > 0 ? (tally.totalYea / total) * 100 : 0
              const nayPct = total > 0 ? (tally.totalNay / total) * 100 : 0
              const passed = tally.result?.toLowerCase().includes('passed') ||
                             tally.result?.toLowerCase().includes('agreed')

              return (
                <div key={index} className="vote-tally-card">
                  <div className="tally-header">
                    <span className="tally-chamber-badge">
                      {tally.chamber || 'Congress'}
                    </span>
                    {tally.date && (
                      <span className="tally-date">{formatDate(tally.date)}</span>
                    )}
                    <span className={`tally-result-badge ${passed ? 'passed' : 'failed'}`}>
                      {tally.result || 'N/A'}
                    </span>
                  </div>
                  {tally.question && (
                    <p className="tally-question">{tally.question}</p>
                  )}
                  <div className="tally-bar-container">
                    <div className="tally-bar">
                      <div
                        className="tally-bar-yea"
                        style={{ width: `${yeaPct}%` }}
                      />
                      <div
                        className="tally-bar-nay"
                        style={{ width: `${nayPct}%` }}
                      />
                    </div>
                    <div className="tally-counts">
                      <span className="tally-yea-count" title="Voted YES — in favor of the measure">Yea: {tally.totalYea}</span>
                      <span className="tally-nay-count" title="Voted NO — against the measure">Nay: {tally.totalNay}</span>
                      {tally.totalNotVoting > 0 && (
                        <span className="tally-notvoting-count" title="Did not cast a vote on this measure">Not Voting: {tally.totalNotVoting}</span>
                      )}
                      {tally.totalPresent > 0 && (
                        <span className="tally-present-count" title="Was present in the chamber but chose not to vote yes or no — often used as a form of protest or abstention">Present: {tally.totalPresent}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {talliesLoading && (
        <section className="bill-section">
          <div className="section-loading-inline">
            <div className="loading-spinner"></div>
            <p>Loading vote results...</p>
          </div>
        </section>
      )}

      {bill.summaries && bill.summaries.length > 0 && (
        <section className="bill-section">
          <h2>Official Summary</h2>
          <div
            className="bill-summary"
            dangerouslySetInnerHTML={{ __html: bill.summaries[0].text }}
          />
        </section>
      )}

      <section className="bill-section ai-section">
        <div className="ai-header">
          <h2>AI Explanation</h2>
          <button
            className={`ai-explain-button ${aiExpanded ? 'expanded' : ''}`}
            onClick={handleExplainWithAI}
            disabled={aiLoading}
          >
            {aiLoading ? (
              <>
                <span className="loading-spinner-small"></span>
                Analyzing...
              </>
            ) : aiExpanded ? (
              'Hide Explanation'
            ) : (
              'Explain This Bill'
            )}
          </button>
        </div>

        {aiExpanded && aiExplanation && (
          <div className="ai-explanation-content">
            {aiExplanation.isPlaceholder && (
              <div className="ai-placeholder-notice">
                AI-powered explanations require an OpenAI API key.
              </div>
            )}

            <div className="explanation-text">
              <h3>Plain English Explanation</h3>
              {aiExplanation.paragraphs && aiExplanation.paragraphs.length > 0 ? (
                aiExplanation.paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))
              ) : (
                <p>{aiExplanation.explanation}</p>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="bill-section">
        <h2><InfoTip text="The sponsor is the member of Congress who wrote and introduced the bill. Cosponsors are other members who formally endorse it.">Sponsors</InfoTip></h2>
        <div className="sponsors-list">
          {sponsor && (
            <div className="sponsor-item primary-sponsor">
              <span className="sponsor-badge">Primary Sponsor</span>
              <Link
                to={`/politician/${sponsor.bioguideId}`}
                className="sponsor-name-link"
              >
                {sponsor.fullName || sponsor.firstName + ' ' + sponsor.lastName}
              </Link>
              <span className="sponsor-party">
                {sponsor.party} - {sponsor.state}
              </span>
            </div>
          )}

          {cosponsors.length > 0 && (
            <div className="cosponsors-section">
              <h3>{cosponsors.length} Cosponsor{cosponsors.length !== 1 ? 's' : ''}</h3>
              <div className="cosponsors-grid">
                {cosponsors.slice(0, 10).map((cosponsor) => (
                  <Link
                    key={cosponsor.bioguideId}
                    to={`/politician/${cosponsor.bioguideId}`}
                    className="cosponsor-chip"
                  >
                    {cosponsor.fullName || cosponsor.firstName + ' ' + cosponsor.lastName}
                    <span className="cosponsor-party">({cosponsor.party})</span>
                  </Link>
                ))}
                {cosponsors.length > 10 && (
                  <span className="more-cosponsors">
                    +{cosponsors.length - 10} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {textVersions.length > 0 && (
        <section className="bill-section">
          <h2>Bill Text Versions</h2>
          <div className="text-versions-list">
            {textVersions.map((version, index) => (
              <a
                key={index}
                href={version.formats?.[0]?.url || bill.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-version-item"
              >
                <span className="version-type">{version.type || 'Full Text'}</span>
                <span className="version-date">{formatDate(version.date)}</span>
                <span className="view-link">View on Congress.gov →</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {actions.length > 0 && (
        <section className="bill-section">
          <h2><InfoTip text="Actions are the official steps a bill goes through — from being introduced, to committee review, floor votes, and potentially being signed into law.">Actions Timeline</InfoTip></h2>
          <div className="actions-timeline">
            {actions.slice(0, 15).map((action, index) => {
              const text = (action.text || '').toLowerCase()
              let actionType = 'default'
              if (text.includes('signed by president') || text.includes('became public law')) actionType = 'enacted'
              else if (text.includes('passed') || text.includes('agreed to')) actionType = 'passed'
              else if (text.includes('committee')) actionType = 'committee'
              else if (text.includes('introduced')) actionType = 'introduced'
              else if (text.includes('referred')) actionType = 'referred'

              return (
                <div key={index} className={`action-item action-item--${actionType}`}>
                  <div className="action-marker">
                    <div className={`marker-dot marker-dot--${actionType}`}></div>
                    {index < actions.slice(0, 15).length - 1 && <div className="marker-line"></div>}
                  </div>
                  <div className="action-content">
                    <span className="action-date">{formatDate(action.actionDate)}</span>
                    <p className="action-text">{action.text}</p>
                    {action.actionCode && (
                      <span className="action-code">Code: {action.actionCode}</span>
                    )}
                  </div>
                </div>
              )
            })}
            {actions.length > 15 && (
              <div className="more-actions">
                <a
                  href={`https://www.congress.gov/bill/${congress}th-congress/${billType === 's' ? 'senate-bill' : 'house-bill'}/${number}/all-actions`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View all {actions.length} actions on Congress.gov →
                </a>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="bill-source-link">
        <a
          href={bill.url || `https://www.congress.gov/bill/${congress}th-congress/${billType.toLowerCase()}/${number}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Source: Congress.gov
        </a>
      </div>
    </div>
  )
}

export default BillDetail
