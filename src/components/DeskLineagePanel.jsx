import { useEffect, useRef, useState } from 'react'
import { getLineageForDesk } from '../services/senateDesks'

/**
 * DeskLineagePanel — slide-in drawer (desktop) / modal (mobile) showing the
 * lineage of senators who have held a given desk.
 *
 * Per /plan-design-review D3 (slide-in drawer from right at ≥1024px;
 * centered modal at <1024px) and Pass 5 token table.
 *
 * Props:
 *   desk       — {desk_id, famous_name, ...} or null. When null, panel is closed.
 *   politician — Current senator at this desk (for the "current" row), or null.
 *   onClose    — () => void
 *   isMobile   — boolean
 */

function DeskLineagePanel({ desk, politician, onClose, isMobile = false }) {
  const [lineage, setLineage] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const panelRef = useRef(null)
  const previouslyFocusedElement = useRef(null)

  // Load lineage when desk changes.
  useEffect(() => {
    if (!desk) {
      setLineage([])
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getLineageForDesk(desk.desk_id)
      .then((rows) => {
        if (cancelled) return
        setLineage(rows)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message ?? 'Failed to load lineage')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [desk?.desk_id])

  // Focus trap + return-focus on close.
  useEffect(() => {
    if (!desk) {
      // Return focus on close.
      if (previouslyFocusedElement.current) {
        previouslyFocusedElement.current.focus()
        previouslyFocusedElement.current = null
      }
      return
    }
    previouslyFocusedElement.current = document.activeElement
    if (panelRef.current) {
      panelRef.current.focus()
    }

    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
      }
    }
    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [desk, onClose])

  if (!desk) return null

  return (
    <>
      <div
        className="chamber-drawer-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`chamber-drawer ${isMobile ? 'is-modal' : 'is-slide-in'}`}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
      >
        <button
          type="button"
          className="chamber-drawer-close"
          onClick={onClose}
          aria-label="Close desk history"
        >
          ×
        </button>

        <div className="chamber-drawer-header">
          <h2 id="drawer-title" className="chamber-drawer-title">
            Desk {desk.desk_id}
          </h2>
          {desk.famous_name && (
            <div className="chamber-drawer-subtitle">
              <em>{desk.famous_name}</em>
            </div>
          )}
          {desk.description && (
            <p className="chamber-drawer-description">{desk.description}</p>
          )}
        </div>

        <div className="chamber-drawer-body">
          {/* Current occupant section */}
          {politician && (
            <div className="chamber-drawer-current">
              <h3 className="chamber-drawer-section-heading">Current senator</h3>
              <div className="chamber-drawer-row">
                <div className="chamber-drawer-row-name">{politician.name}</div>
                <div className="chamber-drawer-row-meta">
                  {politician.party}-{politician.state}
                </div>
              </div>
            </div>
          )}

          {/* Lineage section */}
          <div className="chamber-drawer-lineage">
            <h3 className="chamber-drawer-section-heading">Through this desk</h3>
            {loading && (
              <div className="chamber-drawer-loading">Loading history…</div>
            )}
            {error && (
              <div className="chamber-drawer-error">
                Couldn't load lineage. <button onClick={() => { setError(null); }}>Try again</button>
              </div>
            )}
            {!loading && !error && lineage.length === 0 && (
              <div className="chamber-drawer-empty">
                <em>
                  No prior occupants recorded. This desk's history begins with the current senator.
                </em>
              </div>
            )}
            {!loading && !error && lineage.length > 0 && (
              <ol className="chamber-drawer-lineage-list">
                {lineage
                  .slice()
                  .reverse() // most-recent first
                  .map((row) => (
                    <li
                      key={`${row.desk_id}-${row.year_start}`}
                      className={`chamber-drawer-lineage-row ${row.bioguide_id ? '' : 'is-vacancy'}`}
                    >
                      <div className="chamber-drawer-row-name">
                        {row.occupant_name ?? (
                          <em>Vacant</em>
                        )}
                      </div>
                      <div className="chamber-drawer-row-years">
                        {row.year_start}{row.year_end ? `–${row.year_end}` : '–present'}
                      </div>
                      {row.party && row.state && (
                        <div className="chamber-drawer-row-party">
                          {row.party}-{row.state}
                        </div>
                      )}
                      {row.notes && (
                        <div className="chamber-drawer-row-notes">{row.notes}</div>
                      )}
                    </li>
                  ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default DeskLineagePanel
