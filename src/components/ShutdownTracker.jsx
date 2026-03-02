import { useState, useEffect } from 'react'
import {
  calculateShutdownRisk,
  getCountdown,
  FUNDING_DEADLINES,
  SHUTDOWN_HISTORY,
  RISK_EXPLAINERS,
  fetchAppropriationsBills
} from '../services/shutdown'
import { InfoTip } from './Tooltip'
import SEO from './SEO'
import '../styles/ShutdownTracker.css'

function ShutdownTracker() {
  const [risk, setRisk] = useState(null)
  const [countdown, setCountdown] = useState(null)
  const [apiBills, setApiBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedBill, setExpandedBill] = useState(null)

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

  const statusTooltips = {
    signed: 'This bill has been passed by Congress and signed by the President into law.',
    passed_both: 'Passed both the House and Senate. Awaiting the President\'s signature.',
    passed_one: 'Passed either the House or Senate. Still needs to pass the other chamber.',
    committee: 'Being reviewed by a congressional committee before a full vote.',
    introduced: 'Formally submitted to Congress but not yet reviewed by a committee.',
    cr: 'Covered by a Continuing Resolution — a temporary measure that funds the government at last year\'s spending levels.',
    not_introduced: 'No bill has been introduced yet for this area of spending.',
    lapsed: 'Funding has expired. This part of the government is unfunded.'
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

  const billsCR = bills.filter(b => b.status === 'cr').length

  return (
    <div className="shutdown-tracker fadeInUp">
      <SEO
        title="Government Shutdown Tracker"
        description="Track the current risk of a U.S. government shutdown. View funding deadlines, appropriations bill status, and shutdown history."
        path="/shutdown-tracker"
      />
      <div className="shutdown-tracker__container">
        {/* Header */}
        <header className="shutdown-tracker__header">
          <h1>Government Shutdown Tracker</h1>
          <p>Tracking federal funding status and <InfoTip text="Appropriations bills are the 12 annual spending bills Congress must pass to fund the federal government. If they aren't passed by the deadline, the government shuts down.">appropriations</InfoTip> progress for <InfoTip text="Fiscal Year — the federal government's budget year, which runs from October 1 to September 30.">FY{FUNDING_DEADLINES.fiscalYear}</InfoTip></p>
          {FUNDING_DEADLINES.lastUpdated && (
            <div className="last-updated">
              Last updated: {new Date(FUNDING_DEADLINES.lastUpdated + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          )}
        </header>

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
                  <span className="countdown__separator">:</span>
                  <div className="countdown__unit">
                    <span className="countdown__number">{countdown.hours}</span>
                    <span className="countdown__label">Hours</span>
                  </div>
                  <span className="countdown__separator">:</span>
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
            <div className="countdown__explainer">
              A funding deadline is the date by which Congress must pass spending bills or a continuing resolution to keep the federal government open. If no funding legislation is enacted by this date, federal agencies that haven't been funded must cease non-essential operations — a government shutdown. Essential services like the military and law enforcement continue, but hundreds of thousands of federal workers may be furloughed or forced to work without pay until Congress acts.
            </div>
          </section>
        )}

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
            {RISK_EXPLAINERS[risk.level] && (
              <div className="risk-explainer">
                <strong>What does this mean?</strong> {RISK_EXPLAINERS[risk.level]}
              </div>
            )}
          </section>
        )}

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
              <InfoTip tag="span" text="The House of Representatives and the Senate are the two chambers of Congress. A bill must pass both to become law." className="progress-stat__label">Passed Both Chambers</InfoTip>
            </div>
            <div className="progress-stat">
              <span className="progress-stat__number">{billsPassedOne}</span>
              <InfoTip tag="span" text="This bill has passed either the House or the Senate, but still needs to pass the other chamber." className="progress-stat__label">Passed One Chamber</InfoTip>
            </div>
            <div className="progress-stat">
              <span className="progress-stat__number">{billsCR}</span>
              <InfoTip tag="span" text="A Continuing Resolution (CR) is a temporary funding measure that keeps the government running at previous spending levels when full appropriations bills haven't been passed by the deadline." className="progress-stat__label">Covered by CR</InfoTip>
            </div>
          </div>
          <div className="progress-bar">
            <div className="progress-bar__track">
              <div className="progress-bar__fill" style={{ width: `${(billsSigned / 12) * 100}%` }}></div>
            </div>
            <span className="progress-bar__label">{billsSigned}/12 bills signed</span>
          </div>
        </section>

        {/* Appropriations Bills Grid */}
        <section className="shutdown-bills">
          <h2>FY{FUNDING_DEADLINES.fiscalYear} <InfoTip text="The 12 annual spending bills that Congress must pass to fund every federal agency and program.">Appropriations Bills</InfoTip></h2>
          <div className="approp-bills-grid">
            {bills.map((bill, i) => (
              <div
                key={i}
                className={`approp-bill-card approp-bill-card--${bill.status} ${expandedBill === i ? 'approp-bill-card--expanded' : ''}`}
                onClick={() => setExpandedBill(expandedBill === i ? null : i)}
              >
                <div className="approp-bill-card__header">
                  <h3 className="approp-bill-card__short">{bill.shortName}</h3>
                  <span
                    className="approp-bill-card__status"
                    style={{ background: statusColors[bill.status] || '#9ca3af' }}
                    title={statusTooltips[bill.status] || ''}
                  >
                    {statusLabels[bill.status] || bill.status}
                  </span>
                </div>
                <p className="approp-bill-card__name">{bill.name}</p>
                {expandedBill === i && (
                  <div className="approp-bill-card__details">
                    {bill.fundingAmount && (
                      <div className="approp-bill-card__funding">
                        <span className="approp-bill-card__funding-label">FY{FUNDING_DEADLINES.fiscalYear} Funding</span>
                        <span className="approp-bill-card__funding-amount">{bill.fundingAmount}</span>
                      </div>
                    )}
                    {bill.description && (
                      <p className="approp-bill-card__desc">{bill.description}</p>
                    )}
                  </div>
                )}
                <span className={`approp-bill-card__toggle ${expandedBill === i ? 'approp-bill-card__toggle--open' : ''}`}>&#9662;</span>
              </div>
            ))}
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

        {/* Funding Deadline Timeline */}
        <section className="shutdown-deadlines">
          <h2>FY{FUNDING_DEADLINES.fiscalYear} Funding Deadlines</h2>
          <div className="deadlines-timeline">
            {FUNDING_DEADLINES.deadlines.map((deadline, i) => (
              <div key={i} className={`deadline-item deadline-item--${deadline.status}`}>
                <div className="deadline-connector">
                  <div className={`deadline-dot deadline-dot--${deadline.status}`}></div>
                  {i < FUNDING_DEADLINES.deadlines.length - 1 && <div className="deadline-line"></div>}
                </div>
                <div className="deadline-content">
                  <span className="deadline-date">
                    {new Date(deadline.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className={`deadline-status-tag deadline-status-tag--${deadline.status}`}>
                    {deadline.status === 'passed' ? 'Passed' : deadline.status === 'active' ? 'Active' : 'Upcoming'}
                  </span>
                  <p className="deadline-desc">{deadline.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Historical Shutdowns Timeline */}
        <section className="shutdown-history">
          <h2>Historical Government Shutdowns</h2>
          <p className="section-note">{SHUTDOWN_HISTORY.length} shutdowns since 1976</p>
          <div className="history-timeline">
            {SHUTDOWN_HISTORY.map((shutdown, i) => {
              const start = new Date(shutdown.startDate + 'T00:00:00')
              const end = new Date(shutdown.endDate + 'T00:00:00')
              const isLong = shutdown.durationDays >= 10
              return (
                <div key={i} className={`timeline-item ${isLong ? 'timeline-item--major' : ''}`}>
                  <div className="timeline-connector">
                    <div className={`timeline-dot ${isLong ? 'timeline-dot--major' : ''}`}></div>
                    {i < SHUTDOWN_HISTORY.length - 1 && <div className="timeline-line"></div>}
                  </div>
                  <div className="timeline-content">
                    <div className="timeline-dates">
                      {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' '}&ndash;{' '}
                      {end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      <span className={`timeline-duration ${isLong ? 'timeline-duration--major' : ''}`}>
                        {shutdown.durationDays} day{shutdown.durationDays !== 1 ? 's' : ''}
                      </span>
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
