import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getDistrictFromAddress, US_STATES } from '../services/district'
import { getRecentBills, getFeaturedMembers, getTrendingBills } from '../services/congress'
import { getRecentFloorVotes, pickHeadlineVote, inboxFields, rollCallHref, hasSomethingToShow } from '../services/floorVotes'
import { getMemberRecord } from '../services/memberRecord'
import { saveUserAddress } from '../services/userService'
import { findMembersForDistrict } from '../services/myMembers'
import { displayName } from '../utils/tellYourRepDraft'
import RecordLink from './RecordLink'
import SEO from './SEO'
import { BRAND } from '../config/brand'
import { LANDING_FAQ as FAQ } from '../data/landingFaq'
import { HOME_TITLE, HOME_DESCRIPTION, HOME_FEATURES, homeJsonLdGraph } from '../data/homeSeo'
import { isAtLargeState } from '../../shared/atLargeStates.js'
import { voteSourceUrl } from '../../api/_lib/rollCallResult.js'
import '../styles/Landing.css'

// The line under both ZIP fields (wording from the privacy audit, 2026-10-06).
const LOOKUP_HINT = 'No sign-up to look up. Your ZIP code never reaches our servers.'

const ArrowRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
)

const BILL_TYPE_LABELS = {
  HR: 'H.R.', S: 'S.', HRES: 'H.Res.', SRES: 'S.Res.',
  HJRES: 'H.J.Res.', SJRES: 'S.J.Res.', HCONRES: 'H.Con.Res.', SCONRES: 'S.Con.Res.',
}



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

const NO_VOTE = 'No recorded vote available right now.'
const NO_RECORD = 'The record could not be loaded right now.'
// The hero ticker: at most this many votes, and at least this long a loop.
const TICKER_MAX = 12
const TICKER_SECONDS_PER_ITEM = 7
const TICKER_MIN_SECONDS = 40
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

const reducedMotionQuery = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia(REDUCED_MOTION)
  : null)

// True when the reader asked for less motion; follows the setting live. Older
// Safari only has the deprecated addListener/removeListener pair.
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => !!reducedMotionQuery()?.matches)
  useEffect(() => {
    const mq = reducedMotionQuery()
    if (!mq) return undefined
    const onChange = (e) => setReduced(!!e.matches)
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    if (typeof mq.addListener === 'function') {
      mq.addListener(onChange)
      return () => mq.removeListener(onChange)
    }
    return undefined
  }, [])
  return reduced
}

// Copies of the ticker list needed for a seamless loop: the track shifts by
// one copy, so the copies must cover the viewport plus one copy. Never fewer
// than two (also the answer when nothing can be measured).
function tickerCopies(viewportWidth, copyWidth) {
  if (!(viewportWidth > 0) || !(copyWidth > 0)) return 2
  return Math.max(2, Math.ceil(viewportWidth / copyWidth) + 1)
}

// The ticker item's accessible name, e.g. "House roll call 412, H.R. 9340:
// A bill to fund the parks, 215 to 210, Passed". Missing parts are left out.
function tickerItemLabel(v, subject) {
  const roll = v.chamber && v.number != null ? `${v.chamber} roll call ${v.number}`
    : v.chamber ? v.chamber
      : v.number != null ? `Roll call ${v.number}` : null
  const clean = subject ? subject.replace(/[\s.,;:]+$/, '') : subject
  const about = v.bill?.display ? (clean ? `${v.bill.display}: ${clean}` : v.bill.display) : clean
  const tally = v.yea != null && v.nay != null ? `${v.yea} to ${v.nay}` : null
  return [roll, about, tally, v.result].filter(Boolean).join(', ')
}

function fromFloorVote(v) {
  return {
    key: v.id,
    chamber: v.chamber,
    number: v.number ?? null,
    rollLabel: v.number != null ? `Roll Call ${v.number}` : null,
    voteHref: rollCallHref(v.id),
    bill: v.bill,
    text: truncate(v.description || v.question || '', 92),
    question: v.question || null,
    description: v.description || null,
    votedAt: v.votedAt || null,
    yea: v.yea,
    nay: v.nay,
    tally: v.yea != null && v.nay != null ? `${v.yea}–${v.nay}` : null,
    result: v.result,
    resultKind: resultKindOf(v.result),
  }
}

