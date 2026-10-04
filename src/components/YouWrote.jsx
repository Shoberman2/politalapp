import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  SENT_EVENT,
  SENT_KEY,
  billHref,
  billLabel,
  forgetSend,
  noVoteLine,
  readSends,
  sendDay,
  sendId,
  voteLine,
  wroteLine,
} from '../utils/sentMessages'
import { getMemberVotesOnBillAfter } from '../services/laterVotes'
import '../styles/YouWrote.css'

// "You wrote; they voted". The person's own record of messages they said they
// sent (kept on this device), followed by what the public record shows that
// member did on the bill afterwards. Facts only: no verdict, no position.

/** Saved sends, kept in step with this tab and others. */
export function useSentMessages() {
  const [sends, setSends] = useState(() => readSends())
  useEffect(() => {
    const refresh = () => setSends(readSends())
    const onStorage = (e) => { if (!e || e.key === null || e.key === SENT_KEY) refresh() }
    window.addEventListener(SENT_EVENT, refresh)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(SENT_EVENT, refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return sends
}

function useLaterVotes(send) {
  const day = send.billId ? sendDay(send.at) : null
  const key = send.billId ? `${send.member}|${send.billId}|${day}` : ''
  const [state, setState] = useState(() => ({ key, status: key ? 'loading' : 'none', votes: [] }))
  useEffect(() => {
    if (!key) { setState({ key, status: 'none', votes: [] }); return undefined }
    let cancelled = false
    setState({ key, status: 'loading', votes: [] })
    getMemberVotesOnBillAfter({ bioguideId: send.member, billId: send.billId, afterDay: day })
      .then((votes) => {
        if (cancelled) return
        setState(votes === null ? { key, status: 'error', votes: [] } : { key, status: 'ready', votes })
      })
      .catch(() => { if (!cancelled) setState({ key, status: 'error', votes: [] }) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state.key === key ? state : { key, status: key ? 'loading' : 'none', votes: [] }
}

export function SentFollowUp({ send, linkBill = false }) {
  const { status, votes } = useLaterVotes(send)
  const label = send.billId ? billLabel(send.billId) : ''
  const href = send.billId ? billHref(send.billId) : null

  let wrote = wroteLine(send)
  let wroteNode = wrote
  if (linkBill && href && label && wrote.includes(` about ${label} `)) {
    const [before, after] = wrote.split(` about ${label} `)
    wroteNode = <>{before} about <Link to={href}>{label}</Link> {after}</>
  }

  return (
    <li className="yw-item" data-testid="yw-item">
      <p className="yw-wrote">{wroteNode}</p>
      {status === 'loading' && (
        <div className="yw-skeleton" aria-hidden="true"><span className="skeleton yw-skeleton-line" /></div>
      )}
      {status === 'loading' && <span className="yw-sr-only">Checking the record for later votes…</span>}
      {status === 'none' && <p className="yw-muted">Not about a specific bill, so there’s no vote to follow.</p>}
      {status === 'error' && <p className="yw-muted">We couldn’t check the record for later votes just now.</p>}
      {status === 'ready' && votes.length === 0 && <p className="yw-since">{noVoteLine(send.memberName)}</p>}
      {status === 'ready' && votes.length > 0 && (
        <div className="yw-since">
          <span className="yw-since-label">Since then:</span>
          <ul className="yw-votes">
            {votes.map((v) => (
              <li key={v.rollCallId || `${v.votedAt}-${v.position}`}>
                {v.href
                  ? <Link to={v.href} className={`yw-vote yw-vote-${String(v.position).toLowerCase().replace(/\s+/g, '-')}`}>{voteLine(send.memberName, v)}</Link>
                  : <span className="yw-vote">{voteLine(send.memberName, v)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        className="yw-forget"
        onClick={() => forgetSend(send.ref, send.member)}
        aria-label={`Forget this: ${wrote}`}
      >
        Forget this
      </button>
    </li>
  )
}

/**
 * Inline notes on a bill page (`billId`) or a member page (`member`). Renders
 * nothing until the person has saved a send that matches.
 */
export function YouWroteNotes({ billId, member }) {
  const sends = useSentMessages()
  const id = member ? String(member).toUpperCase() : null
  if (!billId && !id) return null
  const mine = sends.filter((s) => (!billId || s.billId === billId) && (!id || s.member === id))
  if (!mine.length) return null
  return (
    <section className="yw" aria-label="Your messages">
      <div className="yw-kicker">You wrote; they voted</div>
      <ul className="yw-list">
        {mine.map((s) => <SentFollowUp key={sendId(s)} send={s} linkBill={!billId} />)}
      </ul>
      <p className="yw-fineprint">Saved on this device only. Counts votes recorded after the day you wrote.</p>
    </section>
  )
}

/** The full list, for /my-representative. */
export function YourMessages() {
  const sends = useSentMessages()
  return (
    <section className="yw yw-page" aria-labelledby="yw-heading">
      <div className="yw-kicker">You wrote; they voted</div>
      <h2 id="yw-heading" className="yw-title">Your <em>messages</em></h2>
      {sends.length ? (
        <ul className="yw-list">
          {sends.map((s) => <SentFollowUp key={sendId(s)} send={s} linkBill />)}
        </ul>
      ) : (
        <p className="yw-muted">
          When you write to a member of Congress from a bill, vote, or member page and mark it sent, it shows up here with any votes they cast on that bill afterwards.
        </p>
      )}
      <p className="yw-fineprint">Saved on this device only. We never see these, or what you wrote. Counts votes recorded after the day you wrote.</p>
    </section>
  )
}
