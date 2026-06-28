import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getDistrictFromAddress, US_STATES } from '../services/district'
import { getRecentBills } from '../services/congress'
import { saveUserAddress } from '../services/userService'
import SEO from './SEO'
import '../styles/Landing.css'

const ArrowRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
)

const GITHUB_URL = 'https://github.com/Shoberman2/politalapp'

// Sample copy shown until (or in case) the live floor-actions fetch resolves.
const FALLBACK_TICKER = [
  { id: 'H.R. 4821', text: 'Passed House 248-176 · Energy Permitting Modernization Act' },
  { id: 'S. 1402', text: 'Cloture invoked 61-38 · Rural Broadband Access Act' },
  { id: 'H.R. 9', text: 'In committee markup · Federal Permitting Reform' },
  { id: 'S. 2210', text: 'Reported to Senate · Veterans Telehealth Expansion Act' },
]

const BILL_TYPE_LABELS = {
  HR: 'H.R.', S: 'S.', HRES: 'H.Res.', SRES: 'S.Res.',
  HJRES: 'H.J.Res.', SJRES: 'S.J.Res.', HCONRES: 'H.Con.Res.', SCONRES: 'S.Con.Res.',
}

const truncate = (str, max) => (str.length > max ? `${str.slice(0, max - 1).trimEnd()}…` : str)

const stateName = (abbr) => US_STATES.find((s) => s.abbr === abbr)?.name || abbr

function Landing() {
  const navigate = useNavigate()
  const zipInputRef = useRef(null)

  const [zip, setZip] = useState('')
  const [lookup, setLookup] = useState(null)
  const [tickerItems, setTickerItems] = useState(FALLBACK_TICKER)

  // Floor ticker: latest actions from Congress.gov.
  useEffect(() => {
    let cancelled = false
    getRecentBills(8)
      .then((bills) => {
        if (cancelled) return
        const items = bills
          .filter((b) => b.latestAction?.text && b.title && b.number)
          .map((b) => ({
            id: `${BILL_TYPE_LABELS[b.type] || b.type} ${b.number}`,
            text: `${truncate(b.latestAction.text, 90)} · ${truncate(b.title, 80)}`,
          }))
        if (items.length >= 3) setTickerItems(items)
      })
      .catch(() => { /* keep fallback copy */ })
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

  const focusLookup = () => {
    const input = zipInputRef.current
    if (!input) return
    input.scrollIntoView({ behavior: 'smooth', block: 'center' })
    input.focus({ preventScroll: true })
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

      {/* ===== HERO BANNER ===== */}
      <section className="hero-banner">
        <img className="hero-bg" src="/congress.jpg" alt="The United States Capitol" />
        <div className="hero-shade"></div>
        <div className="hero-banner-inner">
          <h1 className="reveal d1">Congress <em>on the record.</em></h1>
        </div>
      </section>

      {/* ===== ZIP LOOKUP BAND ===== */}
      <section className="lookup-band">
        <p className="hero-deck reveal d2">Every vote. Every bill. Every dollar. With the source behind every number.</p>

        <div className="lookup reveal d3">
          <form className="lookup-form" onSubmit={handleLookup}>
            <label htmlFor="zipInput" className="visually-hidden">ZIP code</label>
            <input
              id="zipInput"
              ref={zipInputRef}
              type="text"
              inputMode="numeric"
              maxLength={5}
              placeholder="Your ZIP code"
              autoComplete="postal-code"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
            />
            <button type="submit">
              <span className="btn-word">Find my rep</span>
              <ArrowRight />
            </button>
          </form>
          <p className="lookup-hint">Free · No account · Source-linked</p>
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

      {/* ===== FLOOR TICKER ===== */}
      <aside className="ticker" aria-label="Today on the floor">
        <div className="ticker-inner">
          <span className="ticker-label">Live · On the floor</span>
          <div className="ticker-viewport">
            <div className="ticker-track">
              {[false, true].map((isCopy) => (
                <div className="ticker-group" key={isCopy ? 'copy' : 'main'} aria-hidden={isCopy || undefined}>
                  {tickerItems.map((item, i) => (
                    <span className="ticker-item" key={`${item.id}-${i}`}>
                      <span className="tid">{item.id}</span>{item.text}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* ===== CLOSING CTA ===== */}
      <section className="closing" id="open">
        <h2>Know how <em>your</em> Congress votes.</h2>
        <div className="closing-cta">
          <button className="btn btn-primary" onClick={focusLookup}>
            Find my representative
            <ArrowRight />
          </button>
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
