import { historicMoments } from '../data/historicMoments'

/**
 * HistoricMomentOverlay — moment selector + tally text.
 *
 * Per /plan-design-review D6: when a moment is active, the parent
 * SenateChamberMap re-tints desks by vote outcome (Yea/Nay/NotVoting)
 * instead of party. This component renders:
 *   1. The selector (list of curated moments)
 *   2. The active moment's heading + tally text (NOT a gauge per
 *      [editorial-popover-anti-gauge])
 *   3. The legend (Yea / Nay / Not voting color swatches)
 *
 * Props:
 *   activeMomentSlug   — string | null
 *   onMomentChange     — (slug | null) => void
 *   congress           — current Congress (used to filter applicable moments)
 *   onMomentCongressMismatch — (momentCongress) => void  optional callback
 */

function HistoricMomentOverlay({
  activeMomentSlug,
  onMomentChange,
  congress,
  onMomentCongressMismatch,
}) {
  const active = historicMoments.find((m) => m.slug === activeMomentSlug) ?? null
  const applicableMoments = historicMoments.filter((m) =>
    // For v1 we show moments from current AND prior Congresses; selecting a
    // moment from a different Congress triggers the auto-scrub callback.
    Number.isInteger(m.congress)
  )

  const handleSelect = (slug) => {
    const moment = historicMoments.find((m) => m.slug === slug)
    if (moment && moment.congress !== congress) {
      onMomentCongressMismatch?.(moment.congress)
    }
    onMomentChange?.(slug)
  }

  return (
    <div className="historic-moment-overlay">
      <div className="historic-moment-header">
        <h2 className="historic-moment-section-heading">
          <em>Historic moments</em>
        </h2>
        <p className="historic-moment-blurb">
          Replay a notable Senate vote on the chamber. Each desk is colored
          by how that senator voted; party tints are hidden while a moment
          is active. <a href="/chamber/methodology" className="historic-moment-method-link">How we picked these</a>.
        </p>
      </div>

      <div className="historic-moment-list" role="listbox" aria-label="Historic moments">
        <button
          type="button"
          className={`historic-moment-item ${!active ? 'is-selected' : ''}`}
          role="option"
          aria-selected={!active}
          onClick={() => onMomentChange?.(null)}
        >
          <span className="historic-moment-item-title">No moment</span>
          <span className="historic-moment-item-meta">Show party tints</span>
        </button>
        {applicableMoments.map((m) => (
          <button
            key={m.slug}
            type="button"
            className={`historic-moment-item ${active?.slug === m.slug ? 'is-selected' : ''}`}
            role="option"
            aria-selected={active?.slug === m.slug}
            onClick={() => handleSelect(m.slug)}
          >
            <span className="historic-moment-item-title">{m.title}</span>
            <span className="historic-moment-item-meta">
              {m.date} · {m.congress}th
            </span>
          </button>
        ))}
      </div>

      {active && (
        <div className="historic-moment-detail" role="region" aria-live="polite">
          <h3 className="historic-moment-detail-title">
            <em>{active.title}</em>
          </h3>
          <div className="historic-moment-detail-tally">
            {/* Plain-text tally per [editorial-popover-anti-gauge] — no gauges. */}
            {active.date} · {active.tally}
          </div>
          {active.blurb && (
            <p className="historic-moment-detail-blurb">{active.blurb}</p>
          )}

          <div className="historic-moment-legend" aria-label="Vote outcome legend">
            <span className="historic-moment-legend-item">
              <span className="historic-moment-legend-swatch historic-moment-legend-yea" />
              Yea
            </span>
            <span className="historic-moment-legend-item">
              <span className="historic-moment-legend-swatch historic-moment-legend-nay" />
              Nay
            </span>
            <span className="historic-moment-legend-item">
              <span className="historic-moment-legend-swatch historic-moment-legend-notvoting" />
              Not voting
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default HistoricMomentOverlay
