import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getMemberRecord, recordFromPrerender } from '../services/memberRecord'
import {
  RECORD_VOTE_LIMIT,
  ordinalCongress,
  partyLetter,
  recordDate,
  recordHeadline,
  recordOgImagePath,
  recordPath,
  recordSeatCode,
  recordSeatTitle,
  recordSummary,
} from '../../shared/memberRecord.js'
import { congressImageUrl, handleMemberPhotoError } from '../utils/memberImage'
import { copyTextToClipboard } from '../utils/clipboard'
import { toStateName } from '../utils/states'
import SEO from './SEO'
import '../styles/RollCall.css'
import '../styles/MemberRecord.css'

const SITE = 'https://www.ballotwatch.io'

const longDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''
const positionClass = (p) => `rc-position rc-position-${String(p || '').toLowerCase().replace(/\s+/g, '-')}`

// The server-rendered page embeds the record; when it is this member's, the
// first render needs no fetch.
function readEmbedded(bioguideId) {
  try {
    const el = typeof document !== 'undefined' ? document.getElementById('__bw_page') : null
    if (!el) return null
    return recordFromPrerender(JSON.parse(el.textContent || 'null'), bioguideId)
  } catch {
    return null
  }
}

function RecordSkeleton() {
  return (
    <article className="rec" aria-busy="true" aria-label="Loading the record">
      <div className="rec-head">
        <div className="rec-photo rec-skel" />
        <div className="rec-id">
          <div className="rec-skel rec-skel-line" style={{ width: '40%' }} />
          <div className="rec-skel rec-skel-title" />
          <div className="rec-skel rec-skel-line" style={{ width: '60%' }} />
        </div>
      </div>
      <div className="rec-skel rec-skel-block" />
      {Array.from({ length: 6 }, (_, i) => <div key={i} className="rec-skel rec-skel-row" />)}
    </article>
  )
}

