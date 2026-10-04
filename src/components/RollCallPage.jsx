import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getRollCall, fromPrerender } from '../services/rollCall'
import SEO from './SEO'
import TellYourRep from './TellYourRep'
import { voteRef } from '../utils/tellYourRepDraft'
import '../styles/RollCall.css'

const ORD = (n) => { const v = n % 100; const s = ['th', 'st', 'nd', 'rd']; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}` }
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''
const partyShort = (p) => { const s = String(p || ''); return /^dem/i.test(s) ? 'D' : /^rep/i.test(s) ? 'R' : /^ind/i.test(s) ? 'I' : s.slice(0, 1) }
// Same rule as api/_lib/rollCallResult.js resultKind.
const resultKind = (r) => !r ? '' : /^passed|invoked|confirmed|agreed|overridden|^ratified$/i.test(r) ? 'passed' : 'failed'

const expectedIdFor = ({ congress, chamber, session, roll }) => `${String(chamber || '').toLowerCase()}-${Number(congress)}-${Number(session)}-${Number(roll)}`

// The server-rendered page embeds its data; when it matches this route, the
// first render needs no fetch and no spinner.
function readEmbedded(expectedId) {
  try {
    const el = typeof document !== 'undefined' ? document.getElementById('__bw_page') : null
    if (!el) return null
    const data = fromPrerender(JSON.parse(el.textContent || 'null'))
    return data && data.id === expectedId ? data : null
  } catch {
    return null
  }
}

function RollCallPage() {
  const params = useParams()
  const { congress, chamber, session, roll } = params
  const expectedId = expectedIdFor(params)
  const [rc, setRc] = useState(() => readEmbedded(expectedId) ?? undefined)
  const [filter, setFilter] = useState('')
  const [position, setPosition] = useState('all')

  useEffect(() => {
    if (rc && rc.id === expectedId) return undefined
    let cancelled = false
    setRc(undefined)
    getRollCall({ congress, chamber, session, roll })
      .then((data) => { if (!cancelled) setRc(data) })
      .catch(() => { if (!cancelled) setRc(null) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expectedId])

  const visible = useMemo(() => {
    if (!rc) return []
    const q = filter.trim().toLowerCase()
    return rc.votes.filter((v) =>
      (position === 'all' || v.position === position) &&
      (!q || String(v.member.name || '').toLowerCase().includes(q) || String(v.member.state || '').toLowerCase() === q))
  }, [rc, filter, position])

  if (rc === undefined) {
    return <div className="rc rc-loading"><div className="loading-spinner" /><p>Loading the roll call…</p></div>
  }
  if (rc === null) {
    return (
      <div className="rc rc-error">
        <SEO title="Roll call not found" path={`/vote/${congress}/${chamber}/${session}/${roll}`} />
        <h1>Roll call not found</h1>
        <p>We don't hold a {chamber} roll call {roll} for session {session} of the {congress}th Congress. <Link to="/bills">Browse bills</Link>.</p>
      </div>
    )
  }

  const path = `/vote/${rc.congress}/${rc.chamberKey}/${rc.session}/${rc.number}`
  const subject = rc.bill ? `${rc.bill.label}${rc.bill.title ? `: ${rc.bill.title}` : ''}` : (rc.description || '')
  const title = `${rc.chamber} Roll Call ${rc.number} (${ORD(rc.congress)} Congress)${rc.question ? `: ${rc.question}` : ''}`
  const description = `${rc.chamber} vote ${rc.number}, session ${rc.session} of the ${ORD(rc.congress)} Congress${rc.votedAt ? `, ${fmtDate(rc.votedAt)}` : ''}. ${rc.question || 'Recorded vote'}${subject ? ` on ${subject}` : ''}. ${rc.tally ? `${rc.tally.yea} yea, ${rc.tally.nay} nay${rc.result ? `, ${rc.result.toLowerCase()}` : ''}.` : ''}`
  const total = rc.tally ? rc.tally.yea + rc.tally.nay : 0
  const yeaPct = total ? (rc.tally.yea / total) * 100 : 0
  const tellContext = {
    kind: 'vote',
    ref: voteRef({ congress: rc.congress, chamber: rc.chamberKey, session: rc.session, roll: rc.number }),
    billId: rc.bill?.id || undefined,
    label: `${rc.chamber} roll call ${rc.number} (${ORD(rc.congress)} Congress, session ${rc.session})`,
    title: `${rc.question || 'Recorded vote'}${subject ? ` on ${subject}` : ''}`,
    sourceUrl: rc.sourceUrl || rc.bill?.source_url || undefined,
    href: path,
    chamber: rc.chamberKey,
    date: rc.votedAt || undefined,
    result: rc.result || undefined,
    memberVotes: Object.fromEntries(rc.votes.map((v) => [v.member.id, v.position])),
  }

  return (
    <article className="rc">
      <SEO title={title.slice(0, 110)} description={description.slice(0, 200)} path={path} type="article" />
      <nav className="rc-crumb">
        <Link to="/">BallotWatch</Link><span className="rc-crumb-sep">/</span>
        <Link to="/bills">Bills</Link><span className="rc-crumb-sep">/</span>
        <span>{rc.chamber} roll call {rc.number}</span>
      </nav>

      <header className="rc-masthead">
        <div className="rc-kicker">{rc.chamber} · Roll call {rc.number} · Session {rc.session} · {ORD(rc.congress)} Congress{rc.votedAt ? ` · ${fmtDate(rc.votedAt)}` : ''}</div>
        <h1 className="rc-title">
          {rc.question || 'Recorded vote'}
          {rc.bill && <> on <Link to={rc.bill.href}>{rc.bill.label}</Link></>}
        </h1>
        {rc.bill?.title
          ? <p className="rc-standfirst">{rc.bill.title}</p>
          : rc.description ? <p className="rc-standfirst">{rc.description}</p> : null}

        {rc.tally ? (
          <div className="rc-tally">
            <div className="rc-tally-head">
              <span className="rc-tally-numbers">
                <span className="rc-yea">{rc.tally.yea} Yea</span> · <span className="rc-nay">{rc.tally.nay} Nay</span>
                {rc.tally.present ? <> · {rc.tally.present} Present</> : null}
                {rc.tally.notVoting ? <> · {rc.tally.notVoting} Not voting</> : null}
              </span>
              {rc.result && <span className={`rc-result rc-result-${resultKind(rc.result)}`}>{rc.result}</span>}
            </div>
            <div className="rc-tally-bar" aria-hidden="true">
              <span className="rc-tally-yea" style={{ width: `${yeaPct.toFixed(1)}%` }} />
              <span className="rc-tally-nay" style={{ width: `${(100 - yeaPct).toFixed(1)}%` }} />
            </div>
            {rc.party && (
              <div className="rc-party">
                D {rc.party.dem.yea}–{rc.party.dem.nay} · R {rc.party.rep.yea}–{rc.party.rep.nay}
                {rc.party.ind.yea + rc.party.ind.nay ? <> · I {rc.party.ind.yea}–{rc.party.ind.nay}</> : null}
              </div>
            )}
          </div>
        ) : (
          <p className="rc-standfirst rc-muted">Tally not yet recorded.</p>
        )}

        <div className="rc-actions">
          {rc.sourceUrl && <a className="rc-action-btn btn-secondary btn-sm" href={rc.sourceUrl} target="_blank" rel="noopener noreferrer">Official record ↗</a>}
          {rc.bill?.source_url && <a className="rc-action-btn btn-secondary btn-sm" href={rc.bill.source_url} target="_blank" rel="noopener noreferrer">Bill on Congress.gov ↗</a>}
        </div>
      </header>

      <TellYourRep context={tellContext} />

      <section className="rc-section">
        <div className="rc-section-label">Every member · {rc.votes.length} recorded</div>
        <h2 className="rc-section-title">How <em>each member</em> voted</h2>
        {rc.votes.length ? (
          <>
            <div className="rc-filter">
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by name or state"
                aria-label="Filter members by name or state"
              />
              <div className="rc-filter-positions" role="group" aria-label="Filter by vote">
                {['all', 'Yea', 'Nay', 'Present', 'Not Voting'].map((p) => (
                  <button key={p} type="button" className={position === p ? 'btn-toggle is-active' : 'btn-toggle'} onClick={() => setPosition(p)}>{p === 'all' ? 'All' : p}</button>
                ))}
              </div>
            </div>
            <div className="rc-table-wrap">
              <table className="rc-table">
                <thead><tr><th>Member</th><th>Seat</th><th>Vote</th></tr></thead>
                <tbody>
                  {visible.map((v) => (
                    <tr key={v.member.id}>
                      <td><Link to={`/politician/${v.member.id}`}>{v.member.name}</Link></td>
                      <td className="rc-mono">{partyShort(v.member.party)}-{v.member.state || ''}{v.member.district ? `-${v.member.district}` : ''}</td>
                      <td className={`rc-position rc-position-${v.position.toLowerCase().replace(/\s+/g, '-')}`}>{v.position}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visible.length && <p className="rc-muted">No members match that filter.</p>}
            </div>
          </>
        ) : (
          <p className="rc-muted">Member-level votes for this roll call have not been ingested yet.</p>
        )}
      </section>

      <footer className="rc-colophon">
        Data from Congress.gov, the House Clerk, and the Senate. The result is derived from the tally and the question.{' '}
        <Link to="/methodology">Methodology</Link> · <a href="/llms.txt">For agents</a>
      </footer>
    </article>
  )
}

export default RollCallPage
