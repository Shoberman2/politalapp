import { useState, useEffect } from 'react'
import {
  calculateShutdownRisk,
  getCountdown,
  FUNDING_DEADLINES,
  SHUTDOWN_HISTORY,
  fetchAppropriationsBills
} from '../services/shutdown'
import '../styles/ShutdownTracker.css'

function ShutdownTracker() {
  const [risk, setRisk] = useState(null)
  const [countdown, setCountdown] = useState(null)
  const [apiBills, setApiBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      const riskData = calculateShutdownRisk()
      setRisk(riskData)

      if (riskData.nextDeadline) {
        setCountdown(getCountdown(riskData.nextDeadline.date))
      }

      try {
        const bills = await fetchAppropriationsBills()
        setApiBills(bills)
      } catch {
        // API enrichment is optional
      }

      setLoading(false)
    } catch (err) {
      setError('Failed to load shutdown tracker data.')
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    const interval = setInterval(() => {
      if (risk?.nextDeadline) {
        setCountdown(getCountdown(risk.nextDeadline.date))
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  const statusLabels = {
    signed: 'Signed into Law',
    passed_both: 'Passed Both Chambers',
    passed_one: 'Passed One Chamber',
    committee: 'In Committee',
    introduced: 'Introduced',
    cr: 'Covered by CR',
    not_introduced: 'Not Yet Introduced',
    lapsed: 'Funding Lapsed'
  }

  const statusColors = {
    signed: '#16a34a',
    passed_both: '#2563eb',
    passed_one: '#7c3aed',
    committee: '#d97706',
    introduced: '#6b7280',
    cr: '#0891b2',
    not_introduced: '#9ca3af',
    lapsed: '#dc2626'
  }

  if (loading) {
    return (
      <div className="shutdown-tracker">
        <div className="shutdown-loading">
          <div className="loading-spinner"></div>
          <p>Loading shutdown tracker...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="shutdown-tracker">
        <div className="shutdown-error">
          <p>{error}</p>
          <button onClick={loadData} className="retry-btn">Retry</button>
        </div>
      </div>
    )
  }

  const bills = FUNDING_DEADLINES.appropriationsBills
  const billsSigned = bills.filter(b => b.status === 'signed').length
  const billsPassedBoth = bills.filter(b => b.status === 'passed_both').length
  const billsPassedOne = bills.filter(b => b.status === 'passed_one').length

  return (
    <div className="shutdown-tracker fadeInUp">
      <div className="shutdown-tracker__container">
        {/* Header */}
        <header className="shutdown-tracker__header">
          <h1>Government Shutdown Tracker</h1>
          <p>Tracking federal funding status and appropriations progress for FY{FUNDING_DEADLINES.fiscalYear}</p>
        </header>

        {/* Status Card */}
        {risk && (
          <section className="shutdown-status-card">
            <div className="status-card__header">
              <h2>Current Status</h2>
              <span className={`status-badge status-badge--${risk.level}`}>
                {risk.level.charAt(0).toUpperCase() + risk.level.slice(1)}
              </span>
            </div>
            <p className="status-card__summary">{risk.summary}</p>
            <div className="risk-meter">
              <div className="risk-meter__track">
                <div
                  className={`risk-meter__fill risk-meter__fill--${risk.level}`}
                  style={{ width: `${risk.score}%` }}
                ></div>
              </div>
              <div className="risk-meter__labels">
                <span>Low Risk</span>
                <span>High Risk</span>
              </div>
            </div>
          </section>
        )}

        {/* Countdown */}
        {countdown && risk?.nextDeadline && (
          <section className="shutdown-countdown">
            <h2>Next Funding Deadline</h2>
            <div className="countdown__display">
              {countdown.expired ? (
                <div className="countdown__expired">Deadline has passed</div>
              ) : (
                <div className="countdown__units">
                  <div className="countdown__unit">
                    <span className="countdown__number">{countdown.days}</span>
                    <span className="countdown__label">Days</span>
                  </div>
                  <div className="countdown__unit">
                    <span className="countdown__number">{countdown.hours}</span>
                    <span className="countdown__label">Hours</span>
                  </div>
                  <div className="countdown__unit">
                    <span className="countdown__number">{countdown.minutes}</span>
                    <span className="countdown__label">Minutes</span>
                  </div>
                </div>
              )}
            </div>
            <p className="countdown__description">
              <strong>{new Date(risk.nextDeadline.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>
              <br />
              {risk.nextDeadline.description}
            </p>
          </section>
        )}

        {/* Appropriations Bills Grid */}
        <section className="shutdown-bills">
          <h2>FY{FUNDING_DEADLINES.fiscalYear} Appropriations Bills</h2>
          <div className="bills-grid">
            {bills.map((bill, i) => (
              <div key={i} className="bill-card">
                <div className="bill-card__header">
                  <h3 className="bill-card__short">{bill.shortName}</h3>
                  <span
                    className="bill-card__status"
                    style={{ background: statusColors[bill.status] || '#9ca3af' }}
                  >
                    {statusLabels[bill.status] || bill.status}
                  </span>
                </div>
                <p className="bill-card__name">{bill.name}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Progress Summary */}
        <section className="shutdown-progress">
          <h2>Legislative Progress</h2>
          <div className="progress-stats">
            <div className="progress-stat">
              <span className="progress-stat__number">{billsSigned}</span>
              <span className="progress-stat__label">of 12 Signed into Law</span>
            </div>
            <div className="progress-stat">
              <span className="progress-stat__number">{billsPassedBoth}</span>
              <span className="progress-stat__label">of 12 Passed Both Chambers</span>
            </div>
            <div className="progress-stat">
              <span className="progress-stat__number">{billsPassedOne}</span>
              <span className="progress-stat__label">of 12 Passed One Chamber</span>
            </div>
          </div>
          <div className="progress-bar">
            <div className="progress-bar__track">
              <div className="progress-bar__fill" style={{ width: `${(billsSigned / 12) * 100}%` }}></div>
            </div>
            <span className="progress-bar__label">{billsSigned}/12 bills signed</span>
          </div>
        </section>

        {/* API-discovered bills */}
        {apiBills.length > 0 && (
          <section className="shutdown-api-bills">
            <h2>Related Appropriations Legislation</h2>
            <p className="section-note">Bills found via Congress.gov matching appropriations keywords</p>
            <div className="api-bills-list">
              {apiBills.slice(0, 10).map((bill, i) => (
                <div key={i} className="api-bill-item">
                  <span className="api-bill-item__type">{bill.type}{bill.number}</span>
                  <span className="api-bill-item__title">{bill.title}</span>
                  <span className="api-bill-item__action">{bill.latestAction?.text || 'No action'}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Historical Shutdowns Timeline */}
        <section className="shutdown-history">
          <h2>Historical Government Shutdowns</h2>
          <p className="section-note">{SHUTDOWN_HISTORY.length} shutdowns since 1976</p>
          <div className="history-timeline">
            {SHUTDOWN_HISTORY.map((shutdown, i) => {
              const start = new Date(shutdown.startDate + 'T00:00:00')
              const end = new Date(shutdown.endDate + 'T00:00:00')
              return (
                <div key={i} className="timeline-item">
                  <div className="timeline-connector">
                    <div className="timeline-dot"></div>
                    {i < SHUTDOWN_HISTORY.length - 1 && <div className="timeline-line"></div>}
                  </div>
                  <div className="timeline-content">
                    <div className="timeline-dates">
                      {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' '}&ndash;{' '}
                      {end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      <span className="timeline-duration">{shutdown.durationDays} day{shutdown.durationDays !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="timeline-details">
                      <strong>{shutdown.cause}</strong>
                      <p>{shutdown.description}</p>
                      <div className="timeline-meta">
                        <span>President: {shutdown.president}</span>
                        <span>House: {shutdown.controlHouse}</span>
                        <span>Senate: {shutdown.controlSenate}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

export default ShutdownTracker
