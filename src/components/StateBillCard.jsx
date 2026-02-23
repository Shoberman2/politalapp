import { useState } from 'react'
import { getStateBillDetails, explainStateBillWithAI } from '../services/stateBills'
import '../styles/StateBillCard.css'

function StateBillCard({ bill }) {
  const [expanded, setExpanded] = useState(false)
  const [details, setDetails] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [explanation, setExplanation] = useState(null)
  const [loadingExplanation, setLoadingExplanation] = useState(false)

  const getStatusClass = (status) => {
    const map = {
      'Introduced': 'status-introduced',
      'Active': 'status-active',
      'Enrolled': 'status-enrolled',
      'Passed': 'status-passed',
      'Vetoed': 'status-vetoed',
      'Failed': 'status-failed'
    }
    return map[status] || 'status-default'
  }

  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString + 'T00:00:00')
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const handleToggleExpand = async () => {
    const willExpand = !expanded
    setExpanded(willExpand)

    if (willExpand && !details && !loadingDetails) {
      setLoadingDetails(true)
      try {
        const data = await getStateBillDetails(bill.bill_id)
        setDetails(data)
      } catch (error) {
        console.error('[StateBillCard] Error loading details:', error)
      } finally {
        setLoadingDetails(false)
      }
    }
  }

  const handleExplain = async (e) => {
    e.stopPropagation()
    if (explanation || loadingExplanation) return

    setLoadingExplanation(true)
    try {
      const billData = details || bill
      const result = await explainStateBillWithAI(billData)
      setExplanation(result)
    } catch (error) {
      console.error('[StateBillCard] Error getting explanation:', error)
      setExplanation({
        paragraphs: ['Unable to generate explanation. Please try again later.'],
        isPlaceholder: true
      })
    } finally {
      setLoadingExplanation(false)
    }
  }

  return (
    <div className={`state-bill-card ${expanded ? 'expanded' : ''}`}>
      <div className="state-bill-card-main" onClick={handleToggleExpand}>
        <div className="state-bill-card-header">
          <span className="state-bill-number-badge">{bill.number}</span>
          <span className={`state-bill-status-badge ${getStatusClass(bill.status)}`}>
            {bill.status}
          </span>
          {bill.aiScore && (
            <span className="ai-impact-badge" title="AI Impact Score">
              {bill.aiScore}/10
            </span>
          )}
          <span className="state-bill-expand-icon">
            {expanded ? '\u2212' : '+'}
          </span>
        </div>

        <h3 className="state-bill-title">{bill.title}</h3>

        {bill.aiReason && (
          <p className="ai-relevance-note">{bill.aiReason}</p>
        )}

        {bill.last_action_date && (
          <div className="state-bill-date">
            Last action: {formatDate(bill.last_action_date)}
          </div>
        )}
      </div>

      {expanded && (
        <div className="state-bill-detail-panel">
          {loadingDetails ? (
            <div className="state-bill-detail-loading">
              <span className="loading-spinner-small"></span>
              Loading details...
            </div>
          ) : details ? (
            <>
              {details.description && details.description !== bill.title && (
                <div className="state-bill-description">
                  <span className="detail-label">Description</span>
                  <p>{details.description}</p>
                </div>
              )}

              {details.sponsors?.length > 0 && (
                <div className="state-bill-sponsors">
                  <span className="detail-label">Sponsors</span>
                  <div className="sponsor-list">
                    {details.sponsors.map((s, i) => (
                      <span key={i} className="sponsor-chip">
                        {s.name}{s.party ? ` (${s.party})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {details.history?.length > 0 && (
                <div className="state-bill-history">
                  <span className="detail-label">Recent History</span>
                  <ul className="history-list">
                    {details.history.slice(-5).reverse().map((h, i) => (
                      <li key={i}>
                        <span className="history-date">{formatDate(h.date)}</span>
                        <span className="history-chamber">{h.chamber}</span>
                        <span className="history-action">{h.action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="state-bill-actions">
                <button
                  className="explain-bill-button"
                  onClick={handleExplain}
                  disabled={loadingExplanation || !!explanation}
                >
                  {loadingExplanation ? (
                    <>
                      <span className="loading-spinner-small"></span>
                      Generating...
                    </>
                  ) : explanation ? (
                    'Explained Below'
                  ) : (
                    'Explain This Bill'
                  )}
                </button>

                {bill.url && (
                  <a
                    href={bill.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="source-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Source
                  </a>
                )}
              </div>

              {explanation && (
                <div className={`state-bill-explanation ${explanation.isPlaceholder ? 'placeholder' : ''}`}>
                  <span className="detail-label">AI Explanation</span>
                  {explanation.paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="state-bill-detail-error">
              Unable to load bill details.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default StateBillCard
