import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import SEO from './SEO'
import MethodologyModal from './MethodologyModal'
import { COMMITTEE_GLOSSARY } from '../../etl/data/committees'
import {
  getBillsForCommittee,
  getAllBillsForCommittee,
  getCommitteeSurvival,
} from '../services/billsDb'
import { getBillDisplayTitle, formatBillId } from '../utils/billTitle'
import '../styles/CommitteePage.css'

/**
 * /committee/:code — committee detail page.
 *
 * IA per design-review D1:
 *   1. Masthead: kicker, title, deck (gloss), stats line
 *   2. Section 1: Bills currently in committee (PRIMARY) — last 90 days
 *      Fallback: "Show all-time →"
 *   3. Section 2: Members (PoliticianCard reuse)
 *   4. Section 3: Historical activity (Geist Mono stats per Congress)
 *
 * In-app navigation only — no SEO claim (per outside-voice D20).
 *
 * Behind VITE_BILLS_SHOW_ROUTING_PANEL — the route registration check
 * happens in App.jsx so unflagged users never see a broken link.
 */

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

function partyClass(party) {
  if (!party) return ''
  const p = String(party).toLowerCase()
  if (p.startsWith('d')) return 'party-tag-dem'
  if (p.startsWith('r')) return 'party-tag-rep'
  return 'party-tag-ind'
}

function partyAbbrev(party) {
  if (!party) return ''
  const p = String(party).toLowerCase()
  if (p.startsWith('d')) return 'D'
  if (p.startsWith('r')) return 'R'
  return 'I'
}

// Current Congress — kept simple; we have a real getter elsewhere but for
// page-level stats this is fine.
function currentCongress() {
  const year = new Date().getFullYear()
  return Math.floor((year - 1789) / 2) + 1
}

const CONGRESS_LABEL = { 117: '117th', 118: '118th', 119: '119th' }

