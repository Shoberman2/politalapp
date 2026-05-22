import { useMemo, useState } from 'react'
import { fidelityDotColor, getFidelityInfo } from '../../shared/fidelity'
import '../styles/Chamber.css'

/**
 * SenateChamberMap — the 100-desk hemicycle.
 *
 * Renders the Senate floor as 4 concentric arcs of desks facing the rostrum
 * at the top of the chart. Each desk is a tinted rounded rectangle showing
 * the desk number + senator last name. Famous desks (Webster, Candy,
 * Jefferson Davis, etc.) get a small accent dot.
 *
 * Per /plan-design-review:
 *   - Tinted fills (10% opacity over white) per party
 *   - Saturated 1px border per party
 *   - Vacant desks: dashed border, no fill, "—" inside
 *   - Composition-only Congresses render as party-block hemicycle (no
 *     individual desks)
 *   - Mobile: compact hemicycle + tap-to-reveal (parent handles tap state)
 *
 * Props:
 *   desks       — Array<{desk_id, side, arc, position, famous_name,
 *                         assignment: {bioguide_id, ...} | null,
 *                         politician: {name, party, state, ...} | null}>
 *   fidelityTier — 'full' | 'partial' | 'composition_only'
 *   onDeskClick — (desk) => void
 *   onDeskHover — (desk | null) => void
 *   moment      — Optional historic moment in scope. When set, party tints
 *                  are REPLACED by vote-outcome tints (Yea/Nay/NotVoting)
 *                  per design decision D6. Shape:
 *                    { slug, title, votesByBioguide: Map<bioguide, 'Yea'|'Nay'|'NotVoting'> }
 *   isMobile    — boolean: render compact layout
 */

const PARTY_COLORS = {
  D: { fill: 'rgba(37, 99, 235, 0.10)', border: '#2563EB', numText: '#1d4ed8' },
  R: { fill: 'rgba(220, 38, 38, 0.10)', border: '#DC2626', numText: '#b91c1c' },
  I: { fill: 'rgba(124, 58, 237, 0.10)', border: '#7C3AED', numText: '#6d28d9' },
}

const VOTE_COLORS = {
  Yea: { fill: 'rgba(22, 163, 74, 0.10)', border: '#16A34A' },
  Nay: { fill: 'rgba(220, 38, 38, 0.10)', border: '#DC2626' },
  NotVoting: { fill: 'transparent', border: '#9C9789' },
}

const DESK_W = 36
const DESK_H = 44
const DESK_W_MOBILE = 20
const DESK_H_MOBILE = 28

// Arc radii and spacing chosen so 100 desks fit a 1120×680 viewBox.
const VIEWBOX_W = 1120
const VIEWBOX_H = 680
const CENTER_X = VIEWBOX_W / 2
const CENTER_Y = 80 // rostrum just above this; arcs sweep down from here

const ARC_RADII = {
  1: 200,
  2: 290,
  3: 380,
  4: 470,
}

function partyOf(politician, assignment) {
  // Caucus override would live on member_congress_terms.caucus; for v1 we
  // prefer the politician.party which the migration-009 trigger keeps in sync.
  // Independents who caucus with a major party still render as 'I' here —
  // they're a distinct visual signal worth preserving.
  if (politician?.party === 'D') return 'D'
  if (politician?.party === 'R') return 'R'
  if (politician?.party === 'I') return 'I'
  return null
}

function computeDeskPosition(desk, deskCountPerArc) {
  // Within arc `desk.arc`, this desk is at 1-indexed `position` of
  // `deskCountPerArc[arc]` total desks. Map to an angle 0..π and compute (x,y).
  const total = deskCountPerArc[desk.arc] ?? 1
  // Distribute positions evenly across the arc: angles from 0 (left) to π (right).
  // Offset by 0.5 so the first and last desk aren't at the exact endpoints.
  const angle = (Math.PI * (desk.position - 0.5)) / total
  const radius = ARC_RADII[desk.arc] ?? 200
  const x = CENTER_X - radius * Math.cos(angle)
  const y = CENTER_Y + radius * Math.sin(angle)
  return { x, y }
}

