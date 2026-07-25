import { useCallback, useEffect, useRef, useState } from 'react'
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
    // visual is rendered from live recorded votes in the component (votesVisual).
    visual: null,
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

// The opening film is a silent, calm move through the REAL U.S. Capitol,
// built entirely from real, freely-licensed footage/photography (no AI):
//   1. the actual Capitol dome from the west lawn, gentle push-in
//      (real video, Pexels, free license),
//   2. up into the Rotunda dome — the Apotheosis of Washington fresco
//      (real photo, Carol Highsmith / Library of Congress, public domain).
// Deliberately short: two ~2s shots (~4s total). A landing film that outstays
// its welcome is a bounce, and every extra megabyte delays first frame — the
// clips are 1440px/CRF28 so the first one starts playing on load, not after a
// buffer. (A third shot, the Brumidi Corridors, was cut for length.)
// Clips play once and hand off; the last loops. See public/hero-*.{mp4,jpg}.
const FILM_CLIPS = [
  { src: '/hero-run.mp4', poster: '/hero-run.jpg', line: 'title' },
  { src: '/hero-topdown.mp4', poster: '/hero-topdown.jpg', line: 'question' },
]
const FILM_STATIC_INDEX = FILM_CLIPS.length - 1 // Rotunda frame shown under reduced motion