export default function CommitteePage() {
  const { code: rawCode } = useParams()
  const code = (rawCode || '').toUpperCase()
  const gloss = COMMITTEE_GLOSSARY[code]

  const [bills, setBills] = useState([])
  const [showAllTime, setShowAllTime] = useState(false)
  const [billsLoading, setBillsLoading] = useState(true)
  const [billsError, setBillsError] = useState(null)

  const [survival, setSurvival] = useState({})  // { 117: row, 118: row, 119: row }
  const [methodologyAnchor, setMethodologyAnchor] = useState(null)

  useEffect(() => {
    bumpMetric('committee_page_visited')
    let cancelled = false

    async function loadBills() {
      setBillsLoading(true)
      setBillsError(null)
      try {
        const recent = await getBillsForCommittee(code, { sinceDays: 90, limit: 50 })
        if (cancelled) return
        if (recent.length === 0 && showAllTime) {
          const all = await getAllBillsForCommittee(code, { limit: 100 })
          if (cancelled) return
          setBills(all)
        } else {
          setBills(recent)
        }
      } catch (err) {
        if (cancelled) return
        console.error('[CommitteePage] bills load failed:', err)
        setBillsError('Failed to load bills, try refresh.')
      } finally {
        if (!cancelled) setBillsLoading(false)
      }
    }

    async function loadSurvival() {
      try {
        const congresses = [117, 118, 119]
        const results = await Promise.all(
          congresses.map((c) => getCommitteeSurvival(code, c))
        )
        if (cancelled) return
        const next = {}
        congresses.forEach((c, i) => {
          next[c] = results[i]
        })
        setSurvival(next)
      } catch (_) {
        /* survival is best-effort */
      }
    }

    loadBills()
    loadSurvival()

    return () => {
      cancelled = true
    }
  }, [code, showAllTime])

  const handleShowAllTime = async () => {
    setShowAllTime(true)
    setBillsLoading(true)
    try {
      const all = await getAllBillsForCommittee(code, { limit: 100 })
      setBills(all)
    } catch (err) {
      setBillsError('Failed to load all-time bills.')
    } finally {
      setBillsLoading(false)
    }
  }

  const committeeName = gloss?.name || code
  const chamber = gloss?.chamber || 'unknown'
  const deck = gloss?.gloss || 'Jurisdiction details not yet documented.'
  const congress = currentCongress()

  const currentSurvival = survival[congress]
  const billsReferred = currentSurvival?.bills_referred_as_primary || 0
  const advancePct = currentSurvival?.survival_pct

  return (
    <div className="committee-page">
      <SEO
        title={committeeName}
        description={deck}
        path={`/committee/${code}`}
      />

      <nav className="committee-crumb" aria-label="Breadcrumb">
        <Link to="/">BallotWatch</Link>
        <span className="committee-crumb-sep">/</span>
        <Link to="/bills">Bills</Link>
        <span className="committee-crumb-sep">/</span>
        <span>{committeeName}</span>
      </nav>

      <header className="committee-masthead">
        <div className="committee-kicker">
          {chamber === 'house' ? 'HOUSE COMMITTEE' : chamber === 'senate' ? 'SENATE COMMITTEE' : 'CONGRESSIONAL COMMITTEE'}
          {' · '}{CONGRESS_LABEL[congress] || `${congress}th`} CONGRESS
        </div>
        <h1 className="committee-title"><em>{committeeName}</em></h1>
        <p className="committee-deck">{deck}</p>
        <div className="committee-stats">
          <span>{billsReferred} bills referred</span>
          {advancePct != null && (
            <>
              <span className="committee-stats-sep">·</span>
              <span>{advancePct}% advance rate ({CONGRESS_LABEL[congress] || `${congress}th`} Congress, primary referrals only)</span>
            </>
          )}
          {advancePct == null && (
            <>
              <span className="committee-stats-sep">·</span>
              <span className="committee-stats-insufficient">
                Insufficient history yet for advance rate
              </span>
            </>
          )}
        </div>
      </header>

      <hr className="committee-rule" />

      {/* SECTION 1: Bills currently in committee */}
      <section className="committee-section">
        <h2 className="committee-section-title"><em>Bills currently in committee</em></h2>
        <p className="committee-section-subtitle">
          {showAllTime
            ? 'All-time bills referred to this committee'
            : `${bills.length} referred in the last 90 days`}
        </p>

        {billsLoading && (
          <div className="committee-loading">
            <div className="loading-spinner-small"></div> Loading bills…
          </div>
        )}
        {!billsLoading && billsError && (
          <p className="committee-error">{billsError}</p>
        )}
        {!billsLoading && !billsError && bills.length === 0 && !showAllTime && (
          <p className="committee-empty">
            No bills referred in last 90 days.{' '}
            <button className="committee-link-button" onClick={handleShowAllTime}>
              Show all-time →
            </button>
          </p>
        )}
        {!billsLoading && !billsError && bills.length === 0 && showAllTime && (
          <p className="committee-empty">No bills referred to this committee yet.</p>
        )}
        {!billsLoading && !billsError && bills.length > 0 && (
          <ul className="committee-bills-list">
            {bills.map((bill) => (
              <li key={bill.id} className="committee-bill-row">
                <Link to={`/bill/${bill.congress}/${bill.type?.toLowerCase()}/${bill.number}`} className="committee-bill-link">
                  <span className="committee-bill-id">{formatBillId(bill)}</span>
                  <span className="committee-bill-title">{getBillDisplayTitle(bill)}</span>
                  {bill.sponsors?.[0] && (
                    <span className="committee-bill-sponsor">
                      {bill.sponsors[0].fullName}
                      {bill.sponsors[0].party && (
                        <span className={`committee-bill-party ${partyClass(bill.sponsors[0].party)}`}>
                          {' '}{partyAbbrev(bill.sponsors[0].party)}
                        </span>
                      )}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <hr className="committee-rule" />

      {/* SECTION 3: Historical activity (Section 2 — members — deferred:
          requires a separate committee_members table we haven't built yet) */}
      <section className="committee-section">
        <h2 className="committee-section-title"><em>Historical activity</em></h2>
        <p className="committee-section-subtitle">Last 3 Congresses</p>
        <dl className="committee-historical">
          {[117, 118, 119].map((c) => {
            const row = survival[c]
            const label = CONGRESS_LABEL[c] || `${c}th`
            if (!row) {
              return (
                <div key={c} className="committee-historical-row">
                  <dt>{label}:</dt>
                  <dd>Not yet backfilled</dd>
                </div>
              )
            }
            if (row.survival_pct == null) {
              return (
                <div key={c} className="committee-historical-row">
                  <dt>{label}:</dt>
                  <dd>{row.bills_referred_as_primary} bills referred · insufficient history for rate</dd>
                </div>
              )
            }
            return (
              <div key={c} className="committee-historical-row">
                <dt>{label}:</dt>
                <dd>
                  {row.bills_referred_as_primary} bills referred · {row.survival_pct}% advanced
                </dd>
              </div>
            )
          })}
        </dl>
        <a
          href="#methodology"
          className="committee-methodology-link"
          aria-label="How we compute committee advance rate (opens modal)"
          onClick={(e) => {
            e.preventDefault()
            setMethodologyAnchor('committee-survival')
          }}
        >
          How we compute advance rate →
        </a>
      </section>

      <MethodologyModal
        open={!!methodologyAnchor}
        anchor={methodologyAnchor}
        onClose={() => setMethodologyAnchor(null)}
      />
    </div>
  )
}