export default function MemberRecord() {
  const { bioguideId } = useParams()
  const id = String(bioguideId || '').toUpperCase()
  const [record, setRecord] = useState(() => readEmbedded(id) ?? undefined)
  const [failed, setFailed] = useState(false)
  const [photoFailed, setPhotoFailed] = useState(false)
  const [copied, setCopied] = useState(null)

  useEffect(() => {
    if (record && record.id === id) return undefined
    let cancelled = false
    setRecord(undefined)
    setFailed(false)
    getMemberRecord(id)
      .then((data) => { if (!cancelled) setRecord(data) })
      .catch((err) => {
        console.error('[MemberRecord] load failed:', err)
        if (!cancelled) { setFailed(true); setRecord(null) }
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (record === undefined) return <RecordSkeleton />

  if (record === null) {
    return (
      <div className="rc rc-error">
        <SEO title="Member not found" path={recordPath(id)} />
        <h1>{failed ? 'The record could not be loaded' : 'Member not found'}</h1>
        <p>
          {failed
            ? 'Please try again in a moment.'
            : <>We don't hold a member with the id {id}. <Link to="/all">Browse members</Link>.</>}
        </p>
      </div>
    )
  }

  const r = record
  const s = r.stats
  const url = `${SITE}${recordPath(r.id)}`
  const party = partyLetter(r.party)
  const title = `${recordHeadline(r)} (${recordSeatCode(r)})`
  const description = recordSummary(r, toStateName).slice(0, 200)

  const copy = async () => {
    const ok = await copyTextToClipboard(url)
    setCopied(ok ? 'Link copied' : 'Copy failed; the link is in the address bar')
    setTimeout(() => setCopied(null), 2500)
  }

  return (
    <article className="rec">
      <SEO title={title} description={description} path={recordPath(r.id)} type="profile" image={`${SITE}${recordOgImagePath(r.id)}`} />

      <nav className="rc-crumb">
        <Link to="/">BallotWatch</Link><span className="rc-crumb-sep">/</span>
        <Link to={`/politician/${r.id}`}>{r.name}</Link><span className="rc-crumb-sep">/</span>
        <span>Record in 60 seconds</span>
      </nav>

      <header className="rec-head">
        {!photoFailed ? (
          <img
            className="rec-photo"
            src={congressImageUrl(r.id)}
            alt={r.name}
            width="96"
            height="117"
            onError={(e) => handleMemberPhotoError(e, r.id, () => setPhotoFailed(true))}
          />
        ) : (
          <div className="rec-photo rec-photo-empty" aria-hidden="true">{r.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</div>
        )}
        <div className="rec-id">
          <div className="rec-kicker">Record in 60 seconds{r.congress ? ` · ${ordinalCongress(r.congress)} Congress` : ''}</div>
          <h1 className="rec-name">{r.name}</h1>
          <div className="rec-seat">
            <span className={`rec-party rec-party-${party.toLowerCase()}`}>{party}</span>
            {recordSeatTitle(r)} · {toStateName(r.state)}{r.district ? ` district ${r.district}` : ''} · {r.chamber === 'senate' ? 'Senate' : 'House'}
          </div>
          {r.servingSince && r.congress && (
            <div className="rec-since">Serving in the {ordinalCongress(r.congress)} Congress since <span className="rc-mono">{longDate(r.servingSince)}</span></div>
          )}
        </div>
      </header>

      {s ? (
        <dl className="rec-facts">
          <div><dt>Roll calls, {ordinalCongress(s.congress)} Congress</dt><dd>{s.total}</dd></div>
          <div><dt>Votes cast</dt><dd>{s.cast}</dd></div>
          <div><dt>Not voting</dt><dd>{s.notVoting} <span className="rec-facts-sub">({s.notVotingPct}%)</span></dd></div>
        </dl>
      ) : (
        <p className="rec-note">Vote totals for the current Congress are not available yet.</p>
      )}

      <section className="rec-section">
        <div className="rc-section-label">
          {r.voteCount ? `${r.recentVotes.length} most recent recorded vote${r.recentVotes.length === 1 ? '' : 's'}` : 'Recorded votes'}
        </div>
        {r.voteCount === 0 ? (
          <p className="rec-note">No recorded votes for {r.name} in BallotWatch data yet. A member who took office recently may not have voted on a roll call yet.</p>
        ) : (
          <>
            {r.thin && <p className="rec-note">{r.name} has {r.voteCount} recorded vote{r.voteCount === 1 ? '' : 's'} so far. All are shown.</p>}
            <div className="rc-table-wrap">
              <table className="rc-table rec-table">
                <thead><tr><th>Date</th><th>Question</th><th>Vote</th><th>Result</th><th>Source</th></tr></thead>
                <tbody>
                  {r.recentVotes.map((v) => (
                    <tr key={v.roll_call_id}>
                      <td className="rc-mono">{recordDate(v.voted_at)}</td>
                      <td>
                        {v.path ? <Link to={v.path}>{v.question || 'Recorded vote'}</Link> : (v.question || 'Recorded vote')}
                        {v.bill && <> <Link className="rec-bill" to={v.bill.path}>{v.bill.label}</Link></>}
                        {v.bill?.title && <div className="rec-vote-title">{v.bill.title.length > 110 ? `${v.bill.title.slice(0, 109).trimEnd()}…` : v.bill.title}</div>}
                      </td>
                      <td className={positionClass(v.position)}>{v.position}</td>
                      <td className="rec-result">
                        {v.result
                          ? <span className={`rc-result rc-result-${v.resultKind || ''}`}>{v.result}</span>
                          : <span className="rec-muted">Not derived</span>}
                      </td>
                      <td className="rec-src">
                        {v.source_url && /^https?:\/\//i.test(v.source_url) && (
                          <a href={v.source_url} target="_blank" rel="noopener noreferrer">{v.chamber === 'Senate' ? 'Senate' : 'Clerk'} ↗</a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <div className="rec-actions">
        <Link className="rc-action-btn btn-secondary btn-sm" to={`/politician/${r.id}`}>Full record →</Link>
        <button type="button" className="rc-action-btn btn-secondary btn-sm" onClick={copy}>Copy link</button>
        <span className="rec-copied" role="status" aria-live="polite">{copied || ''}</span>
      </div>

      <footer className="rec-colophon">
        <p>
          Every member's card uses this same template and the same facts. The votes listed are the {RECORD_VOTE_LIMIT} most
          recent on record, not a selection. Results are derived from the official tally and the question.
        </p>
        <p>
          {r.updatedAt ? `Data recorded through ${longDate(r.updatedAt)}. ` : ''}Sources:{' '}
          <a href={r.sources.congressGov} target="_blank" rel="noopener noreferrer">Congress.gov</a> ·{' '}
          <a href={r.sources.bioguide} target="_blank" rel="noopener noreferrer">Bioguide</a> ·{' '}
          <a href={r.sources.chamberVotes} target="_blank" rel="noopener noreferrer">{r.chamber === 'senate' ? 'Senate.gov roll call votes' : 'House Clerk roll call votes'}</a> ·{' '}
          <Link to="/methodology">Methodology</Link>
        </p>
      </footer>
    </article>
  )
}
