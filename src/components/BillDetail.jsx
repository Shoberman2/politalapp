import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getBillDetails, getBillText, getBillActions, getBillCosponsors, explainBillWithAI } from '../services/congress'
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
              <p>{aiExplanation.explanation}</p>
            </div>

            {aiExplanation.keyPoints && aiExplanation.keyPoints.length > 0 && (
              <div className="key-points">
                <h3>Key Points</h3>
                <ul>
                  {aiExplanation.keyPoints.map((point, index) => (
                    <li key={index}>{point}</li>
                  ))}
                </ul>
              </div>
            )}

            {aiExplanation.affectedGroups && (
              <div className="affected-groups">
                <h3>Who Is Affected</h3>
                <p>{aiExplanation.affectedGroups}</p>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="bill-section">
        <h2>Sponsors</h2>
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
          <h2>Actions Timeline</h2>
          <div className="actions-timeline">
            {actions.slice(0, 15).map((action, index) => (
              <div key={index} className="action-item">
                <div className="action-marker">
                  <div className="marker-dot"></div>
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
            ))}
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

      <div className="bill-external-link">
        <a
          href={bill.url || `https://www.congress.gov/bill/${congress}th-congress/${billType.toLowerCase()}/${number}`}
          target="_blank"
          rel="noopener noreferrer"
          className="congress-link"
        >
          View Full Bill on Congress.gov →
        </a>
      </div>
    </div>
  )
}

export default BillDetail
