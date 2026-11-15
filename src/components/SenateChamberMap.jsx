import { useMemo, useState } from 'react'
import { countParties, partyLetter } from '../utils/partyLetter'
import { getFidelityInfo } from '../../shared/fidelity'
import '../styles/Chamber.css'

/**
 * SenateChamberMap: the 100-desk hemicycle.
 *
 * Renders the Senate floor as 4 concentric arcs of desks facing the rostrum
 * at the top of the chart. Each desk is a tinted rounded rectangle showing
 * the desk number + senator last name. Famous desks (Webster, Candy,
 * Jefferson Davis, etc.) get a small accent dot.
 *
 * Per /plan-design-review:
 *   - Tinted fills (10% opacity over white) per party
 *   - Saturated 1px border per party
 *   - Vacant desks: dashed border, no fill, "-" inside
 *   - Composition-only Congresses render as party-block hemicycle (no
 *     individual desks)
 *   - Mobile: compact hemicycle + tap-to-reveal (parent handles tap state)
 *
 * Props:
 *   desks      : Array<{desk_id, side, arc, position, famous_name,
 *                         assignment: {bioguide_id, ...} | null,
 *                         politician: {name, party, state, ...} | null}>
 *   fidelityTier: 'full' | 'partial' | 'composition_only'
 *   onDeskClick: (desk) => void
 *   onDeskHover: (desk | null) => void
 *   moment     : Optional historic moment in scope. When set, party tints
 *                  are REPLACED by vote-outcome tints (Yea/Nay/NotVoting)
 *                  per design decision D6. Shape:
 *                    { slug, title, votesByBioguide: Map<bioguide, 'Yea'|'Nay'|'NotVoting'> }
 *   isMobile   : boolean: render compact layout
 */

// Desk colours live in Chamber.css as party and vote classes on the desk
// group, so they follow the theme tokens (independents resolve to grey).

// Desk size and arc radii are chosen so no two desks overlap: neighbours on
// an arc are at least 50 units apart and the arcs are 64 apart.
const DESK_W = 36
const DESK_H = 32
const DESK_W_MOBILE = 30
const DESK_H_MOBILE = 30

const VIEWBOX_W = 1120
const VIEWBOX_TOP = 40
const VIEWBOX_H = 580
const CENTER_X = VIEWBOX_W / 2
const CENTER_Y = 80 // the rostrum sits above this; arcs sweep down from here

const ARC_RADII = {
  1: 320,
  2: 384,
  3: 448,
  4: 512,
}

const VOTE_CLASSES = { Yea: 'yea', Nay: 'nay', NotVoting: 'notvoting' }

// "Shaheen, Jeanne" and "Jeanne Shaheen" both give "Shaheen". A generational
// suffix is not a surname.
export function lastNameOf(name) {
  const text = String(name || '').trim()
  if (!text) return null
  if (text.includes(',')) return text.split(',')[0].trim()
  const words = text.split(/\s+/).filter((w) => !/^(jr|sr|ii|iii|iv)\.?$/i.test(w))
  return words[words.length - 1] || text
}

function partyOf(politician, assignment) {
  // Caucus override would live on member_congress_terms.caucus; for v1 we
  // prefer the politician.party which the migration-009 trigger keeps in sync.
  // Independents who caucus with a major party still render as 'I' here -
  // they're a distinct visual signal worth preserving.
  // The members table spells the party out ("Republican"); read any spelling.
  return partyLetter(politician?.party)
}

export function computeDeskPosition(desk, deskCountPerArc, sideCounts) {
  // Within arc `desk.arc`, this desk is at 1-indexed `position` of
  // `deskCountPerArc[arc]` total desks. Map to an angle 0..π and compute (x,y).
  const total = deskCountPerArc[desk.arc] ?? 1
  // The two sides of the centre aisle hold different numbers of desks, so each
  // side gets its own half of the arc: no desk sits on or across the aisle.
  const left = sideCounts?.[desk.arc]?.D ?? 0
  const right = sideCounts?.[desk.arc]?.R ?? 0
  let angle
  if (desk.side === 'D' && left > 0 && left + right === total) {
    angle = ((Math.PI / 2) * (desk.position - 0.5)) / left
  } else if (desk.side === 'R' && right > 0 && left + right === total) {
    angle = Math.PI / 2 + ((Math.PI / 2) * (desk.position - left - 0.5)) / right
  } else {
    // No side on record: spread evenly across the whole arc.
    angle = (Math.PI * (desk.position - 0.5)) / total
  }
  const radius = ARC_RADII[desk.arc] ?? 200
  const x = CENTER_X - radius * Math.cos(angle)
  const y = CENTER_Y + radius * Math.sin(angle)
  return { x, y }
}

