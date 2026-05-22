import { useEffect, useRef, useState, useCallback } from 'react'
import { CONGRESS_MIN, CONGRESS_MAX } from '../utils/congressUtil'
import { fidelityDotColor } from '../../shared/fidelity'

/**
 * ChamberScrubber — horizontal slider over Congresses 93rd-119th.
 *
 * Per /plan-design-review D4 (inline editorial hint that auto-dismisses)
 * and Pass 6 (responsive + accessibility).
 *
 * Props:
 *   congress              — currently-selected Congress number
 *   onCongressChange      — (newCongress) => void
 *   metadataByCongress    — Map<congress, {fidelity_tier, ...}> for tick coloring
 *   isMobile              — boolean
 */

const SCRUBBER_HINT_STORAGE_KEY = 'chamber_scrubber_taught_v1'
const HINT_FADE_MS = 400

function ChamberScrubber({
  congress,
  onCongressChange,
  metadataByCongress,
  isMobile = false,
}) {
  const trackRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [hintFadingOut, setHintFadingOut] = useState(false)

  // Show the editorial hint on first visit; dismiss after first successful scrub.
  useEffect(() => {
    try {
      if (!window.localStorage.getItem(SCRUBBER_HINT_STORAGE_KEY)) {
        setShowHint(true)
      }
    } catch {
      // localStorage unavailable (private browsing) — leave the hint hidden.
    }
  }, [])

  const dismissHint = useCallback(() => {
    if (!showHint || hintFadingOut) return
    setHintFadingOut(true)
    setTimeout(() => {
      setShowHint(false)
      try {
        window.localStorage.setItem(SCRUBBER_HINT_STORAGE_KEY, '1')
      } catch {
        // ignore
      }
    }, HINT_FADE_MS)
  }, [showHint, hintFadingOut])

  const handleCongressChange = useCallback(
    (next) => {
      const clamped = Math.max(CONGRESS_MIN, Math.min(CONGRESS_MAX, next))
      if (clamped !== congress) {
        onCongressChange?.(clamped)
        dismissHint()
      }
    },
    [congress, onCongressChange, dismissHint]
  )

  const computeCongressFromClientX = useCallback((clientX) => {
    const track = trackRef.current
    if (!track) return congress
    const rect = track.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(CONGRESS_MIN + ratio * (CONGRESS_MAX - CONGRESS_MIN))
  }, [congress])

  const handlePointerDown = (e) => {
    setDragging(true)
    handleCongressChange(computeCongressFromClientX(e.clientX))
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e) => {
    if (!dragging) return
    handleCongressChange(computeCongressFromClientX(e.clientX))
  }

  const handlePointerUp = (e) => {
    setDragging(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault()
        handleCongressChange(congress - 1)
        break
      case 'ArrowRight':
        e.preventDefault()
        handleCongressChange(congress + 1)
        break
      case 'PageDown':
        e.preventDefault()
        handleCongressChange(congress - 4)
        break
      case 'PageUp':
        e.preventDefault()
        handleCongressChange(congress + 4)
        break
      case 'Home':
        e.preventDefault()
        handleCongressChange(CONGRESS_MIN)
        break
      case 'End':
        e.preventDefault()
        handleCongressChange(CONGRESS_MAX)
        break
      default:
        break
    }
  }

  const range = CONGRESS_MAX - CONGRESS_MIN
  const markerLeftPct = ((congress - CONGRESS_MIN) / range) * 100

  // Render year-tick labels every 4 Congresses.
  const ticks = []
  for (let c = CONGRESS_MIN; c <= CONGRESS_MAX; c += 4) {
    ticks.push(c)
  }
  if (ticks[ticks.length - 1] !== CONGRESS_MAX) ticks.push(CONGRESS_MAX)

  return (
    <div className={`chamber-scrubber ${isMobile ? 'is-mobile' : ''}`}>
      <div className="chamber-scrubber-caption">
        <em>Scrub years</em>
      </div>
      <div
        ref={trackRef}
        className={`chamber-scrubber-track ${dragging ? 'is-dragging' : ''}`}
        role="slider"
        tabIndex={0}
        aria-valuemin={CONGRESS_MIN}
        aria-valuemax={CONGRESS_MAX}
        aria-valuenow={congress}
        aria-valuetext={`${congress}th Congress`}
        aria-label="Congress year scrubber"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        <div className="chamber-scrubber-rail" />

        {/* Fidelity-tier ticks per Congress (subtle dot below the track) */}
        <div className="chamber-scrubber-fidelity-row">
          {Array.from({ length: range + 1 }).map((_, idx) => {
            const c = CONGRESS_MIN + idx
            const meta = metadataByCongress?.get(c)
            const tier = meta?.fidelity_tier ?? 'composition_only'
            return (
              <span
                key={c}
                className="chamber-scrubber-fidelity-dot"
                style={{
                  left: `${(idx / range) * 100}%`,
                  backgroundColor: fidelityDotColor(tier),
                }}
                title={`${c}th Congress: ${tier.replace('_', ' ')}`}
              />
            )
          })}
        </div>

        {/* Year-tick labels (every 4th Congress) */}
        <div className="chamber-scrubber-tick-row">
          {ticks.map((c) => (
            <span
              key={c}
              className="chamber-scrubber-tick"
              style={{ left: `${((c - CONGRESS_MIN) / range) * 100}%` }}
            >
              {c}
            </span>
          ))}
        </div>

        {/* Current-Congress marker */}
        <div
          className="chamber-scrubber-marker"
          style={{ left: `${markerLeftPct}%` }}
          aria-hidden="true"
        >
          <span className="chamber-scrubber-marker-label">{congress}</span>
        </div>
      </div>

      {/* Inline editorial hint — auto-dismisses after first interaction */}
      {showHint && (
        <div
          className={`chamber-scrubber-hint ${hintFadingOut ? 'is-fading-out' : ''}`}
          aria-hidden="true"
        >
          <em>Drag the marker to change Congress, or click any year.</em>
        </div>
      )}
    </div>
  )
}

export default ChamberScrubber
