import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getDistrictFromAddress, US_STATES } from '../services/district'
import { getRecentBills, getFeaturedMembers, getTrendingBills } from '../services/congress'
import { getRecentFloorVotes, rollCallHref } from '../services/floorVotes'
import { getMemberRecord } from '../services/memberRecord'
import { saveUserAddress } from '../services/userService'
import { findMembersForDistrict } from '../services/myMembers'
import { displayName } from '../utils/tellYourRepDraft'
import RecordLink from './RecordLink'
import SEO from './SEO'
import { BRAND } from '../config/brand'
import { LANDING_FAQ as FAQ } from '../data/landingFaq'
import { isAtLargeState } from '../../shared/atLargeStates.js'
import '../styles/Landing.css'

const ArrowRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
)

const BILL_TYPE_LABELS = {
  HR: 'H.R.', S: 'S.', HRES: 'H.Res.', SRES: 'S.Res.',
  HJRES: 'H.J.Res.', SJRES: 'S.J.Res.', HCONRES: 'H.Con.Res.', SCONRES: 'S.Con.Res.',
}


// Where AI is used and where it never is. This is the substance behind the
// mission line, so it's stated as plain lists rather than a pitch.
const AI_USES = [
  'Explain bills from the official summary, with the source beside it',
  'Narrate a member’s voting patterns from numbers we computed first',
  'Answer your AI assistant with cited records through our MCP server',
]
// Where the product is headed. Stated as intent, not as shipped features.
const AI_NEXT = [
  'Offices answer common questions from their own published words, cited every time',
  'Your AI assistant pulls the record and starts your message; you approve every word',
  'You see how your representative voted on what you wrote about',
]
const AI_NEVER = [
  'Write in your representative’s voice or guess their positions',
  'Send anything you haven’t read and approved',
  'Choose a side for you, or rank and score constituents',
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
  const [zip, setZip] = useState('')
  const [lookup, setLookup] = useState(null)
  // Which of the two lookup forms was submitted, so the result renders next to
  // the field the reader actually used instead of somewhere off-screen.
  const [lookupPlace, setLookupPlace] = useState('hero')
  // Guards the member fetch against a newer lookup finishing first.
  const lookupSeq = useRef(0)
  const [floor, setFloor] = useState([])
  const [floorReady, setFloorReady] = useState(false)
  const [recordedThrough, setRecordedThrough] = useState(null)
  const [featuredMembers, setFeaturedMembers] = useState([])
  const [featuredBill, setFeaturedBill] = useState(null)
  const [featuredRecord, setFeaturedRecord] = useState(null)

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

  // The "record in 60 seconds" illustration: the real card for the first
  // featured member. Best-effort; the mock shows a skeleton until it resolves.
  const recordMemberId = featuredMembers[0]?.bioguideId
  useEffect(() => {
    if (!recordMemberId) return undefined
    let cancelled = false
    getMemberRecord(recordMemberId)
      .then((r) => { if (!cancelled) setFeaturedRecord(r) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [recordMemberId])

  // A real current bill (with a plain-English blurb from its CRS summary) for
  // the "Understand any bill" step and the "what are they voting on" closer.
  useEffect(() => {
    let cancelled = false
    getTrendingBills()
      .then((bills) => { if (!cancelled && bills?.length) setFeaturedBill(bills[0]) })
      .catch(() => {})
    return () => { cancelled = true }
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


  const handleLookup = async (e, place) => {
    e.preventDefault()
    setLookupPlace(place)
    const seq = ++lookupSeq.current
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
      <p className="lookup-hint">Free · No account · Source-linked records</p>

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
        <span className="mk-annot-tag">From the official summary</span>
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
      ) : (
        <>
          <div className="mk-rec-head"><span className="mk-rec-photo" /><b className="mk-skel" style={{ width: 140, maxWidth: 'none', height: 14 }} /></div>
          <span className="mk-skel" style={{ width: '80%', maxWidth: 'none', marginTop: 14 }} />
          <span className="mk-skel" style={{ width: '64%', maxWidth: 'none', marginTop: 8 }} />
        </>
      )}
    </div>
  )

  // Feature six: Bill Watch on a real current bill. The stages are what the
  // alert covers, not invented events.
  const alertsVisual = (
    <div className="mock mock-alerts" aria-hidden="true">
      <div className="mk-billhead">
        <span className="mk-billnum">{featuredBill ? billLabel(featuredBill) : 'H.R. —'}</span>
        <span className="mk-watch">Watching</span>
      </div>
      <p className="mk-alert-title">{featuredBill ? truncate(featuredBill.headline || featuredBill.title, 80) : 'Loading a current bill…'}</p>
      <ul className="mk-stages">
        <li>Reaches committee</li>
        <li>Scheduled for the floor</li>
        <li>Recorded vote</li>
      </ul>
    </div>
  )

  const recordHref = featuredRecord ? `/politician/${featuredRecord.id}/record` : '/all'
  const writeHref = headlineVote ? `${headlineVote.voteHref}#tell-your-rep` : '/bills'

  const FEATURES = [
    { id: 'find', title: 'Know who speaks for you.', body: 'One ZIP code finds your House member and both senators, from U.S. Census district data.', link: { to: '/my-representative', label: 'Find my reps' }, visual: repsVisual },
    { id: 'votes', title: 'See exactly how they voted.', body: 'Every roll call, this week’s and every one before it, with each member’s yea or nay linked to the official record.', link: { to: '/this-week', label: 'This week on the floor' }, visual: votesVisual },
    { id: 'bills', title: 'Bills in plain English.', body: 'What a bill would actually change and who it affects, written from the official summary, with the full text one click away.', link: { to: '/bills', label: 'Browse bills' }, visual: billVisual },
    { id: 'record', title: 'Any record in 60 seconds.', body: 'The same one-screen card for every member: votes cast, votes missed, and the latest votes. No scores, no spin.', link: { to: recordHref, label: 'See a record' }, visual: recordVisual },
    { id: 'write', title: 'Then write to the person who cast it.', body: 'Your message starts with the facts of the vote. You add your words and send it yourself.', link: { to: writeHref, label: 'Write about the latest vote' }, visual: writeVisual },
    { id: 'alerts', title: 'Know before the vote.', body: 'Follow a bill and hear when it reaches committee, the floor, or a recorded vote.', link: { to: '/alerts', label: 'Follow a bill' }, visual: alertsVisual },
  ]

  return (
    <div className="bw landing">
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

      {/* ===== HERO: centered question, mission, lookup, and the latest real vote ===== */}
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
                  <Link className="btn-text btn-go" to={headlineVote.voteHref}>How each member voted</Link>
                  <Link className="btn-text btn-go" to={`${headlineVote.voteHref}#tell-your-rep`}>Write to your rep about this vote</Link>
                </div>
              </div>
            )}
          </div>
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

      {/* ===== THE CONCEPT: how AI is used now, where it's headed, what it never does ===== */}
      <section className="ai" aria-labelledby="ai-title">
        <div className="ai-inner">
          <header className="ai-head">
            <span className="ai-kicker">Our concept · what we’re building toward</span>
            <h2 id="ai-title">AI that makes Congress easier to read and easier to reach. <em>A person writes every message. A person answers it.</em></h2>
          </header>
          <div className="ai-cols">
            <div className="ai-col">
              <h3>Now</h3>
              <ul>{AI_USES.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            <div className="ai-col ai-col-next">
              <h3>Next</h3>
              <ul>{AI_NEXT.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            <div className="ai-col ai-col-never">
              <h3>Never</h3>
              <ul>{AI_NEVER.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          </div>
          <Link className="btn-text btn-go ai-link" to="/how-it-works">How it works</Link>
        </div>
      </section>

      {/* ===== FOR OFFICES ===== */}
      <section className="offices-band" aria-labelledby="offices-title">
        <div className="offices-inner">
          <div className="offices-text">
            <span className="offices-kicker">If you work in a congressional office</span>
            <h2 id="offices-title">A better way for constituents to reach your office, and for your office to answer.</h2>
            <p className="offices-lede">
              Cited answers from sources your office approves. Messages written and approved by the person who sent
              them, tagged to the vote they’re about. Nothing is ever said in the Member’s name.
            </p>
          </div>
          <Link className="btn-primary offices-cta" to="/offices">See how it would work</Link>
        </div>
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
          <span className="finale-kicker">Start with your ZIP</span>
          <h2>Find out who’s speaking for you.</h2>
          {renderLookup('finale')}
        </div>
      </section>
    </div>
  )
}

export default Landing
