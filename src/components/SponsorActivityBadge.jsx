import { useEffect, useState } from 'react'
import { getSponsorActivity } from '../services/billsDb'
import { InfoTip } from './Tooltip'
import '../styles/SponsorActivityBadge.css'

/**
 * Sponsor activity badge on PoliticianDetail (per cherry-pick D6, reframed
 * per outside-voice D17: count + chamber median, no percentile).
 *
 * Position: top stats block, single line directly below identity row.
 * Behind VITE_BILLS_SHOW_SPONSOR_FILTER (same flag as the BillsPage pills —
 * both surfaces depend on the same sponsor data being persisted).
 */
export default function SponsorActivityBadge({ bioguideId, congress = 119 }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!bioguideId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getSponsorActivity(bioguideId, congress)
      .then((d) => {
        if (cancelled) return
        setData(d)
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('[SponsorActivityBadge] failed:', err)
        setError(err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [bioguideId, congress])

  if (loading) {
    return (
      <div className="sponsor-badge sponsor-badge-loading">
        Loading sponsor activity…
      </div>
    )
  }
  if (error || !data) {
    // Silent failure — don't show a broken-looking badge.
    return null
  }

  const congressLabel = `${congress}th Congress`

  // Empty state
  if (data.count === 0) {
    return (
      <div className="sponsor-badge">
        <dl className="sponsor-badge-dl">
          <dt className="visually-hidden">Bills introduced this Congress</dt>
          <dd className="sponsor-badge-empty">
            Has not introduced any bills this {congressLabel}.
          </dd>
        </dl>
      </div>
    )
  }

  // Freshman: count shown, median row hidden, footnote explains.
  const isFreshman = !data.chamberMedian

  return (
    <div className="sponsor-badge">
      <dl className="sponsor-badge-dl">
        <dt className="visually-hidden">Bills introduced this Congress</dt>
        <dd className="sponsor-badge-stat">
          Introduced{' '}
          <span className="sponsor-badge-number">{data.count}</span>{' '}
          bill{data.count !== 1 ? 's' : ''} this {congressLabel}.
          {!isFreshman && (
            <>
              {' '}
              <span className="sponsor-badge-median">
                {data.chamber === 'senate' ? 'Senate' : 'House'} median:{' '}
                <span className="sponsor-badge-number-small">{data.chamberMedian}</span>.
              </span>
            </>
          )}
        </dd>
      </dl>
      <small className="sponsor-badge-methodology">
        <InfoTip text="Bill count includes messaging bills and resolutions. Effectiveness not measured.">
          {data.methodology}
        </InfoTip>
      </small>
      {isFreshman && (
        <small className="sponsor-badge-methodology">
          Comparison hidden — fewer than 30 days served.
        </small>
      )}
    </div>
  )
}
