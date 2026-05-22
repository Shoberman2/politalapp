import { useMemo } from 'react'

/**
 * HouseCompositionMap — honest party-block hemicycle for the U.S. House.
 *
 * THIS COMPONENT INTENTIONALLY DOES NOT FAKE INDIVIDUAL SEAT ASSIGNMENTS.
 * The U.S. House of Representatives does not have assigned seats; members
 * sit anywhere within their party's section. Showing fictional per-seat
 * positions would contradict DESIGN.md's "editorial trust" principle.
 *
 * What this chart does show:
 *   - Total composition (party counts)
 *   - Spatial party-block organization (D side, R side, Vacant)
 *   - Per-Congress fidelity (when data is missing, shows banner)
 *
 * Per /plan-design-review token table for House composition page.
 *
 * Props:
 *   members       — Array of member_congress_terms rows for this Congress
 *                    (one per current member, deduped by bioguide_id)
 *   isMobile      — boolean
 */

function HouseCompositionMap({ members = [], isMobile = false }) {
  const counts = useMemo(() => {
    const c = { D: 0, R: 0, I: 0, V: 0, total: 0 }
    for (const m of members) {
      const p = (m.caucus || m.party || '').toUpperCase()
      if (p === 'D') c.D += 1
      else if (p === 'R') c.R += 1
      else if (p === 'I') c.I += 1
      else c.V += 1
      c.total += 1
    }
    return c
  }, [members])

  // Layout 435 dots in a 30×15 grid (450 slots; ~15 unused for vacancies and
  // editorial spacing). Per design review Pass 5 token table.
  const cols = isMobile ? 15 : 30
  const totalSlots = 435
  const rows = Math.ceil(totalSlots / cols)

  // Order members for grid placement: D on the left, then I, then R on the right.
  const orderedDots = useMemo(() => {
    const dots = []
    for (let i = 0; i < counts.D; i++) dots.push({ party: 'D', idx: i })
    for (let i = 0; i < counts.I; i++) dots.push({ party: 'I', idx: i })
    for (let i = 0; i < counts.R; i++) dots.push({ party: 'R', idx: i })
    while (dots.length < totalSlots) dots.push({ party: 'V', idx: dots.length })
    return dots
  }, [counts])

  return (
    <div className={`house-composition-map ${isMobile ? 'is-mobile' : ''}`}>
      {/* Editorial disclosure banner per design review Pass 5 */}
      <div className="house-composition-disclosure">
        <em>
          House seating is open. Representatives sit anywhere within their
          party's section. The chart shows party composition; positions are
          illustrative.
        </em>
      </div>

      <div className="house-composition-totals" aria-live="polite">
        <span className="house-composition-total-r">
          {counts.R} R
        </span>
        <span className="house-composition-separator">·</span>
        <span className="house-composition-total-d">
          {counts.D} D
        </span>
        {counts.I > 0 && (
          <>
            <span className="house-composition-separator">·</span>
            <span className="house-composition-total-i">{counts.I} I</span>
          </>
        )}
        {counts.V > 0 && (
          <>
            <span className="house-composition-separator">·</span>
            <span className="house-composition-total-v">
              {counts.V} vacant
            </span>
          </>
        )}
        <span className="house-composition-separator">·</span>
        <span className="house-composition-total-all">
          {counts.total} total
        </span>
      </div>

      <div
        className="house-composition-grid"
        role="img"
        aria-label={`House composition: ${counts.R} Republicans, ${counts.D} Democrats, ${counts.I} Independents, ${counts.V} vacant`}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
        }}
      >
        {orderedDots.map((dot, i) => (
          <span
            key={i}
            className={`house-composition-dot house-composition-dot-${dot.party.toLowerCase()}`}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  )
}

export default HouseCompositionMap
