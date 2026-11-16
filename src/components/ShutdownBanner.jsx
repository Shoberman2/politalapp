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

  // The deadlines are a hand-kept list (services/shutdown.js). Once the last
  // one has passed the list is stale, and the banner would announce a shutdown
  // it cannot know about. Say nothing instead.
  if (countdown?.expired) return null

  const countdownText = countdown ? `${countdown.days}d ${countdown.hours}h until the funding deadline` : ''

  return (
    <div className={`shutdown-banner shutdown-banner--${risk.level}`}>
      <div className="shutdown-banner__content">
        <span className="shutdown-banner__text">
          <strong title="A government shutdown happens when Congress fails to pass funding bills by the deadline, forcing federal agencies to close or reduce operations.">Shutdown risk: <span className="shutdown-banner__level">{risk.level}</span></strong>
          {countdownText && <span className="shutdown-banner__countdown">{countdownText}</span>}
        </span>
        <Link to="/shutdown-tracker" className="shutdown-banner__link">Details</Link>
        <button className="shutdown-banner__dismiss" onClick={handleDismiss} aria-label="Dismiss banner">&times;</button>
      </div>
    </div>
  )
}

export default ShutdownBanner
