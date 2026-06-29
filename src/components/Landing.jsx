import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getDistrictFromAddress, US_STATES } from '../services/district'
import { getRecentBills } from '../services/congress'
import { getRecentFloorVotes } from '../services/floorVotes'
import { saveUserAddress } from '../services/userService'
import SEO from './SEO'
import '../styles/Landing.css'

const ArrowRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
)

const GITHUB_URL = 'https://github.com/Shoberman2/politalapp'

const BILL_TYPE_LABELS = {
  HR: 'H.R.', S: 'S.', HRES: 'H.Res.', SRES: 'S.Res.',
  HJRES: 'H.J.Res.', SJRES: 'S.J.Res.', HCONRES: 'H.Con.Res.', SCONRES: 'S.Con.Res.',
}

// Sources shown as scannable trust credentials. Each line: what we pull, from where.
const SOURCES = [
  { name: 'Congress.gov', detail: 'Votes & bills' },
  { name: 'U.S. Census', detail: 'Your district' },
  { name: 'FEC', detail: 'Campaign finance' },
]

// Shown until (or in case) the live floor-vote fetch resolves.
const FALLBACK_FLOOR = [
  { key: 'f1', chamber: 'House', rollLabel: 'Roll Call 312', bill: { display: 'H.R. 4821', href: '/bills' }, text: 'Energy Permitting Modernization Act', tally: '248–176', result: 'Passed', resultKind: 'pass' },
  { key: 'f2', chamber: 'Senate', rollLabel: 'Roll Call 198', bill: { display: 'S. 1402', href: '/bills' }, text: 'Rural Broadband Access Act', tally: '61–38', result: 'Cloture invoked', resultKind: 'pass' },
  { key: 'f3', chamber: 'Senate', rollLabel: 'Roll Call 197', bill: { display: 'S. 2210', href: '/bills' }, text: 'Veterans Telehealth Expansion Act', tally: '52–47', result: 'Passed', resultKind: 'pass' },
  { key: 'f4', chamber: 'House', rollLabel: 'Roll Call 309', bill: { display: 'H.R. 9', href: '/bills' }, text: 'Federal Permitting Reform', tally: '203–229', result: 'Failed', resultKind: 'fail' },
]

const truncate = (str, max) => (str && str.length > max ? `${str.slice(0, max - 1).trimEnd()}…` : str || '')

const stateName = (abbr) => US_STATES.find((s) => s.abbr === abbr)?.name || abbr

// Map a derived result string to a color intent for the result chip.
function resultKindOf(result) {
  if (!result) return 'neutral'
  const r = result.toLowerCase()
  if (r.includes('reject') || r.includes('fail')) return 'fail'
  if (r.includes('passed') || r.includes('invoked') || r.includes('confirmed') || r.includes('agreed')) return 'pass'
  return 'neutral'
}

function fromFloorVote(v) {
  return {
    key: v.id,
    chamber: v.chamber,
    rollLabel: v.number != null ? `Roll Call ${v.number}` : null,
    bill: v.bill,
    text: truncate(v.description || v.question || '', 92),
    tally: v.yea != null && v.nay != null ? `${v.yea}–${v.nay}` : null,
    result: v.result,
    resultKind: resultKindOf(v.result),
  }
}

function fromBill(b) {
  const type = b.type || ''
  return {
    key: `${type}-${b.number}`,
    chamber: b.originChamber || (type.toUpperCase().startsWith('H') ? 'House' : 'Senate'),
    rollLabel: null,
    bill: {
      display: `${BILL_TYPE_LABELS[type] || type} ${b.number}`,
      href: `/bill/${b.congress}/${type.toLowerCase()}/${b.number}`,
    },
    text: truncate(b.latestAction?.text, 96),
    tally: null,
    result: null,
    resultKind: 'neutral',
  }
}