function SenateChamberMap({
  desks = [],
  members = [],
  fidelityTier = 'full',
  onDeskClick,
  onDeskHover,
  moment = null,
  isMobile = false,
}) {
  const [focusedDeskId, setFocusedDeskId] = useState(null)

  // Group desks by arc and compute count per arc (handles partially-populated
  // arcs gracefully).
  const deskCountPerArc = useMemo(() => {
    const counts = {}
    for (const d of desks) {
      counts[d.arc] = (counts[d.arc] ?? 0) + 1
    }
    return counts
  }, [desks])

  const sideCounts = useMemo(() => {
    const counts = {}
    for (const d of desks) {
      if (d.side !== 'D' && d.side !== 'R') continue
      counts[d.arc] = counts[d.arc] ?? { D: 0, R: 0 }
      counts[d.arc][d.side] += 1
    }
    return counts
  }, [desks])

  const deskW = isMobile ? DESK_W_MOBILE : DESK_W
  const deskH = isMobile ? DESK_H_MOBILE : DESK_H

  // Composition-only Congresses skip individual-desk rendering.
  if (fidelityTier === 'composition_only') {
    return (
      <SenateCompositionOnlyHemicycle members={members} />
    )
  }

  return (
    <div className={`senate-chamber-map ${isMobile ? 'is-mobile' : ''}`}>
      <div className="rostrum-label">Rostrum</div>
      <svg
        viewBox={`0 ${VIEWBOX_TOP} ${VIEWBOX_W} ${VIEWBOX_H}`}
        role="application"
        aria-label={`Senate chamber, ${desks.length} desks`}
        className="senate-chamber-svg"
      >
        <title>Senate Chamber</title>

        {/* Subtle arc guide lines */}
        {Object.entries(ARC_RADII).map(([arc, radius]) => (
          <path
            key={`arc-${arc}`}
            d={describeArc(CENTER_X, CENTER_Y, radius, 0, Math.PI)}
            className="chamber-guide"
            strokeDasharray="2 4"
          />
        ))}

        {/* Vertical aisle */}
        <line
          x1={CENTER_X}
          y1={CENTER_Y + 20}
          x2={CENTER_X}
          y2={CENTER_Y + ARC_RADII[4] + 20}
          className="chamber-guide"
          strokeDasharray="3 6"
        />

        {/* Desks */}
        {desks.map((desk) => {
          const { x, y } = computeDeskPosition(desk, deskCountPerArc, sideCounts)
          const politician = desk.politician
          const assignment = desk.assignment
          const party = partyOf(politician, assignment)
          const vote = moment?.votesByBioguide?.get(assignment?.bioguide_id)
          const tone = vote
            ? `is-vote-${(VOTE_CLASSES[vote] ?? 'notvoting')}`
            : party
              ? `is-party-${party.toLowerCase()}`
              : ''

          const isVacant = !assignment?.bioguide_id
          const isFocused = focusedDeskId === desk.desk_id
          const lastName = lastNameOf(politician?.name)

          return (
            <g
              key={desk.desk_id}
              transform={`translate(${x - deskW / 2}, ${y - deskH / 2})`}
              role="button"
              tabIndex={0}
              aria-label={buildDeskLabel(desk, politician, vote)}
              className={`chamber-desk ${tone} ${isFocused ? 'is-focused' : ''} ${isVacant ? 'is-vacant' : ''}`}
              onClick={() => onDeskClick?.(desk)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onDeskClick?.(desk)
                }
              }}
              onMouseEnter={() => {
                setFocusedDeskId(desk.desk_id)
                onDeskHover?.(desk)
              }}
              onMouseLeave={() => {
                setFocusedDeskId(null)
                onDeskHover?.(null)
              }}
              onFocus={() => {
                setFocusedDeskId(desk.desk_id)
                onDeskHover?.(desk)
              }}
              onBlur={() => {
                setFocusedDeskId(null)
                onDeskHover?.(null)
              }}
            >
              {/* Invisible hit-area expansion to at least 44×44 on mobile */}
              {isMobile && (
                <rect
                  x={(deskW - 44) / 2}
                  y={(deskH - 44) / 2}
                  width={44}
                  height={44}
                  fill="transparent"
                />
              )}

              {/* Desk shape */}
              <rect
                className="desk-shape"
                width={deskW}
                height={deskH}
                rx={4}
                ry={4}
              />

              {/* Famous-desk accent dot */}
              {desk.famous_name && !isMobile && (
                <circle
                  className="desk-famous-dot"
                  cx={deskW - 5}
                  cy={5}
                  r={3}
                />
              )}

              {/* Desk number */}
              {!isMobile && (
                <text
                  x={deskW / 2}
                  y={12}
                  textAnchor="middle"
                  className="desk-number"
                >
                  {desk.desk_id}
                </text>
              )}

              {/* Senator last name (desktop). A vacant desk is the dashed
                  outline alone. On a phone the desk is a mark only: the
                  readout under the map names the desk. */}
              {!isMobile && !isVacant && lastName && (
                <text
                  x={deskW / 2}
                  y={25}
                  textAnchor="middle"
                  className="desk-name"
                >
                  {truncateName(lastName, 8)}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* Fidelity caveat banner: only renders if NOT 'full' */}
      {fidelityTier !== 'full' && (
        <div className="chamber-fidelity-banner" role="status">
          <span
            className={`chamber-fidelity-dot is-tier-${fidelityTier}`}
            aria-hidden="true"
          />
          {getFidelityInfo(fidelityTier).caveat}
        </div>
      )}
    </div>
  )
}

/**
 * Renders a stripped-down hemicycle of party-block dots for Congresses
 * with fidelity_tier='composition_only' (no desk-level data). Honest
 * fallback per design review D5.
 */
function SenateCompositionOnlyHemicycle({ members = [] }) {
  // Counted from the members who served, never from desk positions.
  const counts = countParties(members)
  const groups = [
    { key: 'd', label: 'Democrats', count: counts.D },
    { key: 'i', label: 'Independents', count: counts.I },
    { key: 'r', label: 'Republicans', count: counts.R },
  ].filter((g) => g.count > 0)

  return (
    <div className="senate-composition-only">
      <p className="composition-banner">
        Desk assignments are not available for this Congress.
        Showing party composition only.
      </p>
      {counts.total === 0 ? (
        <p className="composition-banner">No senators are on record for this Congress yet.</p>
      ) : (
        <>
          <div className="composition-hemicycle">
            {groups.map((g) => (
              <div key={g.key} className={`composition-half composition-${g.key}`}>
                <div className="composition-dots">
                  {Array.from({ length: g.count }).map((_, i) => (
                    <span key={i} className={`composition-dot composition-dot-${g.key}`} aria-hidden="true" />
                  ))}
                </div>
                <div className="composition-label">
                  {g.label} <span className="composition-count">{g.count}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="composition-note">
            {counts.total} senators have served in this Congress. That counts
            anyone who left or arrived mid-term, so it can be more than 100.
          </p>
        </>
      )}
    </div>
  )
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  // SVG arc path for a half-circle below center.
  const x1 = cx - r * Math.cos(startAngle)
  const y1 = cy + r * Math.sin(startAngle)
  const x2 = cx - r * Math.cos(endAngle)
  const y2 = cy + r * Math.sin(endAngle)
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`
}

function truncateName(name, maxLen) {
  if (!name) return ''
  if (name.length <= maxLen) return name
  return name.slice(0, maxLen - 1) + '…'
}

function buildDeskLabel(desk, politician, vote) {
  const base = `Desk ${desk.desk_id}`
  const famous = desk.famous_name ? ` (${desk.famous_name})` : ''
  if (!politician) {
    return `${base}${famous}, currently unassigned. Click to view desk history.`
  }
  const voteStr = vote ? `, voted ${vote}` : ''
  const partyState = `${partyLetter(politician.party) || politician.party}-${politician.state}`
  return `${base}${famous}, Senator ${politician.name} (${partyState})${voteStr}. Click to view desk history.`
}

export default SenateChamberMap
