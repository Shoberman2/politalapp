import { useMemo } from 'react'
import { countParties } from '../utils/partyLetter'

/**
 * HouseCompositionMap: honest party-block hemicycle for the U.S. House.
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
 *   members      : Array of member_congress_terms rows for this Congress
 *                    (one per current member, deduped by bioguide_id)
 *   isMobile     : boolean
 */

function HouseCompositionMap({ members = [], isMobile = false }) {
  const counts = useMemo(() => countParties(members), [members])

  // One dot per member who has served in this Congress: D on the left, then
  // I, then R, then anyone whose party the record does not list. The list
  // includes non-voting delegates and members who left mid-term, so it can
  // run past 435; no dot stands for a vacancy, because the record does not
  // say which seats are empty.
  const cols = isMobile ? 15 : 30

  const orderedDots = useMemo(() => {
    const dots = []
    for (let i = 0; i < counts.D; i++) dots.push({ party: 'D', idx: dots.length })
    for (let i = 0; i < counts.I; i++) dots.push({ party: 'I', idx: dots.length })
    for (let i = 0; i < counts.R; i++) dots.push({ party: 'R', idx: dots.length })
    for (let i = 0; i < counts.unlisted; i++) dots.push({ party: 'V', idx: dots.length })
    return dots
  }, [counts])

  return (
    <div className={`house-composition-map ${isMobile ? 'is-mobile' : ''}`}>
      {/* Editorial disclosure banner per design review Pass 5 */}
      <p className="house-composition-disclosure">
        House seating is open. Representatives sit anywhere within their
        party's section. The chart shows party composition; positions are
        illustrative.
      </p>

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
        {counts.unlisted > 0 && (
          <>
            <span className="house-composition-separator">·</span>
            <span className="house-composition-total-v">
              {counts.unlisted} party not listed
            </span>
          </>
        )}
      </div>
      <p className="house-composition-note">
        {counts.total} members have served in this Congress. That counts
        non-voting delegates and anyone who left or arrived mid-term, so it
        can be more than the 435 voting seats.
      </p>

      <div
        className="house-composition-grid"
        role="img"
        aria-label={`House composition: ${counts.R} Republicans, ${counts.D} Democrats, ${counts.I} Independents${counts.unlisted ? `, ${counts.unlisted} with no party listed` : ''}`}
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
