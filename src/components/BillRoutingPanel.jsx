import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  getBillRoutings,
  getBillPathNarrative,
  generateBillPathNarrative,
  getCommitteeSurvival,
} from '../services/billsDb'
import { COMMITTEE_GLOSSARY } from '../../etl/data/committees'
import '../styles/BillRoutingPanel.css'

/**
 * "Where this bill goes" section on BillDetail.
 *
 * Renders:
 *   1. Structured routing list (committees + subcommittees + glossary gloss)
 *   2. Marginalia AI narrative (cached or synchronous cold-start)
 *   3. Smart status pill popover with survival % (separate component, see export)
 *
 * Behind feature flag VITE_BILLS_SHOW_ROUTING_PANEL (gated in BillDetail).
 *
 * Cold-start narrative budget: 8s AbortController timeout (eng-review D3).
 * On timeout: structured list still renders, marginalia shows "Narrative
 * unavailable, try refresh." Counter increments.
 */

const NARRATIVE_TIMEOUT_MS = 8000

function bumpMetric(name) {
  try {
    fetch('/api/metrics/inc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric_name: name }),
      keepalive: true,
    }).catch(() => {})
  } catch (_) {
    /* no-op */
  }
}

// Map activity_type enum to display label for the routing-row badge.
function activityBadge(activityType) {
  switch (activityType) {
    case 'reported_by': return 'Reported out'
    case 'discharged_from': return 'Discharged'
    case 'markup': return 'Markup'
    case 'committee_consideration': return 'In consideration'
    case 'referred_to':
    default:
      return 'Referred to'
  }
}

