/**
 * VOTING PATTERN ANALYSIS
 * ─────────────────────────────────────────────
 *   User clicks "Analyze" → check localStorage cache
 *     hit + schemaVersion match: render instantly
 *     miss: getMemberDashboardData (Supabase) OR Congress.gov fallback
 *       → votingPatterns.js (pure compute)
 *       → votingPatternNarration.js (gpt-4o-mini + forbidden filter)
 *       → write localStorage (vpa_ + vpa_index eviction at 25 reps)
 *       → render Pattern Match score + 3 flag bars + 6 typical + 6 atypical
 *   Degraded mode: OpenAI fails → show stats + template sentences
 * ─────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react'
import { getMemberDashboardData } from '../services/supabaseVotes'
import { getDonationsByPoliticianName, getMoneyVotesCorrelation } from '../services/donations'
import { getIndustryBreakdown } from '../data/industryMap'
import {
  VPA_SCHEMA_VERSION,
  effectivePartyCode,
  partyMajorityDirection,
  computePatternMatchScore,
  computePartyCrossover,
  computeDistrictMismatch,
  computeMoneyAligned,
  rankNotableVotes,
} from '../services/votingPatterns'
import { narrateVotes } from '../services/votingPatternNarration'
import '../styles/VotingPatternAnalysis.css'

const MIN_VOTES = 50
const CACHE_PREFIX = 'vpa_'
const CACHE_INDEX_KEY = 'vpa_index'
const CACHE_MAX_ENTRIES = 25
const CONGRESS = 119

/** localStorage cache helpers (with schema versioning + eviction) */
function cacheGet(bioguideId) {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${bioguideId}_${CONGRESS}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.schemaVersion !== VPA_SCHEMA_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

function cacheSet(bioguideId, payload) {
  try {
    const key = `${CACHE_PREFIX}${bioguideId}_${CONGRESS}`
    const entry = { ...payload, schemaVersion: VPA_SCHEMA_VERSION, cachedAt: Date.now() }
    localStorage.setItem(key, JSON.stringify(entry))
    // Update index + evict oldest.
    let index = []
    try {
      index = JSON.parse(localStorage.getItem(CACHE_INDEX_KEY) || '[]')
    } catch { /* ignore */ }
    index = index.filter(k => k !== key)
    index.push(key)
    while (index.length > CACHE_MAX_ENTRIES) {
      const oldest = index.shift()
      localStorage.removeItem(oldest)
    }
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index))
  } catch {
    /* localStorage may be full or disabled; fail silently */
  }
}

/** Attach a stable annotation to each ranked vote for narration input. */
function annotateRanked(votes, bioguideId, partyCode) {
  const effParty = effectivePartyCode(bioguideId, partyCode)
  return votes.map(v => {
    const actual = v.position === 'Yea' || v.position === 'Yes' ? 1 : v.position === 'Nay' || v.position === 'No' ? 0 : null
    const pDir = partyMajorityDirection(v.roll_call_stats, effParty)
    const matched = actual !== null && pDir !== null ? (actual === pDir ? 1 : 0) : null
    const yea = ((v.roll_call_stats?.dem_yea ?? 0) + (v.roll_call_stats?.rep_yea ?? 0) + (v.roll_call_stats?.ind_yea ?? 0))
    const nay = ((v.roll_call_stats?.dem_nay ?? 0) + (v.roll_call_stats?.rep_nay ?? 0) + (v.roll_call_stats?.ind_nay ?? 0))
    const margin = yea + nay > 0 ? Math.abs(yea - nay) : null
    return { vote: v, actual, pDir, matched, margin }
  })
}

