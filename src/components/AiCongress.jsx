import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import SEO from './SEO'
import { getSessions } from '../services/aiCongress'
import '../styles/AiCongress.css'

function AiCongress() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSessions().then(data => {
      setSessions(data)
      setLoading(false)
    })
  }, [])

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="ai-congress">
        <div className="ai-loading">
          <p>Loading AI Congress sessions...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="ai-congress">
      <SEO
        title="AI Congress"
        description="An experimental AI simulation of legislative debate. This page is separate from BallotWatch's real congressional records."
        path="/ai-congress"
      />
      <Helmet>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="ai-disclaimer">
        This is an AI simulation of legislative debate, not a rating of real members.
        These are not real votes or legislation.{' '}
        <Link to="/all">See real Congressional votes &rarr;</Link>
      </div>

      <div className="ai-congress-header">
        <h1>AI Congress</h1>
        <p className="ai-congress-subtitle">
          Experimental sessions that model hypothetical bill debate separately from real congressional records.
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="ai-empty-state">
          <h2>AI Congress hasn't convened yet.</h2>
          <p>The first session is coming soon.</p>
        </div>
      ) : (
        <div className="ai-sessions-list">
          {sessions.map(session => (
            <Link
              key={session.id}
              to={`/ai-congress/${session.id}`}
              className="ai-session-row"
            >
              <span className="ai-session-number">
                Session {session.session_number}
              </span>
              <div className="ai-session-info">
                <div className="ai-session-title">
                  {session.status === 'failed'
                    ? 'Session incomplete'
                    : `${session.bills_passed} of ${session.total_bills} bills passed`
                  }
                </div>
                {session.summary && (
                  <div className="ai-session-summary">
                    {session.summary.slice(0, 150)}...
                  </div>
                )}
              </div>
              <div className="ai-session-meta">
                {session.status === 'failed' ? (
                  <span className="ai-session-failed-tag">(incomplete)</span>
                ) : (
                  <span className="ai-session-score">
                    {session.bills_passed}/{session.total_bills}
                  </span>
                )}
                <span className="ai-session-date">
                  {formatDate(session.created_at)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default AiCongress
