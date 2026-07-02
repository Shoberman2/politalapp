import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import SEO from './SEO'
import { getSession } from '../services/aiCongress'
import '../styles/AiCongress.css'

function AiCongressSession() {
  const { sessionId } = useParams()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSession(sessionId).then(data => {
      setSession(data)
      setLoading(false)
    })
  }, [sessionId])

  if (loading) {
    return (
      <div className="ai-session-detail">
        <div className="ai-loading">
          <p>Loading session...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="ai-session-detail">
        <Link to="/ai-congress" className="ai-session-back">&larr; All sessions</Link>
        <div className="ai-empty-state">
          <h2>Session not found</h2>
          <p>This simulation session doesn't exist or has been removed.</p>
        </div>
      </div>
    )
  }

  const { bills = [] } = session

  return (
    <div className="ai-session-detail">
      <SEO
        title={`AI Congress Session ${session.session_number}`}
        description={session.summary ? session.summary.slice(0, 160) : 'AI Congress simulation session'}
        path={`/ai-congress/${sessionId}`}
      />
      <Helmet>
        <meta name="robots" content="noindex" />
      </Helmet>

      <Link to="/ai-congress" className="ai-session-back">&larr; All sessions</Link>

      <div className="ai-disclaimer">
        This is an AI simulation of legislative debate, not a rating of real members.
        These are not real votes or legislation.{' '}
        <Link to="/all">See real Congressional votes &rarr;</Link>
      </div>

      {session.status === 'running' && (
        <div className="ai-status-banner running">
          Simulation in progress... Some bills may still be loading.
        </div>
      )}

      {session.status === 'failed' && (
        <div className="ai-status-banner failed">
          This simulation did not complete. Some bills may be missing.
        </div>
      )}

      {session.summary && (
        <div className="ai-session-summary-text">
          {session.summary}
        </div>
      )}

      <div className="ai-scoreboard">
        <span className="ai-scoreboard-number">
          {session.bills_passed}
        </span>
        <span className="ai-scoreboard-label">
          of {session.total_bills} bills passed both chambers
        </span>
        <span className="ai-scoreboard-detail">
          Session {session.session_number}
        </span>
      </div>

      <div className="ai-bills-list">
        {bills.map(bill => (
          <BillCard key={bill.id} bill={bill} />
        ))}
      </div>
    </div>
  )
}

function BillCard({ bill }) {
  const housePassed = bill.house_passed
  const senatePassed = bill.senate_passed
  const passed = bill.passed

  // Combine arguments from whichever chamber has them
  const argumentsFor = bill.senate_arguments_for?.length
    ? bill.senate_arguments_for
    : bill.house_arguments_for || []
  const argumentsAgainst = bill.senate_arguments_against?.length
    ? bill.senate_arguments_against
    : bill.house_arguments_against || []

  return (
    <div className="ai-bill-card">
      <div className="ai-bill-header">
        {passed != null && (
          <span className={`ai-bill-tag ${passed ? 'passed' : 'failed'}`}>
            {passed ? 'Passed' : 'Failed'}
          </span>
        )}
      </div>

      <h3 className="ai-bill-title">{bill.title}</h3>

      {(bill.house_yea != null || bill.senate_yea != null) && (
        <div className="ai-vote-tallies">
          {bill.house_yea != null && (
            <div className="ai-vote-chamber">
              <span className="ai-vote-chamber-label">House:</span>
              <span className="ai-vote-chamber-tally">
                {bill.house_yea}-{bill.house_nay}
              </span>
              {housePassed != null && (
                <span style={{ color: housePassed ? 'var(--success)' : 'var(--error)', marginLeft: '4px', fontSize: '0.75rem' }}>
                  {housePassed ? 'passed' : 'failed'}
                </span>
              )}
            </div>
          )}
          {bill.senate_yea != null && (
            <div className="ai-vote-chamber">
              <span className="ai-vote-chamber-label">Senate:</span>
              <span className="ai-vote-chamber-tally">
                {bill.senate_yea}-{bill.senate_nay}
              </span>
              {senatePassed != null && (
                <span style={{ color: senatePassed ? 'var(--success)' : 'var(--error)', marginLeft: '4px', fontSize: '0.75rem' }}>
                  {senatePassed ? 'passed' : 'failed'}
                </span>
              )}
              {bill.senate_cloture_required && (
                <div className="ai-cloture-info">
                  Cloture: {bill.senate_cloture_votes}/60
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {bill.provisions?.length > 0 && (
        <div className="ai-bill-provisions">
          <h4>Key Provisions</h4>
          <ul>
            {bill.provisions.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {(argumentsFor.length > 0 || argumentsAgainst.length > 0) && (
        <div className="ai-bill-arguments">
          {argumentsFor.length > 0 && (
            <div className="ai-argument-section for">
              <h4>{passed ? 'Support cited in the simulation' : 'Support arguments in the simulation'}</h4>
              {argumentsFor.map((arg, i) => (
                <p key={i}>{arg}</p>
              ))}
            </div>
          )}
          {argumentsAgainst.length > 0 && (
            <div className="ai-argument-section against">
              <h4>Opposition arguments in the simulation</h4>
              {argumentsAgainst.map((arg, i) => (
                <p key={i}>{arg}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {bill.surprise_rationale && (
        <div className="ai-bill-surprise">
          <h4>Notable simulation note</h4>
          <p>{bill.surprise_rationale}</p>
        </div>
      )}
    </div>
  )
}

export default AiCongressSession
