import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getDistrictFromAddress, US_STATES } from '../services/district'
import { getRecentBills, getFeaturedMembers, getTrendingBills } from '../services/congress'
import { getRecentFloorVotes, rollCallHref } from '../services/floorVotes'
import { saveUserAddress } from '../services/userService'
import SEO from './SEO'
import ThisWeekOnFloor from './ThisWeekOnFloor'
import { BRAND } from '../config/brand'
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

// The record, in three steps. Every illustration renders from live data
// (members, recorded votes, a current bill); skeletons only while loading.
const STEPS = [
  {
    id: 'find',
    title: 'Find who represents you.',
    body: 'One ZIP code maps you to your two senators and your House member, drawn from U.S. Census district data. Not a guess.',
  },
  {
    id: 'votes',
    title: 'See how they voted, on every roll call.',
    body: 'Each yea and nay is tied to the official roll call, this week’s and every one before it. The record, linked to its source.',
  },
  {
    id: 'explain',
    title: 'Read any bill, past or present, in plain English.',
    body: 'An AI explanation built from the official summary sits in the margin of every bill, labeled as AI and linked to Congress.gov. Written to inform, not persuade.',
  },
]

// Where AI is used and where it never is. This is the substance behind the
// mission line, so it's stated as plain lists rather than a pitch.
const AI_USES = [
  'Explain bills from the official summary, with the source beside it',
  'Explain what a procedural vote actually decided',
  'Help you, or your AI assistant, find the right roll call',
]
const AI_NEVER = [
  'Write in your representative’s voice or guess their positions',
  'Send anything you haven’t read and approved',
  'Choose a side for you, or rank and score constituents',
]

const WRITE_STEPS = ['You write', 'You approve the exact text', 'You send it to the office', 'You see how they vote next']

