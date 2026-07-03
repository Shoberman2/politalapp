import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getDistrictFromAddress, US_STATES } from '../services/district'
import { getRecentBills, getFeaturedMembers, getTrendingBills } from '../services/congress'
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

// The "how it works" walkthrough. Each step pairs a plain-language promise with
// a small illustrative UI mock so the abstract concept lands visually. The mocks
// are representative, not live data; they're set dressing for the narrative.
const STEPS = [
  {
    id: 'find',
    title: 'Find who represents you.',
    body: 'One ZIP code maps you to your two senators and your House member, drawn from U.S. Census district data. Not a guess.',
    // visual is rendered from live member data in the component (see repsVisual).
    visual: null,
  },
  {
    id: 'votes',
    title: 'See every vote, with the receipts.',
    body: 'Each yea and nay is tied to the official roll call. No spin, no summary of a summary. The record, linked to its source.',
    visual: (
      <div className="mock mock-votes" aria-hidden="true">
        <div className="mk-vote">
          <span className="mk-bill">H.R. 4821</span>
          <span className="mk-desc">Energy Permitting Modernization</span>
          <span className="mk-yn yea">Yea</span>
        </div>
        <div className="mk-vote">
          <span className="mk-bill">S. 1402</span>
          <span className="mk-desc">Rural Broadband Access</span>
          <span className="mk-yn nay">Nay</span>
        </div>
        <div className="mk-vote">
          <span className="mk-bill">H.R. 9</span>
          <span className="mk-desc">Federal Permitting Reform</span>
          <span className="mk-yn yea">Yea</span>
        </div>
        <div className="mk-src">Source · Congress.gov Roll Call 312 <ArrowRight /></div>
      </div>
    ),
  },
  {
    id: 'explain',
    title: 'Understand any bill in plain English.',
    body: 'A source-linked explanation sits in the margin of every bill: what it does, who it affects, why it matters. Written to inform, not persuade.',
    // visual is rendered from a real current bill in the component (billVisual).
    visual: null,
  },
  {
    id: 'money',
    title: 'Follow the money.',
    body: 'Line up a member’s votes against who funds their campaigns, straight from FEC filings. Judge the pattern for yourself.',
    visual: (
      <div className="mock mock-money" aria-hidden="true">
        <div className="mk-bar"><span className="mk-bar-label">Energy &amp; Natural Resources</span><span className="mk-bar-track"><i style={{ '--w': '94%' }} /></span></div>
        <div className="mk-bar"><span className="mk-bar-label">Finance &amp; Insurance</span><span className="mk-bar-track"><i style={{ '--w': '71%' }} /></span></div>
        <div className="mk-bar"><span className="mk-bar-label">Health Professionals</span><span className="mk-bar-track"><i style={{ '--w': '48%' }} /></span></div>
        <div className="mk-bar"><span className="mk-bar-label">Labor Organizations</span><span className="mk-bar-track"><i style={{ '--w': '33%' }} /></span></div>
        <div className="mk-src">Source · FEC campaign filings <ArrowRight /></div>
      </div>
    ),
  },
]