function formatDate(d) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function BillRoutingPanel({ billId, onOpenMethodology }) {
  const [routings, setRoutings] = useState([])
  const [routingsLoading, setRoutingsLoading] = useState(true)
  const [routingsError, setRoutingsError] = useState(null)

  const [narrative, setNarrative] = useState(null)
  const [narrativePromptVersion, setNarrativePromptVersion] = useState('v1')
  const [narrativeStatus, setNarrativeStatus] = useState('idle') // idle | loading | ready | timeout | error

  const expandedOnceRef = useRef(false)

  // ----- Load structured routings + try cache for narrative -----
  useEffect(() => {
    if (!billId) return
    let cancelled = false
    setRoutingsLoading(true)
    setRoutingsError(null)
    setNarrative(null)
    setNarrativeStatus('idle')

    if (!expandedOnceRef.current) {
      expandedOnceRef.current = true
      bumpMetric('routing_panel_expanded')
    }

    ;(async () => {
      try {
        const [rows, cached] = await Promise.all([
          getBillRoutings(billId),
          getBillPathNarrative(billId),
        ])
        if (cancelled) return
        setRoutings(rows)
        setRoutingsLoading(false)

        if (cached?.narrative) {
          setNarrative(cached.narrative)
          setNarrativePromptVersion(cached.promptVersion || 'v1')
          setNarrativeStatus('ready')
        } else {
          // Cache miss — trigger cold-start narrative generation.
          await generateNarrative()
        }
      } catch (err) {
        if (cancelled) return
        console.error('[BillRoutingPanel] load failed:', err)
        setRoutingsError('Failed to load committee routings.')
        setRoutingsLoading(false)
      }
    })()

    async function generateNarrative() {
      setNarrativeStatus('loading')
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), NARRATIVE_TIMEOUT_MS)
      try {
        const result = await generateBillPathNarrative(billId, controller.signal)
        if (cancelled) return
        if (result?.narrative) {
          setNarrative(result.narrative)
          setNarrativePromptVersion(result.promptVersion || 'v1')
          setNarrativeStatus('ready')
        } else {
          setNarrativeStatus('error')
        }
      } catch (err) {
        if (cancelled) return
        if (err.name === 'AbortError') {
          setNarrativeStatus('timeout')
        } else {
          console.warn('[BillRoutingPanel] narrative generation failed:', err)
          setNarrativeStatus('error')
        }
      } finally {
        clearTimeout(timeout)
      }
    }

    return () => {
      cancelled = true
    }
  }, [billId])

  if (routingsLoading) {
    return (
      <section className="bill-routing-section">
        <div className="bill-section-label">Where this bill goes</div>
        <h2 className="bill-section-title">Loading committee path…</h2>
      </section>
    )
  }

  if (routingsError) {
    return (
      <section className="bill-routing-section">
        <div className="bill-section-label">Where this bill goes</div>
        <h2 className="bill-section-title">Committee path</h2>
        <p className="bill-routing-error">{routingsError}</p>
      </section>
    )
  }

  const emptyRoutings = routings.length === 0

  return (
    <section className="bill-routing-section" id="routing-section">
      <div className="bill-section-label">Where this bill goes</div>
      <h2 className="bill-section-title">
        Committee <em>path</em>
      </h2>

      {emptyRoutings ? (
        <p className="bill-routing-empty">This bill bypassed committee referral.</p>
      ) : (
        <ul className="bill-routing-list">
          {routings.map((r, idx) => {
            const codeKey = r.subcommittee_code || r.committee_code
            const gloss = COMMITTEE_GLOSSARY[r.committee_code?.toUpperCase()]
            const subGloss = r.subcommittee_code
              ? COMMITTEE_GLOSSARY[r.subcommittee_code.toUpperCase()]
              : null
            return (
              <li key={`${codeKey}-${idx}`} className="bill-routing-row">
                <div className="bill-routing-row-main">
                  <Link
                    to={`/committee/${r.committee_code}`}
                    className="bill-routing-committee-name"
                  >
                    {r.committee_name || r.committee_code}
                  </Link>
                  {r.subcommittee_name && (
                    <div className="bill-routing-subcommittee">
                      Subcommittee on {r.subcommittee_name}
                    </div>
                  )}
                  {(subGloss?.gloss || gloss?.gloss) && (
                    <div className="bill-routing-gloss">{subGloss?.gloss || gloss?.gloss}</div>
                  )}
                </div>
                <div className="bill-routing-row-side">
                  <span className="bill-routing-activity">{activityBadge(r.activity_type)}</span>
                  {r.referred_at && (
                    <span className="bill-routing-date">{formatDate(r.referred_at)}</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Marginalia: AI narrative */}
      <aside className="bill-routing-marginalia" aria-label="BallotWatch analysis">
        <span className="bill-routing-marginalia-label">
          BallotWatch analysis <span className="bill-routing-marginalia-version">· {narrativePromptVersion}</span>
        </span>
        {narrativeStatus === 'loading' && (
          <span>
            <span className="loading-spinner-small" aria-hidden="true"></span>
            {' Generating analysis…'}
          </span>
        )}
        {(narrativeStatus === 'timeout' || narrativeStatus === 'error') && (
          <span>Narrative unavailable, try refresh.</span>
        )}
        {narrativeStatus === 'ready' && narrative && (
          <span>{narrative}</span>
        )}
        <a
          href="#methodology"
          className="methodology-link"
          aria-label="How we generate bill path analyses (opens modal)"
          onClick={(e) => {
            e.preventDefault()
            if (onOpenMethodology) onOpenMethodology('bill-path-narrative')
          }}
        >
          How we generate this →
        </a>
      </aside>
    </section>
  )
}

/**
 * Smart status pill — wraps the existing pill with hover/tap to reveal
 * a small popover showing the primary committee's survival %.
 *
 * Per design-review Pass 4: NO gauges, NO ring progress, NO color gradients.
 * Plain prose number in Geist Mono.
 */
export function StatusPillWithSurvival({ status, billId, congress, primaryCommitteeCode, primaryCommitteeName, onOpenMethodology }) {
  const [open, setOpen] = useState(false)
  const [survival, setSurvival] = useState(null)
  const [loadedFor, setLoadedFor] = useState(null)
  const pillRef = useRef(null)
  const popoverRef = useRef(null)
  const popoverId = `survival-popover-${billId}`

  // Lazy-load survival on first open.
  useEffect(() => {
    if (!open || !primaryCommitteeCode || !congress) return
    const key = `${primaryCommitteeCode}-${congress}`
    if (loadedFor === key) return
    let cancelled = false
    bumpMetric('survival_pill_opened')
    getCommitteeSurvival(primaryCommitteeCode, congress)
      .then((s) => {
        if (cancelled) return
        setSurvival(s)
        setLoadedFor(key)
      })
      .catch(() => {
        if (!cancelled) {
          setSurvival(null)
          setLoadedFor(key)
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, primaryCommitteeCode, congress, loadedFor])

  // Dismiss on outside click / Escape
  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        pillRef.current && !pillRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpen(false)
        pillRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const hasContent = !!primaryCommitteeCode
  const survivalText =
    survival && survival.survival_pct != null
      ? `${survival.survival_pct}%`
      : null

  return (
    <span className="bill-status-pill-wrap">
      <span
        ref={pillRef}
        className={`bill-status-pill ${status.cls}`}
        aria-describedby={hasContent ? popoverId : undefined}
        tabIndex={hasContent ? 0 : -1}
        role={hasContent ? 'button' : undefined}
        onMouseEnter={hasContent ? () => setOpen(true) : undefined}
        onMouseLeave={hasContent ? () => setOpen(false) : undefined}
        onClick={hasContent ? (e) => { e.stopPropagation(); setOpen((o) => !o) } : undefined}
        onKeyDown={hasContent ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((o) => !o)
          }
        } : undefined}
      >
        <span className="bill-status-pill-dot"></span>{status.label}
      </span>
      {open && hasContent && (
        <div
          ref={popoverRef}
          id={popoverId}
          className="bill-status-popover"
          role="dialog"
          aria-label="Bill status detail"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <dl className="bill-status-popover-dl">
            <dt className="bill-status-popover-committee">{primaryCommitteeName || primaryCommitteeCode}</dt>
            <dd>
              {survivalText ? (
                <>
                  <span className="bill-status-popover-pct">{survivalText}</span>
                  <span className="bill-status-popover-caption">of bills referred here advance in this Congress</span>
                </>
              ) : (
                <em className="bill-status-popover-insufficient">Insufficient history yet</em>
              )}
            </dd>
          </dl>
          <hr className="bill-status-popover-rule" />
          <a
            href="#methodology"
            className="bill-status-popover-method"
            onClick={(e) => {
              e.preventDefault()
              setOpen(false)
              if (onOpenMethodology) onOpenMethodology('committee-survival')
            }}
          >
            How we compute this →
          </a>
        </div>
      )}
    </span>
  )
}