function Landing() {
  const navigate = useNavigate()
  const zipInputRef = useRef(null)

  const [zip, setZip] = useState('')
  const [lookup, setLookup] = useState(null)
  const [floor, setFloor] = useState(FALLBACK_FLOOR)
  const [recordedThrough, setRecordedThrough] = useState(null)

  // "On the floor" feed: prefer real recorded votes (with tallies), then fall
  // back to the latest legislative actions, then to static copy.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const data = await getRecentFloorVotes(16).catch(() => null)
      if (cancelled) return
      const votes = (data?.votes || []).filter((v) => v.text || v.bill)
      if (votes.length >= 3) {
        setFloor(votes.slice(0, 5).map(fromFloorVote))
        if (data.recordedThrough) setRecordedThrough(data.recordedThrough)
        return
      }
      const bills = await getRecentBills(8).catch(() => [])
      if (cancelled) return
      const items = bills.filter((b) => b.latestAction?.text && b.number).map(fromBill)
      if (items.length >= 3) setFloor(items.slice(0, 5))
    })()
    return () => { cancelled = true }
  }, [])

  const handleLookup = async (e) => {
    e.preventDefault()
    const value = zip.trim()
    if (!/^\d{5}$/.test(value)) {
      setLookup({
        code: '· · ·',
        body: 'Enter a five-digit ZIP code to find your district.',
        sub: 'Address-to-district matching uses U.S. Census data.',
      })
      return
    }

    setLookup({ code: value, body: 'Matching your ZIP to a district…', sub: '' })
    const info = await getDistrictFromAddress(value)

    if (!info?.state) {
      setLookup({
        code: '· · ·',
        body: `We couldn't match ZIP ${value} to a state.`,
        sub: 'Check the ZIP code or try the full address form.',
      })
      return
    }

    const address = { street: '', city: info.city || '', state: info.state, zip: value }
    if (info.district != null) {
      setLookup({
        code: `${info.state}-AL`,
        body: '1 Representative and 2 Senators found.',
        sub: `${stateName(info.state)} at-large district. Voting records and finance with sources.`,
        address,
      })
    } else {
      setLookup({
        code: info.state,
        body: '2 Senators found.',
        sub: `${stateName(info.state)} elects its House members by district. Add your street address for an exact match.`,
        address,
      })
    }
  }

  const handleViewProfiles = () => {
    if (lookup?.address) saveUserAddress(lookup.address)
    navigate('/my-representative')
  }

  return (
    <div className="bw landing">
      <SEO
        title="Open-Source Congressional Accountability"
        description="BallotWatch is an open-source congressional accountability platform for tracking representatives, bills, votes, methodology, and civic data."
        path="/"
        schema={{
          '@graph': [
            {
              '@type': 'WebSite',
              name: 'BallotWatch',
              url: 'https://www.ballotwatch.io',
              potentialAction: {
                '@type': 'SearchAction',
                target: 'https://www.ballotwatch.io/bills?search={search_term_string}',
                'query-input': 'required name=search_term_string',
              },
            },
            {
              '@type': 'Organization',
              name: 'BallotWatch',
              url: 'https://www.ballotwatch.io',
              logo: 'https://www.ballotwatch.io/capitol-logo.svg',
            },
          ],
        }}
      />

      {/* ===== HERO: direct headline + the one primary action ===== */}
      <section className="hero-banner">
        <img className="hero-bg" src="/congress.jpg" alt="The United States Capitol" />
        <div className="hero-shade"></div>
        <div className="hero-banner-inner">
          <h1 className="reveal d1">See how Congress <em>votes.</em></h1>
          <p className="hero-deck reveal d2">Find your senators and representative. See every vote they cast.</p>

          <form className="lookup-form reveal d3" onSubmit={handleLookup}>
            <label htmlFor="zipInput" className="visually-hidden">ZIP code</label>
            <input
              id="zipInput"
              ref={zipInputRef}
              type="text"
              inputMode="numeric"
              maxLength={5}
              placeholder="Enter your ZIP code"
              autoComplete="postal-code"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
            />
            <button type="submit">
              <span className="btn-word">Find my rep</span>
              <ArrowRight />
            </button>
          </form>
          <p className="lookup-hint reveal d3">Free · No account · Every number linked to its source</p>

          {lookup && (
            <div className="lookup-result visible" role="status">
              <span className="lr-district">{lookup.code}</span>
              <span className="lr-body">
                {lookup.body}
                {lookup.sub && <small>{lookup.sub}</small>}
              </span>
              {lookup.address && (
                <button type="button" className="lr-go" onClick={handleViewProfiles}>View profiles →</button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ===== SOURCES: trust, scannable ===== */}
      <section className="sources" aria-label="Data sources">
        <span className="sources-label">Built from public data</span>
        <div className="sources-list">
          {SOURCES.map((s) => (
            <span className="source" key={s.name}>
              <b>{s.name}</b>
              <span className="source-detail">{s.detail}</span>
            </span>
          ))}
        </div>
      </section>

      {/* ===== ON THE FLOOR: live feed of recorded votes ===== */}
      <section className="floor">
        <div className="floor-inner">
          <header className="floor-head">
            <span className="floor-title"><span className="floor-dot" />On the floor</span>
            <span className="floor-sub">
              {recordedThrough
                ? `Recorded through ${new Date(recordedThrough).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                : 'Latest recorded votes'}
            </span>
          </header>

          <ul className="floor-feed">
            {floor.map((v) => (
              <li className="floor-row" key={v.key}>
                <div className="fr-meta">
                  {v.chamber && <span className="fr-chamber">{v.chamber}</span>}
                  {v.rollLabel && <span className="fr-roll">{v.rollLabel}</span>}
                </div>
                <div className="fr-body">
                  {v.bill && (
                    v.bill.href
                      ? <Link className="fr-bill" to={v.bill.href}>{v.bill.display}</Link>
                      : <span className="fr-bill">{v.bill.display}</span>
                  )}
                  <span className="fr-text">{v.text}</span>
                </div>
                <div className="fr-outcome">
                  {v.tally && <span className="fr-tally">{v.tally}</span>}
                  {v.result && <span className={`fr-result ${v.resultKind}`}>{v.result}</span>}
                </div>
              </li>
            ))}
          </ul>

          <Link className="floor-more" to="/bills">Browse every bill <ArrowRight /></Link>
        </div>
      </section>

      {/* ===== COLOPHON ===== */}
      <footer className="colophon">
        <div className="colophon-inner">
          <span className="colophon-word">BallotWatch</span>
          <span>© 2026 · Public data and public methods</span>
          <div className="colophon-links">
            <Link to="/methodology">Methodology</Link>
            <Link to="/developers">API</Link>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
            <Link to="/open">Corrections</Link>
            <span>MIT</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Landing