export default function VotingPatternAnalysis({ member }) {
  const bioguideId = member?.bioguideId || member?.id
  const partyCode = member?.partyHistory?.[0]?.partyName || member?.party || ''
  const state = member?.state || member?.terms?.[0]?.state
  const district = member?.terms?.[0]?.district
  const displayName = member?.directOrderName || member?.invertedOrderName || `${member?.firstName ?? ''} ${member?.lastName ?? ''}`.trim()

  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [methodologyOpen, setMethodologyOpen] = useState(false)
  const inFlight = useRef(false)

  // Auto-render from cache on mount, but don't auto-trigger analysis.
  useEffect(() => {
    if (!bioguideId) return
    const cached = cacheGet(bioguideId)
    if (cached) setAnalysis(cached)
  }, [bioguideId])

  const runAnalysis = async () => {
    if (inFlight.current || !bioguideId) return
    inFlight.current = true
    setLoading(true)
    setError(null)

    try {
      const dash = await getMemberDashboardData(bioguideId)
      if (!dash?.votes?.length) {
        setError('Voting history not available yet. Try again later.')
        return
      }
      if (dash.votes.length < MIN_VOTES) {
        setAnalysis({
          belowThreshold: true,
          totalVotes: dash.votes.length,
        })
        return
      }

      // Donor data for money-aligned + classifier donor signal.
      let topDonorIndustries = []
      let correlations = []
      try {
        const donationsData = await getDonationsByPoliticianName(displayName, state)
        if (donationsData?.donors?.length) {
          topDonorIndustries = getIndustryBreakdown(donationsData.donors)
          const bills = dash.votes.map(v => v.bill).filter(Boolean)
          correlations = await getMoneyVotesCorrelation(topDonorIndustries, dash.votes, bills)
        }
      } catch (err) {
        console.warn('[VPA] Donor data unavailable:', err.message)
      }

      const common = { bioguideId, partyCode, votes: dash.votes }
      const score = computePatternMatchScore({ ...common, state, district, topDonorIndustries, correlations })
      const crossover = computePartyCrossover(common)
      const mismatch = computeDistrictMismatch({ ...common, state, district })
      const money = computeMoneyAligned({ topDonorIndustries, correlations })
      const { typical, atypical } = rankNotableVotes(common)

      const annotatedTypical = annotateRanked(typical, bioguideId, partyCode)
      const annotatedAtypical = annotateRanked(atypical, bioguideId, partyCode)

      const { narrations: typicalN, degraded: degA } = await narrateVotes(annotatedTypical)
      const { narrations: atypicalN, degraded: degB } = await narrateVotes(annotatedAtypical)

      const result = {
        belowThreshold: false,
        score,
        crossover,
        mismatch,
        money,
        typical: annotatedTypical.map((a, i) => ({ ...a, narration: typicalN[i] })),
        atypical: annotatedAtypical.map((a, i) => ({ ...a, narration: atypicalN[i] })),
        degraded: degA || degB,
        generatedAt: Date.now(),
      }
      setAnalysis(result)
      cacheSet(bioguideId, result)
    } catch (err) {
      console.error('[VPA] Analysis failed:', err)
      setError('Could not complete analysis. Try again in a moment.')
    } finally {
      setLoading(false)
      inFlight.current = false
    }
  }

  if (!bioguideId) return null

  return (
    <section className="vpa-section" aria-labelledby="vpa-heading">
      <div className="vpa-heading-row">
        <h2 id="vpa-heading" className="vpa-heading">
          Voting Pattern Analysis <span className="vpa-ai-tag">AI-assisted</span>
        </h2>
      </div>

      {!analysis && !loading && !error && (
        <div className="vpa-default">
          <p className="vpa-teaser">
            See how often this senator's votes match what party, donors, and district
            expectations predict. 12 notable moments narrated.
          </p>
          <button
            type="button"
            className="vpa-analyze-btn"
            onClick={runAnalysis}
            disabled={loading}
            aria-expanded={!!analysis}
          >
            Analyze voting patterns
          </button>
        </div>
      )}

      {loading && (
        <div className="vpa-loading">
          <div className="loading-spinner" aria-hidden="true"></div>
          <p>Analyzing voting patterns…</p>
        </div>
      )}

      {error && (
        <div className="vpa-error">
          <p>{error}</p>
          <button type="button" className="vpa-analyze-btn" onClick={runAnalysis}>Retry</button>
        </div>
      )}

      {analysis?.belowThreshold && (
        <div className="vpa-empty">
          <p>
            Analysis available after {displayName || 'this member'} has cast at least
            {' '}{MIN_VOTES} roll-call votes this Congress. Currently: {analysis.totalVotes}.
          </p>
        </div>
      )}

      {analysis && !analysis.belowThreshold && (
        <div className="vpa-content">
          <ScoreBlock analysis={analysis} onMethodologyClick={() => setMethodologyOpen(true)} />
          <hr className="vpa-rule" />
          <Flags analysis={analysis} />
          <hr className="vpa-rule" />
          <NotableVotes analysis={analysis} />
          <div className="vpa-footer">
            <button type="button" className="vpa-methodology-link" onClick={() => setMethodologyOpen(true)}>
              Methodology and data sources
            </button>
            <button type="button" className="vpa-refresh-link" onClick={runAnalysis} aria-label="Re-run analysis">
              Refresh analysis
            </button>
          </div>
          {analysis.degraded && (
            <p className="vpa-degraded-notice">
              AI narration unavailable — showing deterministic summaries.
            </p>
          )}
        </div>
      )}

      {methodologyOpen && <MethodologyModal onClose={() => setMethodologyOpen(false)} />}
    </section>
  )
}