// The hero card and the step-two mock render only real recorded votes. While
// the live fetch is in flight (or if it fails) they show neutral skeletons —
// never invented bills. See `floorReady` below. `floor` keeps everything the
// fetch returned so the mock can pick the best-illustrated rows; truncating on
// fetch used to throw away the votes carrying tallies.

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
    voteHref: rollCallHref(v.id),
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
  const [zip, setZip] = useState('')
  const [lookup, setLookup] = useState(null)
  // Which of the two lookup forms was submitted, so the result renders next to
  // the field the reader actually used instead of somewhere off-screen.
  const [lookupPlace, setLookupPlace] = useState('hero')
  const [floor, setFloor] = useState([])
  const [floorReady, setFloorReady] = useState(false)
  const [recordedThrough, setRecordedThrough] = useState(null)
  const [reduced, setReduced] = useState(false)
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

  // Honor prefers-reduced-motion: no entrance reveals.
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
        <button type="submit" aria-label="Find my representatives">
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

  // The hero's proof: the most recent recorded vote with a bill and a real
  // tally, else the most recent recorded vote of any kind. Never invented.
  const headlineVote = floor.find((v) => v.voteHref && v.bill && v.tally) || floor.find((v) => v.voteHref) || null
  const recordedLabel = recordedThrough
    ? new Date(recordedThrough).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <div className="bw landing" ref={rootRef}>
      <SEO
        title="How Did Your Representative Vote This Week?"
        description={`${BRAND.mission} Every vote, bill, and member of Congress, linked to its official source.`}
        path="/"
        schema={{
          '@graph': [
            {
              '@type': 'WebSite',
              name: BRAND.name,
              url: 'https://www.ballotwatch.io',
              potentialAction: {
                '@type': 'SearchAction',
                target: 'https://www.ballotwatch.io/bills?search={search_term_string}',
                'query-input': 'required name=search_term_string',
              },
            },
            {
              '@type': 'Organization',
              name: BRAND.name,
              url: 'https://www.ballotwatch.io',
              logo: 'https://www.ballotwatch.io/capitol-logo.svg',
            },
          ],
        }}
      />

      {/* ===== HERO: the question, the mission, the lookup, and a real vote as proof ===== */}
      <section className="hero">
        <div className="hero-inner">
          <span className="hero-kicker">
            {recordedLabel ? `Recorded through ${recordedLabel} · 119th Congress` : '119th Congress'}
          </span>
          <h1 className="hero-title">How did your representative vote <em>this week?</em></h1>
          <p className="hero-mission">{BRAND.mission}</p>

          {renderLookup('hero')}

          <div className="headline-vote" aria-live="polite">
            {!floorReady ? (
              <div className="hv-card" aria-hidden="true">
                <span className="mk-skel" style={{ width: 160, maxWidth: 'none' }} />
                <span className="mk-skel" style={{ width: '80%', maxWidth: 'none', height: 18, marginTop: 10 }} />
                <span className="mk-skel" style={{ width: 120, maxWidth: 'none', marginTop: 12 }} />
              </div>
            ) : headlineVote && (
              <div className="hv-card">
                <div className="hv-meta">
                  <span>Latest recorded vote</span>
                  {headlineVote.chamber && <span>{headlineVote.chamber}</span>}
                  {headlineVote.rollLabel && <span>{headlineVote.rollLabel}</span>}
                </div>
                <div className="hv-main">
                  <p className="hv-text">
                    {headlineVote.bill && <span className="hv-bill">{headlineVote.bill.display}</span>}
                    {headlineVote.text}
                  </p>
                  <div className="hv-outcome">
                    {headlineVote.tally && <span className="fr-tally">{headlineVote.tally}</span>}
                    {headlineVote.result && <span className={`fr-result ${headlineVote.resultKind}`}>{headlineVote.result}</span>}
                  </div>
                </div>
                <div className="hv-links">
                  <Link to={headlineVote.voteHref}>How each member voted <ArrowRight /></Link>
                  <Link to={`${headlineVote.voteHref}#tell-your-rep`}>Write to your rep about this vote <ArrowRight /></Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ===== THE RECORD: who represents you, how they voted, what the bills say ===== */}
      <section className="steps">
        <div className="steps-inner">
          <header className="steps-head" data-reveal>
            <h2>The whole record, in one place.</h2>
          </header>

          {STEPS.map((s) => (
            <article className="step" key={s.id} data-reveal>
              <div className="step-text">
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
              <div className="step-visual">{s.id === 'find' ? repsVisual : s.id === 'votes' ? votesVisual : billVisual}</div>
            </article>
          ))}
        </div>
      </section>

      {/* ===== THIS WEEK ON THE FLOOR: scheduled (House) beside just recorded ===== */}
      <section className="floor">
        <div className="floor-inner" data-reveal>
          <ThisWeekOnFloor limit={5} />
          <div className="floor-links">
            <Link className="floor-more" to="/this-week">This week on the floor <ArrowRight /></Link>
            <Link className="floor-more" to="/bills">Browse every bill, past and present <ArrowRight /></Link>
          </div>
        </div>
      </section>

      {/* ===== AI, STATED PLAINLY: where it's used and where it never is ===== */}
      <section className="ai">
        <div className="ai-inner">
          <header className="ai-head" data-reveal>
            <span className="section-kicker">How we use AI</span>
            <h2>More people reading the record. More people heard. Nobody speaking for anyone.</h2>
          </header>
          <div className="ai-cols" data-reveal>
            <div className="ai-col">
              <h3>We use AI to</h3>
              <ul>{AI_USES.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            <div className="ai-col ai-col-never">
              <h3>We never use AI to</h3>
              <ul>{AI_NEVER.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          </div>
          <Link className="floor-more" to="/methodology/ai-explanations" data-reveal>How AI explanations are made <ArrowRight /></Link>
        </div>
      </section>

      {/* ===== WRITE: read the vote, then write to the person who cast it ===== */}
      <section className="write">
        <div className="write-inner">
          <header className="write-head" data-reveal>
            <span className="section-kicker">Tell your rep</span>
            <h2>Read the vote. Then write to the person who cast it.</h2>
          </header>
          <ol className="write-steps" data-reveal>
            {WRITE_STEPS.map((t, i) => (
              <li key={t}><span className="ws-num">{i + 1}</span>{t}</li>
            ))}
          </ol>
          <p className="write-note" data-reveal>
            Every roll call and bill page starts a message with the facts already in it: the vote, how your
            member voted, and the official source. You add why it matters to you. {BRAND.name} doesn’t send it
            for you; you send it through your representative’s official contact page, the way their office
            already counts mail.
          </p>
          {headlineVote && (
            <Link className="floor-more" to={`${headlineVote.voteHref}#tell-your-rep`} data-reveal>
              Start with the latest vote <ArrowRight />
            </Link>
          )}
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

      {/* ===== FOR OFFICES: one band, one link; the page belongs to constituents ===== */}
      <section className="offices-band">
        <div className="offices-inner">
          <span className="section-kicker" data-reveal>If you work in a congressional office</span>
          <h2 data-reveal>A better way for constituents to reach your office, and for your office to answer.</h2>
          <div className="offices-points" data-reveal>
            <p><b>Answer before it becomes mail.</b> “How did the Member vote on this bill?” answered from the official record and your office’s own published statements, cited every time.</p>
            <p><b>Mail you can use.</b> One message per person, written and approved by that person, tagged to the exact bill or roll call it’s about.</p>
            <p><b>Nothing in your name.</b> No generated statements, no automated replies, nothing sent without the constituent’s approval.</p>
          </div>
          <p className="offices-status" data-reveal>
            In development. Not yet authorized for use by House or Senate offices, and not offered for sale or trial.
          </p>
          <Link className="floor-more" to="/offices" data-reveal>How it would work for your office <ArrowRight /></Link>
        </div>
      </section>

      {/* ===== FOR DEVELOPERS AND AI ASSISTANTS ===== */}
      <section className="devs">
        <div className="devs-inner" data-reveal>
          <div className="devs-text">
            <span className="section-kicker">For developers and AI assistants</span>
            <h2>The same record, open to anyone who builds.</h2>
            <p>A keyless public API, an MCP server your assistant can call, and <code>/llms.txt</code>. Every answer carries its official source.</p>
            <div className="devs-links">
              <Link to="/developers/docs">API docs</Link>
              <a href="/llms.txt">llms.txt</a>
              <Link to="/open">Open data</Link>
            </div>
          </div>
          <pre className="devs-code" aria-label="Example requests"><code>{`curl https://www.ballotwatch.io/api/v1/votes

# MCP (Streamable HTTP), no key needed
https://www.ballotwatch.io/mcp`}</code></pre>
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
          <span className="colophon-word">{BRAND.name}</span>
          <span>© 2026 · Public data and public methods · Not affiliated with the U.S. Congress</span>
          <div className="colophon-links">
            <Link to="/methodology">Methodology</Link>
            <Link to="/offices">For offices</Link>
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