// The "On the floor" feed and the step-two mock render only real recorded
// votes. While the live fetch is in flight (or if it fails) we show neutral
// skeleton rows — never invented bills. See `floorReady` below.
const FLOOR_SKELETON = [0, 1, 2, 3]
// `floor` holds everything the fetch returned; the feed shows the most recent
// slice of it while the step-two mock picks the best-illustrated rows from the
// whole set. Truncating on fetch used to throw away the votes carrying tallies.
const FLOOR_FEED_ROWS = 5

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
  const videoRefs = useRef([])
  const votingVidRef = useRef(null)
  // The <video> ref callback below is an inline arrow, so React re-invokes it
  // on every render, not just on mount. Without this latch the opening shot
  // would be re-played each time state changed — invisibly, since by then the
  // film has crossfaded to the next clip — burning CPU behind the scenes.
  const openingKicked = useRef(false)

  const [zip, setZip] = useState('')
  const [lookup, setLookup] = useState(null)
  // Which of the two lookup forms was submitted, so the result renders next to
  // the field the reader actually used instead of somewhere off-screen.
  const [lookupPlace, setLookupPlace] = useState('turn')
  const [floor, setFloor] = useState([])
  const [floorReady, setFloorReady] = useState(false)
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
      try {
        const data = await getRecentFloorVotes(16).catch(() => null)
        if (cancelled) return
        // Keep anything with real substance to show. `v.text` was the original
        // predicate here, but that field is produced by fromFloorVote below and
        // never exists on a raw service vote — so this quietly kept only
        // bill-bearing rows and dropped every nomination, even though the
        // service deliberately carries their descriptions.
        const votes = (data?.votes || []).filter((v) => v.description || v.question || v.bill)
        if (votes.length >= 3) {
          setFloor(votes.map(fromFloorVote))
          if (data.recordedThrough) setRecordedThrough(data.recordedThrough)
          return
        }
        const bills = await getRecentBills(8).catch(() => [])
        if (cancelled) return
        const items = bills.filter((b) => b.latestAction?.text && b.number).map(fromBill)
        if (items.length >= 3) setFloor(items)
      } finally {
        // Mark the fetch resolved either way so the feed swaps skeletons for
        // real rows (and never falls back to invented bills).
        if (!cancelled) setFloorReady(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Start a clip muted, and surface a Play button only if the browser refuses.
  // `rewind` is for hand-offs (a clip we're returning to should start over);
  // the opening shot is never rewound, so kicking it twice can't stutter it.
  const playClip = useCallback((v, { rewind = false } = {}) => {
    if (!v) return
    v.muted = true
    if (rewind && v.currentTime > 0.05) {
      try { v.currentTime = 0 } catch { /* not seekable yet */ }
    }
    const p = v.play()
    if (p && p.then) p.then(() => setPlayBlocked(false)).catch(() => setPlayBlocked(true))
  }, [])

  // Drive the clip sequence: play the current (muted) shot and pause the rest.
  // The videos advance themselves via `onEnded`.
  useEffect(() => {
    if (reduced) return
    videoRefs.current.forEach((v, i) => {
      if (!v) return
      if (i === current) playClip(v, { rewind: true })
      else v.pause()
    })
  }, [current, reduced, playClip])

  // Bulletproof autoplay: muted clips should start on load, but a few browsers
  // still hold until a user gesture. The moment the user does anything (scroll,
  // tap, key), kick the active clip once — so the film is never a frozen poster.
  useEffect(() => {
    if (reduced) return
    const kick = () => {
      const v = document.querySelector('.film-vid.is-current')
      if (v) { v.muted = true; v.play().then(() => setPlayBlocked(false)).catch(() => {}) }
    }
    const events = ['pointerdown', 'touchstart', 'keydown', 'scroll']
    events.forEach((e) => window.addEventListener(e, kick, { once: true, passive: true }))
    return () => events.forEach((e) => window.removeEventListener(e, kick))
  }, [reduced])

  // Under reduced motion, hold on the chamber still with the question shown.
  useEffect(() => {
    if (reduced) setCurrent(FILM_STATIC_INDEX)
  }, [reduced])

  // The closing bill shot sits far below the fold. Autoplaying it at mount
  // steals bandwidth from the hero and leaves it mid-loop by the time anyone
  // scrolls to it — start it when it actually comes into view instead.
  useEffect(() => {
    const v = votingVidRef.current
    if (!v || reduced) return
    if (!('IntersectionObserver' in window)) {
      v.muted = true
      v.play().catch(() => {})
      return
    }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { v.muted = true; v.play().catch(() => {}) }
      else v.pause()
    }, { threshold: 0.2 })
    io.observe(v)
    return () => io.disconnect()
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
    // Re-run when the feed swaps skeletons for live votes: those rows are
    // brand-new DOM nodes the original observer never saw, so without this they
    // would stay stuck at opacity:0.
  }, [reduced, floor, floorReady])

  const handleLookup = async (e, place) => {
    e.preventDefault()
    setLookupPlace(place)
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

  const advanceClip = () => setCurrent((c) => (c < FILM_CLIPS.length - 1 ? c + 1 : c))

  // The one primary action, rendered at both the top of the page and the
  // bottom. The closing section runs the real lookup rather than bouncing the
  // reader back up to the top — a CTA that only scrolls is a dead end.
  const renderLookup = (place) => (
    <>
      <form className="lookup-form" data-reveal onSubmit={(e) => handleLookup(e, place)}>
        <label htmlFor={`zipInput-${place}`} className="visually-hidden">ZIP code</label>
        <input
          id={`zipInput-${place}`}
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

      {lookup && lookupPlace === place && (
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
    </>
  )

  // Kick off playback from a real user gesture when the browser blocked autoplay.
  const startPlayback = () => playClip(videoRefs.current[current])

  // Step-one illustration built from real members, with a skeleton fallback.
  const repsRows = featuredMembers.length ? featuredMembers : [null, null, null]
  const repsVisual = (
    <div className="mock mock-reps" aria-hidden="true">
      {repsRows.map((m, i) => {
        const bioguideId = m?.bioguideId
        const photo = m && (m.imageUrl || m.photoFallbackUrl)
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
                  // High-res unitedstates portrait failed (e.g. a brand-new
                  // member) — fall back to the API's own portrait, then hide.
                  const el = e.currentTarget
                  const fb = m.photoFallbackUrl
                  if (fb && el.dataset.fb !== '1') { el.dataset.fb = '1'; el.src = fb }
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

  // Step-two illustration, built from the same live floor votes (real bill
  // numbers and real yea–nay tallies) so it updates with the feed instead of
  // showing fixed set copy. Colored by outcome; sourced to the real roll call.
  // Best rows first — a bill number with a real tally — then top up with any
  // other real recorded vote. Requiring a tally outright used to leave this
  // stuck on skeletons whenever the tally data was thin; skeletons should only
  // ever mean "still loading", never "we had nothing to say".
  const votesRows = [
    ...floor.filter((v) => v.bill && v.tally),
    ...floor.filter((v) => v.bill && !v.tally),
    ...floor.filter((v) => !v.bill && v.text),
  ].slice(0, 3)
  const votesVisual = (
    <div className="mock mock-votes" aria-hidden="true">
      {(votesRows.length ? votesRows : [null, null, null]).map((v, i) => (
        v ? (
          <div className="mk-vote" key={v.key}>
            <span className="mk-bill">{v.bill ? v.bill.display : v.rollLabel}</span>
            <span className="mk-desc">{truncate(v.text, 30)}</span>
            {v.tally && <span className={`mk-yn ${v.resultKind === 'fail' ? 'nay' : 'yea'}`}>{v.tally}</span>}
          </div>
        ) : (
          <div className="mk-vote" key={`sk-${i}`}>
            <span className="mk-skel" style={{ width: 46, maxWidth: 'none', height: 11 }} />
            <span className="mk-skel" style={{ width: '74%', maxWidth: 'none', height: 11 }} />
            <span className="mk-skel" style={{ width: 40, maxWidth: 'none', height: 16, borderRadius: 6 }} />
          </div>
        )
      ))}
      {votesRows[0]?.rollLabel && (
        <div className="mk-src">Source · Congress.gov {votesRows[0].rollLabel} <ArrowRight /></div>
      )}
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

      {/* ===== CINEMATIC OPENER: approach the real Capitol → through the halls → up into the Rotunda ===== */}
      <section className={`film${reduced ? ' film--static' : ''}`}>
        <div className="film-stage">
          {FILM_CLIPS.map((clip, i) => (
            <video
              key={clip.src}
              // Set muted on the element itself: React's `muted` prop is not
              // always reflected to the DOM, and unmuted = blocked autoplay.
              ref={(el) => {
                videoRefs.current[i] = el
                if (!el) return
                el.muted = true; el.defaultMuted = true; el.playsInline = true
                // Don't wait for an effect (which runs after paint): kick the
                // opening shot the instant the element exists, so arriving on
                // the page shows motion, not a frozen poster. Once only —
                // see `openingKicked`.
                if (i === 0 && !reduced && !openingKicked.current) {
                  openingKicked.current = true
                  playClip(el)
                }
              }}
              className={`film-vid${i === current ? ' is-current' : ''}`}
              src={clip.src}
              poster={clip.poster}
              autoPlay={i === 0 && !reduced}
              muted
              playsInline
              preload="auto"
              loop={i === FILM_CLIPS.length - 1}
              // The element may exist before it has enough data to start; try
              // again the moment it does.
              onCanPlay={() => { if (i === current && !reduced) playClip(videoRefs.current[i]) }}
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
                <span className="film-q">Do you know what happens <em>under this dome?</em></span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== THE TURN: the answer + the one primary action (ZIP lookup) ===== */}
      <section className="turn">
        <div className="turn-inner">
          <h2 className="turn-head" data-reveal>
            Your representatives cast hundreds of votes a year in that room.
            BallotWatch shows you every one, <em>with the receipts.</em>
          </h2>

          {renderLookup('turn')}
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
              <div className="step-visual">{s.id === 'find' ? repsVisual : s.id === 'votes' ? votesVisual : s.id === 'explain' ? billVisual : s.visual}</div>
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
            {floorReady
              ? floor.slice(0, FLOOR_FEED_ROWS).map((v) => (
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
              ))
              : FLOOR_SKELETON.map((i) => (
                <li className="floor-row" key={`sk-${i}`} aria-hidden="true">
                  <div className="fr-meta"><span className="mk-skel" style={{ width: 58, maxWidth: 'none' }} /></div>
                  <div className="fr-body">
                    <span className="mk-skel" style={{ width: 78, maxWidth: 'none' }} />
                    <span className="mk-skel" style={{ width: '68%', maxWidth: 'none', marginTop: 6 }} />
                  </div>
                  <div className="fr-outcome"><span className="mk-skel" style={{ width: 54, maxWidth: 'none', height: 14 }} /></div>
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
          ref={votingVidRef}
          className="voting-vid"
          src="/hero-bill.mp4"
          poster="/hero-bill.jpg"
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
          <span className="finale-kicker" data-reveal>Start with your ZIP</span>
          <h2 data-reveal>Find out who’s speaking for you.</h2>
          {renderLookup('finale')}
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