// "Motion to Invoke Cloture on the Motion to Proceed to H.R. 9340; A bill to
// amend…" reads as procedure first. Keep what the vote was about: the bill's
// own words after the semicolon, else the description, else the question.
// Long subjects are cut at a word boundary to at most `max` characters,
// ellipsis included, without a dangling comma, semicolon or colon.
function voteSubject(v, max = 110) {
  const desc = String(v.description || '')
  const after = desc.includes(';') ? desc.slice(desc.indexOf(';') + 1).trim() : ''
  const text = after || desc || v.question || ''
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  const head = space > 0 ? cut.slice(0, space) : cut.slice(0, max - 1)
  return `${head.trimEnd().replace(/[,;:]$/, '')}…`
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
  const [zip, setZip] = useState('')
  const [lookup, setLookup] = useState(null)
  // Which of the two lookup forms was submitted, so the result renders next to
  // the field the reader actually used instead of somewhere off-screen.
  const [lookupPlace, setLookupPlace] = useState('hero')
  // Guards the member fetch against a newer lookup finishing first.
  const lookupSeq = useRef(0)
  const [floor, setFloor] = useState([])
  // The raw recorded votes behind the feed; the headline vote is picked from
  // these with the same rule /offices uses (pickHeadlineVote).
  const [floorVotes, setFloorVotes] = useState([])
  // votesReady: the recorded votes have resolved (the hero, agents and offices
  // cards read only these). floorReady: the feed is final, which may wait for
  // the bills fallback below.
  const [votesReady, setVotesReady] = useState(false)
  const [floorReady, setFloorReady] = useState(false)
  const [recordedThrough, setRecordedThrough] = useState(null)
  const reducedMotion = usePrefersReducedMotion()
  // The hero ticker: paused by the reader's Pause control; focused while a
  // link inside it has keyboard focus (the strip stops and scrolls instead).
  const [tickerPaused, setTickerPaused] = useState(false)
  const [tickerFocused, setTickerFocused] = useState(false)
  const [tickerCopyCount, setTickerCopyCount] = useState(2)
  const tickerViewportRef = useRef(null)
  const tickerGroupRef = useRef(null)
  const [featuredMembers, setFeaturedMembers] = useState([])
  const [featuredBill, setFeaturedBill] = useState(null)
  const [featuredRecord, setFeaturedRecord] = useState(null)
  // Failures end the skeletons: a mock shows a one-line fallback instead of
  // loading forever.
  const [membersFailed, setMembersFailed] = useState(false)
  const [recordFailed, setRecordFailed] = useState(false)
  const [billFailed, setBillFailed] = useState(false)

  // Real members for the "Find who represents you" illustration — actual names
  // and headshots instead of blank placeholders. Best-effort; the mock shows
  // a skeleton while this resolves and a one-line fallback if it fails.
  useEffect(() => {
    let cancelled = false
    getFeaturedMembers(3)
      .then((members) => {
        if (cancelled) return
        if (members?.length) setFeaturedMembers(members)
        else { setMembersFailed(true); setRecordFailed(true) }
      })
      .catch(() => { if (!cancelled) { setMembersFailed(true); setRecordFailed(true) } })
    return () => { cancelled = true }
  }, [])

  // The "record in 60 seconds" illustration: the real card for the first
  // featured member. Best-effort; a skeleton while it loads, a one-line
  // fallback if it fails.
  const recordMemberId = featuredMembers[0]?.bioguideId
  useEffect(() => {
    if (!recordMemberId) return undefined
    let cancelled = false
    getMemberRecord(recordMemberId)
      .then((r) => {
        if (cancelled) return
        if (r) setFeaturedRecord(r)
        else setRecordFailed(true)
      })
      .catch(() => { if (!cancelled) setRecordFailed(true) })
    return () => { cancelled = true }
  }, [recordMemberId])

  // A real current bill (with a plain-English blurb from its CRS summary) for
  // the "Understand any bill" step and the "what are they voting on" closer.
  useEffect(() => {
    let cancelled = false
    getTrendingBills()
      .then((bills) => {
        if (cancelled) return
        if (bills?.length) setFeaturedBill(bills[0])
        else setBillFailed(true)
      })
      .catch(() => { if (!cancelled) setBillFailed(true) })
    return () => { cancelled = true }
  }, [])


  // "On the floor" feed: prefer real recorded votes (with tallies), then fall
  // back to the latest legislative actions, then to static copy.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // The service never rejects: a failed query resolves to null.
        const data = await getRecentFloorVotes(16)
        if (cancelled) return
        const all = data?.votes || []
        // The headline pick (pickHeadlineVote) applies its own rule to all of
        // them; the feed keeps the rows with something to show.
        setFloorVotes(all)
        setVotesReady(true)
        const votes = all.filter(hasSomethingToShow)
        if (votes.length >= 3) {
          setFloor(votes.map(fromFloorVote))
          if (data.recordedThrough) setRecordedThrough(data.recordedThrough)
          return
        }
        const bills = await getRecentBills(8).catch(() => [])
        if (cancelled) return
        const items = bills.filter((b) => b.latestAction?.text && b.number).map(fromBill)
        if (items.length >= 3) setFloor(items)
      } catch {
        // The service resolves to null on a failed query, so this only runs
        // if a future change (or a test double) makes it reject: treat that
        // like an empty feed rather than leaving an unhandled rejection.
      } finally {
        // Mark the fetch resolved either way so the feed swaps skeletons for
        // real rows (and never falls back to invented bills).
        if (!cancelled) { setVotesReady(true); setFloorReady(true) }
      }
    })()
    return () => { cancelled = true }
  }, [])


  const handleLookup = async (e, place) => {
    e.preventDefault()
    setLookupPlace(place)
    const seq = ++lookupSeq.current
    const value = zip.trim()
    if (!/^\d{5}$/.test(value)) {
      setLookup({
        code: '· · ·',
        body: 'Enter a five-digit ZIP code to find your district.',
        sub: 'A ZIP code finds your state and senators. A street address finds your House district.',
      })
      return
    }

    setLookup({ code: value, body: 'Matching your ZIP to a district…', sub: '' })
    const info = await getDistrictFromAddress(value)
    if (seq !== lookupSeq.current) return

    if (!info?.state) {
      setLookup({
        code: '· · ·',
        body: `We couldn't match ZIP ${value} to a state.`,
        sub: 'Check the ZIP code or try the full address form.',
      })
      return
    }

    const address = { street: '', city: info.city || '', state: info.state, zip: value }
    // Only an at-large state's ZIP pins down the House seat. Montana and every
    // other multi-district state need a street address (shared/atLargeStates.js),
    // so there only the senators are named.
    const houseKnown = info.district != null && isAtLargeState(info.state)
    const base = houseKnown
      ? {
        code: `${info.state}-AL`,
        body: '1 Representative and 2 Senators found.',
        sub: `${stateName(info.state)} at-large district. Voting records and finance with sources.`,
      }
      : {
        code: info.state,
        body: '2 Senators found.',
        sub: `${stateName(info.state)} elects its House members by district. Add your street address for an exact match.`,
      }
    setLookup({ ...base, address, houseKnown, members: null, membersStatus: 'loading' })

    let members = []
    let membersStatus = 'done'
    try {
      members = await findMembersForDistrict(info.state, houseKnown ? info.district : null)
    } catch {
      membersStatus = 'error'
    }
    if (seq !== lookupSeq.current) return
    const house = members.filter((m) => m.chamber === 'house').length
    const senators = members.filter((m) => m.chamber === 'senate').length
    const parts = [
      house ? `${house} Representative${house === 1 ? '' : 's'}` : null,
      senators ? `${senators} Senator${senators === 1 ? '' : 's'}` : null,
    ].filter(Boolean)
    setLookup({
      ...base,
      // Say what was actually found, not what a state usually has.
      body: membersStatus === 'done' ? (parts.length ? `${parts.join(' and ')} found.` : `No ${houseKnown ? 'members' : 'senators'} found for ${stateName(info.state)}.`) : base.body,
      address,
      houseKnown,
      members,
      membersStatus,
    })
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
      <form className="lookup-form" onSubmit={(e) => handleLookup(e, place)}>
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
        <button type="submit" className="btn-primary" aria-label="Find my representatives">
          <span className="btn-word">Find my reps</span>
          <ArrowRight />
        </button>
      </form>
      <p className="lookup-hint">{LOOKUP_HINT}</p>

      {lookup && lookupPlace === place && (
        <div className="lookup-result" role="status">
          <span className="lr-district">{lookup.code}</span>
          <span className="lr-body">
            {lookup.body}
            {lookup.sub && <small>{lookup.sub}</small>}
          </span>
          {lookup.address && (
            <button type="button" className="lr-go btn-text btn-go" onClick={handleViewProfiles}>
              {lookup.houseKnown ? 'View profiles' : 'Add your address'}
            </button>
          )}
          {lookup.membersStatus === 'loading' && <p className="lr-note">Finding the members by name…</p>}
          {lookup.membersStatus === 'error' && <p className="lr-note">Member names could not be loaded right now.</p>}
          {lookup.members?.length > 0 && (
            <ul className="lr-members">
              {lookup.members.map((m) => (
                <li key={m.bioguideId}>
                  <span className="lr-m-name">{displayName(m.name)}</span>
                  <span className="lr-m-seat">{m.chamber === 'senate' ? 'Senator' : 'Representative'}</span>
                  <RecordLink bioguideId={m.bioguideId} name={displayName(m.name)} className="lr-m-record" />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )

  // Step-one illustration built from real members, with a skeleton fallback.
  const repsRows = featuredMembers.length ? featuredMembers : membersFailed ? [] : [null, null, null]
  const repsVisual = (
    <div className="mock mock-reps" aria-hidden="true">
      {membersFailed && <p className="mk-unavailable">Members could not be loaded right now.</p>}
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
        {featuredBill
          ? <span className="mk-billnum">{billLabel(featuredBill)}</span>
          : !billFailed && <span className="mk-skel" style={{ width: 72, maxWidth: 'none' }} />}
        <span className="mk-billcongress">{featuredBill ? `${featuredBill.congress || 119}th Congress` : ''}</span>
      </div>
      <p className="mk-billtitle">{featuredBill ? (featuredBill.headline || featuredBill.title) : billFailed ? 'A current bill could not be loaded right now.' : 'Loading a current bill…'}</p>
      {!billFailed && (
        <div className="mk-annot">
          <span className="mk-annot-tag">From the official summary</span>
          <p>{featuredBill ? truncate(featuredBill.whyItMatters || featuredBill.summary || featuredBill.latestAction?.text || '', 175) : ''}</p>
        </div>
      )}
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
      {floorReady && !votesRows.length && <p className="mk-unavailable">{NO_VOTE}</p>}
      {(votesRows.length ? votesRows : floorReady ? [] : [null, null, null]).map((v, i) => (
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

  // The hero's proof, picked by pickHeadlineVote (the same pick as /offices):
  // the latest vote with a roll-call page, a bill and a real tally, else the
  // latest vote with a roll-call page and anything to show. Never invented.
  const headlineRaw = pickHeadlineVote(floorVotes)
  const headlineVote = headlineRaw ? fromFloorVote(headlineRaw) : null
  // The hero ticker: the recorded votes newest first (the service order), only
  // ones with a roll-call page to link to. Real data only; never padded.
  const tickerVotes = floorVotes
    .filter(hasSomethingToShow)
    .map(fromFloorVote)
    .filter((v) => v.voteHref)
    .slice(0, TICKER_MAX)
  // Seconds for the track to move by one copy of the list.
  const tickerSeconds = Math.max(TICKER_MIN_SECONDS, TICKER_SECONDS_PER_ITEM * tickerVotes.length)
  const tickerRolling = votesReady && tickerVotes.length > 0 && !reducedMotion
  const tickerKeys = tickerVotes.map((v) => v.key).join('|')
  // Measure one copy against the viewport so even a one-vote list covers the
  // strip with no gap; re-measured when either changes size.
  useLayoutEffect(() => {
    if (!tickerRolling) return undefined
    const measure = () => {
      const viewport = tickerViewportRef.current
      const group = tickerGroupRef.current
      if (!viewport || !group) return
      setTickerCopyCount(tickerCopies(viewport.getBoundingClientRect().width, group.getBoundingClientRect().width))
    }
    measure()
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(measure)
      if (tickerViewportRef.current) ro.observe(tickerViewportRef.current)
      if (tickerGroupRef.current) ro.observe(tickerGroupRef.current)
      return () => ro.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [tickerRolling, tickerKeys])
  const tickerCopiesShown = reducedMotion ? 1 : tickerCopyCount
  // The track renders the list `tickerCopiesShown` times back to back and
  // shifts by one copy (--ft-shift), so the loop is seamless; every copy after
  // the first is hidden from assistive tech and the tab order.
  const renderTickerGroup = (index) => {
    const copy = index > 0
    return (
      <div
        className="ft-group"
        aria-hidden={copy ? 'true' : undefined}
        key={copy ? `copy-${index}` : 'main'}
        ref={copy ? undefined : tickerGroupRef}
      >
        {tickerVotes.map((v) => {
          const subject = voteSubject(v, 72)
          const roll = [v.chamber, v.number != null ? `Roll ${v.number}` : null].filter(Boolean).join(' · ')
          return (
            <Link
              className="ft-item"
              to={v.voteHref}
              key={v.key}
              tabIndex={copy ? -1 : undefined}
              aria-label={tickerItemLabel(v, subject)}
            >
              {roll && <span className="ft-roll">{roll}</span>}
              {v.bill?.display && <span className="ft-bill">{v.bill.display}</span>}
              <span className="ft-subject">{subject}</span>
              {v.tally && <span className="ft-tally">{v.tally}</span>}
              {v.result && <span className={`fr-result ${v.resultKind}`}>{v.result}</span>}
            </Link>
          )
        })}
      </div>
    )
  }
  // Keyboard focus on a ticker link stops the strip and lets the browser
  // scroll the focused link into view; leaving resets the scroll.
  // Only KEYBOARD focus counts: a mouse press also focuses the link, and
  // snapping the track back to offset 0 between mousedown and mouseup would
  // move a different link under the pointer and swallow the click.
  // A pointer press sets a flag for the rest of this task; the focus event it
  // raises is then ignored, so only Tab (or script) focus counts.
  const tickerPointerRef = useRef(false)
  const onTickerPointerDown = () => {
    tickerPointerRef.current = true
    setTimeout(() => { tickerPointerRef.current = false }, 0)
  }
  const onTickerFocus = (e) => {
    if (!e.target.closest?.('a.ft-item')) return
    if (tickerPointerRef.current) return
    setTickerFocused(true)
  }
  const onTickerBlur = (e) => {
    const next = e.relatedTarget
    const stillOnLink = next && e.currentTarget.contains(next) && next.closest?.('a.ft-item')
    if (stillOnLink) return
    if (tickerViewportRef.current) tickerViewportRef.current.scrollLeft = 0
    setTickerFocused(false)
  }
  const recordedLabel = recordedThrough
    ? new Date(recordedThrough).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    : null

  // Feature five: the opening of a real Tell your rep draft, built from the
  // same latest recorded vote the hero shows.
  const writeVisual = (
    <div className="mock mock-write" aria-hidden="true">
      <span className="mk-label">Your message starts with the facts</span>
      {headlineVote ? (
        <p className="mk-letter">
          On {recordedLabel || 'the latest vote'}, the {headlineVote.chamber || 'chamber'} voted on{' '}
          {headlineVote.bill ? `${headlineVote.bill.display}: ` : ''}{truncate(headlineVote.text, 70)}
          {headlineVote.tally ? ` The result was ${headlineVote.tally}.` : ''}
          <br />
          <span className="mk-yours">[Write your message here, in your own words.]</span>
        </p>
      ) : floorReady ? (
        <p className="mk-unavailable">{NO_VOTE}</p>
      ) : (
        <p className="mk-letter">
          <span className="mk-skel" style={{ width: '90%', maxWidth: 'none' }} />
          <span className="mk-skel" style={{ width: '70%', maxWidth: 'none', marginTop: 8 }} />
        </p>
      )}
      <span className="mk-src">You send it through their official contact page</span>
    </div>
  )

  // Feature four: the real one-screen record card for a featured member,
  // laid out like their profile (photo, seat, totals, latest votes).
  const rs = featuredRecord?.stats
  const recordPhoto = featuredRecord ? (featuredMembers[0]?.imageUrl || featuredRecord.photo_url || featuredMembers[0]?.photoFallbackUrl) : null
  const recordVisual = (
    <div className="mock mock-record" aria-hidden="true">
      {featuredRecord ? (
        <>
          <div className="mk-rec-head">
            {recordPhoto ? (
              <img
                className="mk-rec-photo"
                src={recordPhoto}
                alt=""
                loading="lazy"
                onError={(e) => {
                  const el = e.currentTarget
                  const fb = featuredMembers[0]?.photoFallbackUrl
                  if (fb && el.dataset.fb !== '1') { el.dataset.fb = '1'; el.src = fb }
                  else el.style.visibility = 'hidden'
                }}
              />
            ) : <span className="mk-rec-photo" />}
            <span className="mk-rec-id">
              <b>{featuredRecord.name}</b>
              <small>{featuredRecord.chamber === 'senate' ? 'U.S. Senate' : 'U.S. House'} · {featuredRecord.state}</small>
            </span>
          </div>
          {rs && (
            <div className="mk-rec-stats">
              <span><b>{rs.total}</b><small>Roll calls</small></span>
              <span><b>{rs.cast}</b><small>Votes cast</small></span>
              <span><b>{rs.notVoting}</b><small>Not voting</small></span>
            </div>
          )}
          {(featuredRecord.recentVotes || []).slice(0, 3).map((v) => (
            <div className="mk-rec-vote" key={v.roll_call_id}>
              <span className="mk-desc">{truncate(v.bill?.label ? `${v.bill.label} · ${v.question || ''}` : v.question, 44)}</span>
              {v.position && <span className={`mk-pos ${String(v.position).toLowerCase().replace(/\s+/g, '-')}`}>{v.position}</span>}
            </div>
          ))}
        </>
      ) : recordFailed ? (
        <p className="mk-unavailable">{NO_RECORD}</p>
      ) : (
        <>
          <div className="mk-rec-head"><span className="mk-rec-photo" /><b className="mk-skel" style={{ width: 140, maxWidth: 'none', height: 14 }} /></div>
          <span className="mk-skel" style={{ width: '80%', maxWidth: 'none', marginTop: 14 }} />
          <span className="mk-skel" style={{ width: '64%', maxWidth: 'none', marginTop: 8 }} />
        </>
      )}
    </div>
  )

  // Feature six: a two-turn MCP transcript. The question names the real
  // featured member; the answer lines are that member's real latest votes.
  const mcpVotes = (featuredRecord?.recentVotes || []).slice(0, 3)
  const mcpSource = mcpVotes[0]?.roll != null
    ? `${mcpVotes[0].chamber || 'Roll call'} roll call ${mcpVotes[0].roll}`
    : null
  const mcpVisual = (
    <div className="mock mock-chat" aria-hidden="true">
      <div className="mk-turn mk-turn-user">
        <span className="mk-who">You</span>
        {featuredRecord
          ? <p>How did {featuredRecord.name} vote recently?</p>
          : recordFailed
            ? <p>How did my representative vote recently?</p>
            : <p><span className="mk-skel" style={{ width: '70%', maxWidth: 'none' }} /></p>}
      </div>
      <div className="mk-turn mk-turn-ai">
        <span className="mk-who">Assistant</span>
        {featuredRecord ? (
          mcpVotes.length ? (
            <ul className="mk-answer">
              {mcpVotes.map((v) => (
                <li key={v.roll_call_id}>
                  {v.position && <span className={`mk-pos ${String(v.position).toLowerCase().replace(/\s+/g, '-')}`}>{v.position}</span>}
                  <span className="mk-desc">{truncate([v.bill?.label, v.question].filter(Boolean).join(' · ') || 'Recorded vote', 48)}</span>
                </li>
              ))}
            </ul>
          ) : <p>No recorded votes yet.</p>
        ) : recordFailed ? (
          <p className="mk-unavailable">{NO_RECORD}</p>
        ) : (
          <div className="mk-answer">
            <span className="mk-skel" style={{ width: '88%', maxWidth: 'none' }} />
            <span className="mk-skel" style={{ width: '76%', maxWidth: 'none', marginTop: 10 }} />
            <span className="mk-skel" style={{ width: '64%', maxWidth: 'none', marginTop: 10 }} />
          </div>
        )}
      </div>
      {mcpSource && <span className="mk-src">Source · {BRAND.name} MCP · {mcpSource}</span>}
    </div>
  )

  // Feature seven: the public API's response for the same latest recorded vote
  // the hero shows, in the endpoint's own field names (GET /api/v1/votes/{id}),
  // trimmed. Only values the page actually has are printed.
  const apiJson = headlineVote ? (() => {
    const data = { roll_call_id: headlineVote.key }
    if (headlineVote.votedAt) data.voted_at = String(headlineVote.votedAt).slice(0, 10)
    const src = voteSourceUrl(headlineVote.key, null)
    if (src) data.source_url = src
    if (headlineVote.yea != null && headlineVote.nay != null) data.summary = { yea: headlineVote.yea, nay: headlineVote.nay }
    // The real response carries more (the bill, every member's position); the
    // ellipsis says so rather than pretending this is the whole body.
    const inner = JSON.stringify(data, null, 2).replace(/\n\}$/, ',\n  \u2026\n}').replace(/\n/g, '\n  ')
    return `{\n  "data": ${inner}\n}`
  })() : null
  const agentsVisual = (
    <div className="mock mock-code" aria-hidden="true">
      {headlineVote ? (
        <>
          <code className="mk-req">GET /api/v1/votes/{headlineVote.key}</code>
          <pre className="mk-json">{apiJson}</pre>
        </>
      ) : votesReady ? (
        <p className="mk-unavailable">{NO_VOTE}</p>
      ) : (
        <>
          <span className="mk-skel" style={{ width: '62%', maxWidth: 'none' }} />
          <span className="mk-skel" style={{ width: '80%', maxWidth: 'none', marginTop: 14 }} />
          <span className="mk-skel" style={{ width: '70%', maxWidth: 'none', marginTop: 8 }} />
          <span className="mk-skel" style={{ width: '54%', maxWidth: 'none', marginTop: 8 }} />
        </>
      )}
      <span className="mk-src">No key needed to read · JSON · OpenAPI</span>
    </div>
  )

  // Feature eight: one row of an office inbox, built from the same latest
  // recorded vote. Nothing in it speaks in the Member's name.
  // Same fields and the same pick as the /offices inbox (inboxFields).
  const inbox = inboxFields(headlineRaw)
  const officesVisual = (
    <div className="mock mock-inbox" aria-hidden="true">
      <span className="mk-label">Office inbox</span>
      {votesReady && !headlineVote ? (
        <p className="mk-unavailable">{NO_VOTE}</p>
      ) : (
        <dl className="mk-fields">
          <div><dt>From</dt><dd>A constituent in your district</dd></div>
          <div><dt>Re</dt><dd>{headlineVote ? (inbox.re || truncate(headlineVote.text, 40)) : <span className="mk-skel" />}</dd></div>
          <div><dt>Vote</dt><dd className="mk-mono">{headlineVote ? (inbox.vote || 'Recorded vote') : <span className="mk-skel" />}</dd></div>
          <div><dt>Status</dt><dd><span className="mk-status">Received</span></dd></div>
        </dl>
      )}
    </div>
  )

  const recordHref = featuredRecord ? `/politician/${featuredRecord.id}/record` : '/all'
  const writeHref = headlineVote ? `${headlineVote.voteHref}#tell-your-rep` : '/this-week'

  // Headlines and copy come from src/data/homeSeo.js, the same text the
  // server-rendered homepage gives crawlers and AI answer engines.
  const VISUALS = {
    find: repsVisual, votes: votesVisual, bills: billVisual, record: recordVisual, write: writeVisual,
    mcp: mcpVisual, agents: agentsVisual, offices: officesVisual,
  }
  const LINK_OVERRIDES = {
    record: { to: recordHref, label: 'See a record' },
    write: { to: writeHref, label: 'Write about the latest vote' },
  }
  const FEATURES = HOME_FEATURES.map((f) => ({
    ...f,
    link: LINK_OVERRIDES[f.id] || { to: f.href, label: f.label },
    visual: VISUALS[f.id],
  }))

  return (
    <div className="bw landing">
      <SEO fullTitle={HOME_TITLE} description={HOME_DESCRIPTION} path="/" schema={homeJsonLdGraph({ dateModified: null })} />

      {/* ===== HERO: centered question, mission, lookup, and the latest real vote ===== */}
      <section className="hero">
        <div className="hero-inner">
          <h1 className="hero-title">How did your representative vote this week?</h1>
          <p className="hero-mission">{BRAND.mission}</p>

          {renderLookup('hero')}
        </div>

        {/* The latest recorded votes as a news ticker that rolls left (the only
            continuously scrolling content on the site, loading indicators
            aside; DESIGN.md, 2026-10-06). */}
        <div
          className={`floor-ticker${tickerPaused ? ' is-paused' : ''}${tickerFocused ? ' is-focused' : ''}`}
          role="region"
          aria-label="Latest recorded votes"
          onPointerDownCapture={onTickerPointerDown}
          onMouseDownCapture={onTickerPointerDown}
          onFocus={onTickerFocus}
          onBlur={onTickerBlur}
        >
          <div className="ft-label">
            <span className="ft-label-long">Latest recorded votes</span>
            <span className="ft-label-short">Latest votes</span>
            {tickerRolling && (
              <button
                type="button"
                className="ft-pause"
                onClick={() => setTickerPaused((p) => !p)}
              >
                {tickerPaused ? 'Play' : 'Pause'}
              </button>
            )}
          </div>
          {!votesReady ? (
            <div className="ft-viewport">
              <div className="ft-track ft-static" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span className="ft-item ft-skel" key={i}>
                    <span className="mk-skel" style={{ width: 92, maxWidth: 'none', height: 10 }} />
                    <span className="mk-skel" style={{ width: 260, maxWidth: 'none', height: 12 }} />
                    <span className="mk-skel" style={{ width: 44, maxWidth: 'none', height: 10 }} />
                  </span>
                ))}
              </div>
            </div>
          ) : tickerVotes.length ? (
            <div className="ft-viewport" ref={tickerViewportRef}>
              <div
                className={`ft-track${reducedMotion ? ' ft-static' : ''}`}
                style={reducedMotion ? undefined : {
                  animationDuration: `${tickerSeconds}s`,
                  '--ft-shift': `${-(100 / tickerCopiesShown)}%`,
                }}
              >
                {Array.from({ length: tickerCopiesShown }, (_, i) => renderTickerGroup(i))}
              </div>
            </div>
          ) : (
            <p className="mk-unavailable ft-empty">{NO_VOTE}</p>
          )}
        </div>
      </section>

      {/* ===== FEATURES: one idea per section, a simple real-data image each ===== */}
      <section className="features">
        {FEATURES.map((f) => (
          <article className={`feature feature-${f.id}`} key={f.id}>
            <div className="feature-text">
              <h2>{f.title}</h2>
              <p>{f.body}</p>
              <Link className="btn-text btn-go feature-link" to={f.link.to}>{f.link.label}</Link>
            </div>
            <div className="feature-visual">{f.visual}</div>
          </article>
        ))}
      </section>

      {/* ===== FAQ ===== */}
      <section className="faq" aria-labelledby="faq-title">
        <div className="faq-inner">
          <header className="faq-head">
            <h2 id="faq-title">Questions, answered.</h2>
            <p>Everything people ask before they look up their first vote.</p>
            <Link className="btn-text btn-go" to="/how-it-works">How {BRAND.name} works</Link>
          </header>
          <div className="faq-list">
            {FAQ.map((item) => (
              <details key={item.q} className="faq-item">
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FINALE ===== */}
      <section className="finale">
        <div className="finale-inner">
          <h2>Find out who’s speaking for you.</h2>
          {renderLookup('finale')}
        </div>
      </section>
    </div>
  )
}

export default Landing
