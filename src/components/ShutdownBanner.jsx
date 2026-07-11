import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { calculateShutdownRisk, getCountdown } from '../services/shutdown'
import '../styles/ShutdownBanner.css'

function ShutdownBanner() {
  const [risk, setRisk] = useState(null)
  const [countdown, setCountdown] = useState(null)
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('shutdownBannerDismissed') === 'true')

  useEffect(() => {
    // Calculate risk from hardcoded data immediately
    const initialRisk = calculateShutdownRisk()
    setRisk(initialRisk)

    if (initialRisk.nextDeadline) {
      setCountdown(getCountdown(initialRisk.nextDeadline.date))
    }

    // Update countdown every 60 seconds
    const interval = setInterval(() => {
      if (initialRisk.nextDeadline) {
        setCountdown(getCountdown(initialRisk.nextDeadline.date))
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  const handleDismiss = () => {
    setDismissed(true)
    sessionStorage.setItem('shutdownBannerDismissed', 'true')
  }

  if (dismissed || !risk) return null

  const levelIcons = {
    funded: '\u2705',
    low: '\u2139\uFE0F',
    moderate: '\u26A0\uFE0F',
    high: '\u26A0\uFE0F',
    critical: '\uD83D\uDEA8',
    shutdown: '\uD83D\uDED1'
  }

  const countdownText = countdown && !countdown.expired
    ? `${countdown.days}d ${countdown.hours}h until deadline`
    : countdown?.expired
      ? 'Deadline has passed'
      : ''

  return (
    <div className={`shutdown-banner shutdown-banner--${risk.level}`}>
      <div className="shutdown-banner__content">
        <span className="shutdown-banner__icon">{levelIcons[risk.level] || '\u2139\uFE0F'}</span>
        <span className="shutdown-banner__text">
          <strong title="A government shutdown happens when Congress fails to pass funding bills by the deadline, forcing federal agencies to close or reduce operations.">Gov't Shutdown Risk: {risk.level.charAt(0).toUpperCase() + risk.level.slice(1)}</strong>
          {countdownText && <span className="shutdown-banner__countdown"> &mdash; {countdownText}</span>}
        </span>
        <Link to="/shutdown-tracker" className="shutdown-banner__link">Details</Link>
        <button className="shutdown-banner__dismiss" onClick={handleDismiss} aria-label="Dismiss banner">&times;</button>
      </div>
    </div>
  )
}

export default ShutdownBanner