// The opening film is a fast, silent run through the Capitol halls into the
// chamber: two quick elevated corridor flights, then a top-down over the seats
// where they sit. Clips play once and hand off; the last loops.
const FILM_CLIPS = [
  { src: '/hero-run.mp4', poster: '/hero-run.jpg', line: 'title' },
  { src: '/hero-run2.mp4', poster: '/hero-run2.jpg', line: null },
  { src: '/hero-topdown.mp4', poster: '/hero-topdown.jpg', line: 'question' },
]
const FILM_STATIC_INDEX = 2 // top-down chamber frame shown under reduced motion

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
  const rootRef = useRef(null)
  const zipInputRef = useRef(null)
  const videoRefs = useRef([])

  const [zip, setZip] = useState('')
  const [lookup, setLookup] = useState(null)
  const [floor, setFloor] = useState(FALLBACK_FLOOR)
  const [recordedThrough, setRecordedThrough] = useState(null)
  const [reduced, setReduced] = useState(false)
  const [current, setCurrent] = useState(0)
  const [playBlocked, setPlayBlocked] = useState(false)
  const [featuredMembers, setFeaturedMembers] = useState([])
  const [featuredBill, setFeaturedBill] = useState(null)

  // Real members for the "Find who represents you" illustration — actual names
  // and headshots instead of blank placeholders. Best-effort; the mock falls
  // back to a skeleton while this resolves (or if it fails).
  useEffect(() => {
    let cancelled = false
    getFeaturedMembers(3)
      .then((members) => { if (!cancelled) setFeaturedMembers(members) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // A real current bill (with a plain-English blurb from its CRS summary) for
  // the "Understand any bill" step and the "what are they voting on" closer.
  useEffect(() => {
    let cancelled = false
    getTrendingBills()
      .then((bills) => { if (!cancelled && bills?.length) setFeaturedBill(bills[0]) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Honor prefers-reduced-motion: no scroll-scored film, no video autoplay.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduced(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

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

  // Drive the clip sequence: play the current (muted) shot and pause the rest.
  // The videos advance themselves via `onEnded`.
  useEffect(() => {
    if (reduced) return
    videoRefs.current.forEach((v, i) => {
      if (!v) return
      if (i === current) {
        try { v.currentTime = 0 } catch { /* not seekable yet */ }
        v.muted = true
        const p = v.play()
        // If the browser blocks autoplay, surface a Play button instead of
        // silently leaving a frozen poster.
        if (p && p.then) p.then(() => setPlayBlocked(false)).catch(() => setPlayBlocked(true))
      } else {
        v.pause()
      }
    })
  }, [current, reduced])

  // Under reduced motion, hold on the chamber still with the question shown.
  useEffect(() => {
    if (reduced) setCurrent(FILM_STATIC_INDEX)
  }, [reduced])

  // Staggered entrance reveals for anything tagged [data-reveal].
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const items = root.querySelectorAll('[data-reveal]')
    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach((n) => n.classList.add('is-in'))
      return
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in')
          io.unobserve(e.target)
        }
      })
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' })
    items.forEach((n) => io.observe(n))
    return () => io.disconnect()
    // Re-run when `floor` swaps from the fallback to live votes: those rows are
    // brand-new DOM nodes the original observer never saw, so without this they
    // would stay stuck at opacity:0.
  }, [reduced, floor])

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
    zipInputRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
    // Wait for the scroll to settle before pulling focus so the page doesn't jump.
    window.setTimeout(() => zipInputRef.current?.focus(), reduced ? 0 : 420)
  }

  const advanceClip = () => setCurrent((c) => (c < FILM_CLIPS.length - 1 ? c + 1 : c))

  // Kick off playback from a real user gesture when the browser blocked autoplay.
  const startPlayback = () => {
    const v = videoRefs.current[current]
    if (!v) return
    v.muted = true
    const p = v.play()
    if (p && p.then) p.then(() => setPlayBlocked(false)).catch(() => {})
  }

  // Step-one illustration built from real members, with a skeleton fallback.
  const repsRows = featuredMembers.length ? featuredMembers : [null, null, null]
  const repsVisual = (
    <div className="mock mock-reps" aria-hidden="true">
      {repsRows.map((m, i) => {
        const bioguideId = m?.bioguideId
        const photo = m && (m.imageUrl || (bioguideId ? `https://www.congress.gov/img/member/${bioguideId.toLowerCase()}.jpg` : null))
        const partyKey = (m?.party || '').toLowerCase()
        const ptag = partyKey === 'r' ? 'r' : partyKey === 'i' ? 'i' : 'd'
        return (
          <div className="mk-rep" key={bioguideId || i}>
            {photo ? (
              <img
                className="mk-avatar"
                src={photo}
                alt=""
                loading="lazy"
                onError={(e) => {
                  const el = e.currentTarget
                  const fb = bioguideId ? `https://www.congress.gov/img/member/${bioguideId.toLowerCase()}.jpg` : ''
                  if (fb && el.src !== fb) el.src = fb
                  else el.style.visibility = 'hidden'
                }}
              />
            ) : (
              <span className="mk-avatar" />
            )}
            <span className="mk-lines">
              {m ? <b>{m.name}</b> : <b className="mk-skel" />}
              {m
                ? <small>{m.chamber === 'senate' ? 'U.S. Senate' : 'U.S. House'}{m.state ? ` · ${m.state}` : ''}</small>
                : <small className="mk-skel mk-skel-sm" />}
            </span>
            {m?.party && <span className={`ptag ${ptag}`}>{m.party}</span>}
          </div>
        )
      })}
    </div>
  )

  // Step-three illustration built from a real current bill (plain-English blurb).
  const billLabel = (b) => `${BILL_TYPE_LABELS[(b.type || '').toUpperCase()] || (b.type || '').toUpperCase()} ${b.number}`
  const billVisual = (
    <div className="mock mock-explain">
      <div className="mk-billhead">
        <span className="mk-billnum">{featuredBill ? billLabel(featuredBill) : 'H.R. —'}</span>
        <span className="mk-billcongress">{featuredBill ? `${featuredBill.congress || 119}th Congress` : ''}</span>
      </div>
      <p className="mk-billtitle">{featuredBill ? (featuredBill.headline || featuredBill.title) : 'Loading a current bill…'}</p>
      <div className="mk-annot">
        <p>{featuredBill ? truncate(featuredBill.whyItMatters || featuredBill.summary || featuredBill.latestAction?.text || '', 175) : ''}</p>
      </div>
      {featuredBill && <span className="mk-src">Source · Congress.gov <ArrowRight /></span>}
    </div>
  )

  return (
    <div className="bw landing" ref={rootRef}>
      <SEO
        title="See How Congress Votes: Source-Linked Records"
        description="BallotWatch is an open-source civic reference for reviewing representatives, bills, votes, methodology, and public legislative data."
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

      {/* ===== CINEMATIC OPENER: walk to the Capitol → down over the seats ===== */}
      <section className={`film${reduced ? ' film--static' : ''}`}>
        <div className="film-stage">
          {FILM_CLIPS.map((clip, i) => (
            <video
              key={clip.src}
              ref={(el) => { videoRefs.current[i] = el }}
              className={`film-vid${i === current ? ' is-current' : ''}`}
              src={clip.src}
              poster={clip.poster}
              autoPlay={i === 0 && !reduced}
              muted
              playsInline
              preload={i < 2 ? 'auto' : 'metadata'}
              loop={i === FILM_CLIPS.length - 1}
              onEnded={i === FILM_CLIPS.length - 1 ? undefined : advanceClip}
            />
          ))}
          <div className="film-grade" />

          {!reduced && playBlocked && (
            <button type="button" className="film-play" onClick={startPlayback} aria-label="Play the film">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            </button>
          )}

          <div className="film-copy">
            <div className="film-lines">
              <h1 className={`film-line film-title-a${FILM_CLIPS[current].line === 'title' ? ' show' : ''}`}>See how Congress <em>votes.</em></h1>
              <div className={`film-line film-questions${FILM_CLIPS[current].line === 'question' ? ' show' : ''}`}>
                <span className="film-q">Do you know who actually <em>sits here?</em></span>
              </div>
            </div>
          </div>

          {!reduced && (
            <div className="film-dots" aria-hidden="true">
              {FILM_CLIPS.map((clip, i) => (
                <button
                  key={clip.src}
                  type="button"
                  className={`film-dot${i === current ? ' on' : ''}`}
                  aria-label={`Go to shot ${i + 1}`}
                  onClick={() => setCurrent(i)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ===== THE TURN: the answer + the one primary action (ZIP lookup) ===== */}
      <section className="turn">
        <div className="turn-inner">
          <h2 className="turn-head" data-reveal>
            Your representatives cast hundreds of votes a year in that room.
            BallotWatch shows you every one, <em>with the receipts.</em>
          </h2>

          <form className="lookup-form" data-reveal onSubmit={handleLookup}>
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
              <span className="btn-word">Find my reps</span>
              <ArrowRight />
            </button>
          </form>
          <p className="lookup-hint" data-reveal>Free · No account · Source-linked records</p>

          {lookup && (
            <div className="lookup-result" role="status">
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

      {/* ===== STEP BY STEP: how the platform changes that ===== */}
      <section className="steps">
        <div className="steps-inner">
          <header className="steps-head" data-reveal>
            <h2>From an empty chamber to a clear record.</h2>
          </header>

          {STEPS.map((s, i) => (
            <article className="step" key={s.id} data-reveal>
              <div className="step-text">
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
              <div className="step-visual">{s.id === 'find' ? repsVisual : s.id === 'explain' ? billVisual : s.visual}</div>
            </article>
          ))}
        </div>
      </section>

      {/* ===== ON THE FLOOR: live feed of recorded votes ===== */}
      <section className="floor">
        <div className="floor-inner">
          <header className="floor-head" data-reveal>
            <span className="floor-title"><span className="floor-dot" />On the floor</span>
            <span className="floor-sub">
              {recordedThrough
                ? `Recorded through ${new Date(recordedThrough).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                : 'Latest recorded votes'}
            </span>
          </header>

          <ul className="floor-feed">
            {floor.map((v) => (
              <li className="floor-row" key={v.key} data-reveal>
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

          <Link className="floor-more" to="/bills">Browse bills and sources <ArrowRight /></Link>
        </div>
      </section>

      {/* ===== SOURCES: trust, scannable ===== */}
      <section className="sources" aria-label="Data sources" data-reveal>
        <span className="sources-label">Built from public records</span>
        <div className="sources-list">
          {SOURCES.map((s) => (
            <span className="source" key={s.name}>
              <b>{s.name}</b>
              <span className="source-detail">{s.detail}</span>
            </span>
          ))}
        </div>
      </section>

      {/* ===== VOTING: the second question, over a bill ===== */}
      <section className="voting">
        <video
          className="voting-vid"
          src="/hero-bill.mp4"
          poster="/hero-bill.jpg"
          autoPlay={!reduced}
          muted
          loop
          playsInline
          preload="metadata"
        />
        <div className="voting-grade" />
        <div className="voting-inner">
          <h2 className="voting-q" data-reveal>Do you know what they're actually <em>voting on?</em></h2>
          {featuredBill && (
            <Link
              to={`/bill/${featuredBill.congress || 119}/${(featuredBill.type || '').toLowerCase()}/${featuredBill.number}`}
              className="voting-bill"
              data-reveal
            >
              <span className="vb-num">{billLabel(featuredBill)}</span>
              <span className="vb-title">{featuredBill.headline || featuredBill.title}</span>
              <span className="vb-go">Read it in plain English <ArrowRight /></span>
            </Link>
          )}
          <Link to="/bills" className="voting-cta" data-reveal>Browse every bill <ArrowRight /></Link>
        </div>
      </section>

      {/* ===== FINALE: closing CTA ===== */}
      <section className="finale">
        <div className="finale-inner">
          <h2 data-reveal>Find out who’s speaking for you.</h2>
          <button type="button" className="finale-cta" data-reveal onClick={focusLookup}>
            Look up my representatives
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