function ScoreBlock({ analysis, onMethodologyClick }) {
  const s = analysis.score
  if (!s || s.score === null) {
    return (
      <div className="vpa-score-block">
        <p className="vpa-score-caption">
          Pattern match score unavailable — insufficient signal coverage across votes.
        </p>
      </div>
    )
  }
  return (
    <div className="vpa-score-block">
      <div className="vpa-score-number-row">
        <span className="vpa-score-number" aria-hidden="true">{s.score}%</span>
        <span className="vpa-score-label">Pattern Match</span>
      </div>
      <p className="vpa-score-caption">
        How often this member's votes match what party, donors, and district predict.
        Based on {s.signalCoverage?.usable ?? 0} substantive votes.{' '}
        <button type="button" className="vpa-inline-link" onClick={onMethodologyClick}>
          See methodology
        </button>
      </p>
      <span className="visually-hidden">
        Pattern Match: {s.score} out of 100, based on {s.signalCoverage?.usable ?? 0} substantive votes.
      </span>
    </div>
  )
}

function FlagBar({ label, rate, description, ariaLabel }) {
  const pct = typeof rate === 'number' ? Math.max(0, Math.min(100, rate)) : null
  return (
    <div className="vpa-flag">
      <div className="vpa-flag-row">
        <span className="vpa-flag-label">{label}</span>
        <span
          className="vpa-flag-track"
          role="progressbar"
          aria-valuenow={pct ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={ariaLabel}
        >
          {pct !== null && <span className="vpa-flag-fill" style={{ width: `${pct}%` }} />}
        </span>
        <span className="vpa-flag-pct">{pct !== null ? `${pct}%` : '—'}</span>
      </div>
      <p className="vpa-flag-desc">{description}</p>
    </div>
  )
}

function Flags({ analysis }) {
  const { crossover, mismatch, money } = analysis

  const moneyDesc = money?.available
    ? `Of ${money.industryVotes} industry-tagged votes, ${money.alignedCount} aligned with top donor industries.`
    : money?.industryVotes > 0
      ? `Insufficient industry-tagged votes for money alignment.`
      : `No donor-industry data available for this member.`

  const crossoverDesc = crossover?.substantiveCount
    ? `Voted against party majority on ${crossover.crossoverCount} of ${crossover.substantiveCount} substantive votes${
        crossover.topPolicyAreas.length > 0
          ? `. Most crossovers: ${crossover.topPolicyAreas.map(p => `${p.area} (${p.crossPct}%)`).join(', ')}.`
          : '.'
      }`
    : 'Not enough comparable votes to compute crossover rate.'

  const mismatchDesc = mismatch?.available
    ? `${mismatch.mismatchCount} votes diverged from the district's 2024 presidential lean out of ${mismatch.substantiveCount} substantive votes.`
    : `District lean not available — shown as a rate when this member's district is included in the data set.`

  return (
    <div className="vpa-flags">
      <FlagBar
        label="Money-aligned votes"
        rate={money?.available ? money.alignmentRate : null}
        description={moneyDesc}
        ariaLabel={`Money-aligned votes: ${money?.alignmentRate ?? 'unavailable'}%`}
      />
      <FlagBar
        label="Party crossover rate"
        rate={crossover?.substantiveCount ? crossover.crossoverRate : null}
        description={crossoverDesc}
        ariaLabel={`Party crossover rate: ${crossover?.crossoverRate ?? 'unavailable'}%`}
      />
      <FlagBar
        label="District-lean mismatch"
        rate={mismatch?.available ? mismatch.mismatchRate : null}
        description={mismatchDesc}
        ariaLabel={`District-lean mismatch: ${mismatch?.mismatchRate ?? 'unavailable'}%`}
      />
    </div>
  )
}

function NotableVotes({ analysis }) {
  const { typical, atypical } = analysis
  return (
    <div className="vpa-notable">
      <h3 className="vpa-notable-heading">Notable Votes</h3>
      <p className="vpa-notable-subtitle">
        Ranked by vote margin. {typical?.length ?? 0} typical + {atypical?.length ?? 0} exceptions.
      </p>
      <div className="vpa-notable-grid">
        <NotableColumn title="Typical" items={typical ?? []} empty="No typical votes with substantive roll-call data." />
        <NotableColumn title="Exceptions" items={atypical ?? []} empty="No exception votes (this member voted with their party on every substantive vote)." />
      </div>
    </div>
  )
}

function NotableColumn({ title, items, empty }) {
  return (
    <div className="vpa-notable-col">
      <h4 className="vpa-notable-coltitle">{title}</h4>
      {items.length === 0 ? (
        <p className="vpa-notable-empty">{empty}</p>
      ) : (
        <ul className="vpa-notable-list">
          {items.map((item, i) => (
            <li className="vpa-notable-item" key={item.vote.roll_call_id || i}>
              <div className="vpa-notable-meta">
                <span className="vpa-notable-bill">{item.vote.bill?.title ?? 'Unlabeled measure'}</span>
                <span className="vpa-notable-stats">
                  {item.vote.position ?? '—'}
                  {item.margin != null && ` · margin ${item.margin}`}
                </span>
              </div>
              <aside className="vpa-notable-narration" aria-label="AI narration">
                {item.narration}
              </aside>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MethodologyModal({ onClose }) {
  return (
    <div className="vpa-modal-backdrop" onClick={onClose} role="presentation">
      <div className="vpa-modal" role="dialog" aria-modal="true" aria-labelledby="vpa-method-title" onClick={e => e.stopPropagation()}>
        <h2 id="vpa-method-title" className="vpa-modal-title">Methodology</h2>
        <div className="vpa-modal-body">
          <p>
            <strong>Pattern Match</strong> is the percentage of substantive votes (Yea / Nay)
            where the member's position matched a deterministic prediction. The prediction
            combines up to three signals:
          </p>
          <ul>
            <li><strong>Party majority direction</strong> — how most of the member's effective party voted on that roll call (weight 60%).</li>
            <li><strong>Donor-industry direction</strong> — when the bill's policy area matches the member's top 5 donor industries, uses the member's historical voting pattern on that industry (weight 25%).</li>
            <li><strong>District lean</strong> — predicts party-line voting in districts that leaned the member's party in 2024, and against-party voting in districts that leaned the other way (weight 15%).</li>
          </ul>
          <p>
            Missing signals are handled by renormalizing the remaining weights.
            Predicted Yea if the weighted sum ≥ 0.5.
          </p>
          <p>
            <strong>Notable votes</strong> are ranked by vote margin (closest first), then by
            most recent. The top 6 "typical" votes are closest substantive agreements with
            the member's party. The top 6 "exceptions" are closest substantive crossings.
            Ranking is deterministic and does not use the LLM.
          </p>
          <p>
            <strong>Data sources:</strong> Congress.gov (roll-call votes, bills, policy areas),
            FEC via the Campaign Finance section (donor industries), and 2024 presidential
            margins by district/state (Daily Kos Elections, CC BY-SA 4.0 — partial coverage
            while full dataset is being imported).
          </p>
          <p>
            <strong>About the AI:</strong> An LLM (gpt-4o-mini) writes the one-sentence
            descriptions per notable vote. It does not judge. A forbidden-word filter
            catches politically-loaded phrasing and falls back to deterministic templates
            on failure.
          </p>
        </div>
        <button type="button" className="vpa-modal-close" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