function SenateChamberMap({
  desks = [],
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

  const deskW = isMobile ? DESK_W_MOBILE : DESK_W
  const deskH = isMobile ? DESK_H_MOBILE : DESK_H

  // Composition-only Congresses skip individual-desk rendering.
  if (fidelityTier === 'composition_only') {
    return (
      <SenateCompositionOnlyHemicycle
        desks={desks}
        isMobile={isMobile}
      />
    )
  }

  return (
    <div className={`senate-chamber-map ${isMobile ? 'is-mobile' : ''}`}>
      <svg
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        role="application"
        aria-label={`Senate chamber, ${desks.length} desks`}
        className="senate-chamber-svg"
      >
        <title>Senate Chamber</title>

        {/* Rostrum label */}
        <text
          x={CENTER_X}
          y={30}
          textAnchor="middle"
          className="rostrum-label"
        >
          Rostrum
        </text>

        {/* Subtle arc guide lines */}
        {Object.entries(ARC_RADII).map(([arc, radius]) => (
          <path
            key={`arc-${arc}`}
            d={describeArc(CENTER_X, CENTER_Y, radius, 0, Math.PI)}
            fill="none"
            stroke="#E8E6E1"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
        ))}

        {/* Vertical aisle */}
        <line
          x1={CENTER_X}
          y1={CENTER_Y + 20}
          x2={CENTER_X}
          y2={CENTER_Y + ARC_RADII[4] + 20}
          stroke="#E8E6E1"
          strokeWidth="1"
          strokeDasharray="3 6"
        />

        {/* Desks */}
        {desks.map((desk) => {
          const { x, y } = computeDeskPosition(desk, deskCountPerArc)
          const politician = desk.politician
          const assignment = desk.assignment
          const party = partyOf(politician, assignment)
          const vote = moment?.votesByBioguide?.get(assignment?.bioguide_id)
          const colors = vote
            ? VOTE_COLORS[vote] ?? VOTE_COLORS.NotVoting
            : party
              ? PARTY_COLORS[party]
              : null

          const isVacant = !assignment?.bioguide_id
          const isFocused = focusedDeskId === desk.desk_id
          const lastName = politician?.name?.split(',')[0] ?? null

          return (
            <g
              key={desk.desk_id}
              transform={`translate(${x - deskW / 2}, ${y - deskH / 2})`}
              role="button"
              tabIndex={0}
              aria-label={buildDeskLabel(desk, politician, vote)}
              className={`chamber-desk ${isFocused ? 'is-focused' : ''} ${isVacant ? 'is-vacant' : ''}`}
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
              onFocus={() => setFocusedDeskId(desk.desk_id)}
              onBlur={() => setFocusedDeskId(null)}
            >
              {/* Invisible hit-area expansion to ≥44×44 on mobile */}
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
                width={deskW}
                height={deskH}
                rx={4}
                ry={4}
                fill={isVacant ? 'transparent' : colors?.fill ?? '#FFFFFF'}
                stroke={isVacant ? '#9C9789' : colors?.border ?? '#9C9789'}
                strokeWidth={1}
                strokeDasharray={isVacant ? '3 3' : undefined}
              />

              {/* Famous-desk accent dot */}
              {desk.famous_name && !isMobile && (
                <circle
                  cx={deskW - 5}
                  cy={5}
                  r={3}
                  fill="#1D4ED8"
                />
              )}

              {/* Desk number */}
              {!isMobile && (
                <text
                  x={deskW / 2}
                  y={11}
                  textAnchor="middle"
                  className="desk-number"
                  fill={isVacant ? '#9C9789' : colors?.border ?? '#6B6861'}
                >
                  {desk.desk_id}
                </text>
              )}

              {/* Senator last name (desktop) */}
              {!isMobile && !isVacant && lastName && (
                <text
                  x={deskW / 2}
                  y={26}
                  textAnchor="middle"
                  className="desk-name"
                >
                  {truncateName(lastName, 8)}
                </text>
              )}

              {/* Vacant placeholder */}
              {isVacant && !isMobile && (
                <text
                  x={deskW / 2}
                  y={26}
                  textAnchor="middle"
                  className="desk-vacant"
                  fill="#9C9789"
                >
                  —
                </text>
              )}

              {/* Mobile: just the desk number */}
              {isMobile && (
                <text
                  x={deskW / 2}
                  y={deskH / 2 + 3}
                  textAnchor="middle"
                  className="desk-number-mobile"
                  fill={isVacant ? '#9C9789' : colors?.border ?? '#6B6861'}
                >
                  {desk.desk_id}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* Fidelity caveat banner — only renders if NOT 'full' */}
      {fidelityTier !== 'full' && (
        <div className="chamber-fidelity-banner" role="status">
          <span
            className="chamber-fidelity-dot"
            style={{ backgroundColor: fidelityDotColor(fidelityTier) }}
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
function SenateCompositionOnlyHemicycle({ desks }) {
  // Group by party to render two clean clusters.
  // (Reuses the desk structural data — side='D'|'R'|'aisle' from migration 008.)
  const dCount = desks.filter((d) => d.side === 'D').length
  const rCount = desks.filter((d) => d.side === 'R').length

  return (
    <div className="senate-composition-only">
      <div className="composition-banner">
        Desk assignments are not available for this Congress.
        Showing party composition only.
      </div>
      <div className="composition-hemicycle">
        <div className="composition-half composition-d">
          <div className="composition-dots">
            {Array.from({ length: dCount }).map((_, i) => (
              <span
                key={`d-${i}`}
                className="composition-dot composition-dot-d"
                aria-hidden="true"
              />
            ))}
          </div>
          <div className="composition-label">
            Democrats <span className="composition-count">{dCount}</span>
          </div>
        </div>
        <div className="composition-aisle" aria-hidden="true" />
        <div className="composition-half composition-r">
          <div className="composition-dots">
            {Array.from({ length: rCount }).map((_, i) => (
              <span
                key={`r-${i}`}
                className="composition-dot composition-dot-r"
                aria-hidden="true"
              />
            ))}
          </div>
          <div className="composition-label">
            Republicans <span className="composition-count">{rCount}</span>
          </div>
        </div>
      </div>
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
  const partyState = `${politician.party}-${politician.state}`
  return `${base}${famous}, Senator ${politician.name} (${partyState})${voteStr}. Click to view desk history.`
}

export default SenateChamberMap
