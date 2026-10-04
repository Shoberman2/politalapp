import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getFloorSchedule, SENATE_NOTE } from '../services/floorSchedule'
import { getRecentFloorVotes, rollCallHref } from '../services/floorVotes'
import '../styles/ThisWeekOnFloor.css'

// "This week on the floor": what the House has scheduled (from the Majority
// Leader's weekly XML on docs.house.gov) beside what either chamber just
// recorded. Rows only ever come from those two sources; while loading we show
// skeletons, and when a source is empty we say so plainly.

const HOUSE_FLOOR_HOME = 'https://docs.house.gov/floor/'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-09-14" -> "Sep 14" without a timezone shift.
export function weekLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  if (!m) return iso || ''
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`
}

function resultKind(result) {
  if (!result) return 'neutral'
  const r = result.toLowerCase()
  if (r.includes('reject') || r.includes('fail') || r.includes('sustained') || r.startsWith('not ')) return 'fail'
  if (r.includes('pass') || r.includes('invoked') || r.includes('confirmed') || r.includes('agreed') || r.includes('overridden') || r.includes('ratified')) return 'pass'
  return 'neutral'
}

function SkeletonRows({ count }) {
  return Array.from({ length: count }, (_, i) => (
    <li key={i} className="twof-row twof-row--skeleton" aria-hidden="true">
      <span className="twof-skel twof-skel--num" />
      <span className="twof-skel twof-skel--text" />
      <span className="twof-skel twof-skel--meta" />
    </li>
  ))
}

function ScheduledRow({ item }) {
  const number = item.label || '—'
  return (
    <li className="twof-row twof-row--scheduled">
      <div className="twof-row-head">
        {item.billHref
          ? <Link className="twof-num" to={item.billHref}>{number}</Link>
          : <span className="twof-num twof-num--plain">{number}</span>}
        {item.category && <span className="twof-cat">{item.category}</span>}
      </div>
      <p className="twof-title" title={item.title || undefined}>{item.title || 'Untitled floor item'}</p>
      <div className="twof-row-foot">
        {item.tellRepHref && (
          <Link className="twof-tell" to={item.tellRepHref}>Tell your rep before the vote</Link>
        )}
        <a className="twof-src" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">docs.house.gov</a>
      </div>
    </li>
  )
}

function RecordedRow({ vote }) {
  const href = rollCallHref(vote.id)
  const text = vote.description || vote.question || ''
  const tally = vote.yea != null && vote.nay != null ? `${vote.yea}–${vote.nay}` : null
  return (
    <li className="twof-row twof-row--recorded">
      <div className="twof-row-head">
        {href
          ? <Link className="twof-num" to={href}>{vote.chamber} {vote.number != null ? `Roll ${vote.number}` : 'roll call'}</Link>
          : <span className="twof-num twof-num--plain">{vote.chamber}</span>}
        {vote.bill && <Link className="twof-bill" to={vote.bill.href}>{vote.bill.display}</Link>}
      </div>
      {text && <p className="twof-title" title={text}>{text}</p>}
      <div className="twof-row-foot">
        {tally && <span className="twof-tally">{tally}</span>}
        {vote.result && <span className={`twof-result twof-result--${resultKind(vote.result)}`}>{vote.result}</span>}
      </div>
    </li>
  )
}

function ScheduledColumn({ schedule, limit }) {
  if (schedule === undefined) {
    return <ul className="twof-list" aria-busy="true" aria-label="Loading the House floor schedule"><SkeletonRows count={Math.min(limit, 4)} /></ul>
  }
  if (schedule === null) {
    return (
      <p className="twof-empty">
        The House floor schedule couldn’t be loaded right now. The official copy is on{' '}
        <a href={HOUSE_FLOOR_HOME} target="_blank" rel="noopener noreferrer">docs.house.gov</a>.
      </p>
    )
  }

  const [thisWeek, nextWeek] = schedule.weeks
  const published = schedule.weeks.filter((w) => w.status === 'published' && w.items.length)
  if (!published.length) {
    return (
      <p className="twof-empty">
        No floor schedule published for this week
        {thisWeek ? <> (week of <span className="twof-mono">{weekLabel(thisWeek.week)}</span>)</> : null}.
        {' '}The House may be out of session.{' '}
        <a href={thisWeek?.sourceUrl || HOUSE_FLOOR_HOME} target="_blank" rel="noopener noreferrer">Check docs.house.gov</a>
      </p>
    )
  }

  let remaining = limit
  const groups = []
  for (const w of published) {
    if (remaining <= 0) break
    const shown = w.items.slice(0, remaining)
    remaining -= shown.length
    groups.push({ week: w, shown, hidden: w.items.length - shown.length })
  }
  const hiddenWeeks = published.slice(groups.length)

  return (
    <>
      {thisWeek && thisWeek.status !== 'published' && (
        <p className="twof-note">Nothing published for this week (<span className="twof-mono">{weekLabel(thisWeek.week)}</span>).</p>
      )}
      {groups.map(({ week, shown, hidden }) => (
        <div className="twof-week" key={week.week}>
          <p className="twof-dateline">
            {week === nextWeek ? 'Next week' : 'This week'} · week of <span className="twof-mono">{weekLabel(week.week)}</span>
          </p>
          <ul className="twof-list">
            {shown.map((item) => <ScheduledRow key={item.id} item={item} />)}
          </ul>
          {hidden > 0 && (
            <a className="twof-more" href={week.sourceUrl} target="_blank" rel="noopener noreferrer">
              {hidden} more on the official schedule
            </a>
          )}
        </div>
      ))}
      {hiddenWeeks.map((w) => (
        <a key={w.week} className="twof-more" href={w.sourceUrl} target="_blank" rel="noopener noreferrer">
          Week of {weekLabel(w.week)}: {w.items.length} items on the official schedule
        </a>
      ))}
    </>
  )
}

function RecordedColumn({ votes, limit }) {
  if (votes === undefined) {
    return <ul className="twof-list" aria-busy="true" aria-label="Loading recorded votes"><SkeletonRows count={Math.min(limit, 4)} /></ul>
  }
  if (!votes || !votes.length) {
    return <p className="twof-empty">No recorded votes to show right now.</p>
  }
  return (
    <ul className="twof-list">
      {votes.slice(0, limit).map((v) => <RecordedRow key={v.id} vote={v} />)}
    </ul>
  )
}

export default function ThisWeekOnFloor({ limit = 6, showRecorded = true }) {
  // undefined = loading, null = failed/none, otherwise data.
  const [schedule, setSchedule] = useState(undefined)
  const [votes, setVotes] = useState(undefined)

  useEffect(() => {
    let cancelled = false
    getFloorSchedule().then((s) => { if (!cancelled) setSchedule(s ?? null) }, () => { if (!cancelled) setSchedule(null) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!showRecorded) return undefined
    let cancelled = false
    getRecentFloorVotes(Math.max(16, limit * 2)).then(
      (data) => {
        if (cancelled) return
        const usable = (data?.votes || []).filter((v) => v.description || v.question || v.bill)
        setVotes(usable)
      },
      () => { if (!cancelled) setVotes(null) },
    )
    return () => { cancelled = true }
  }, [showRecorded, limit])

  return (
    <section className={`twof${showRecorded ? '' : ' twof--single'}`} aria-labelledby="twof-heading">
      <header className="twof-header">
        <p className="twof-kicker">This week on the floor</p>
        <h2 id="twof-heading" className="twof-heading">Coming up, and just decided.</h2>
      </header>
      <div className="twof-grid">
        <div className="twof-col twof-col--scheduled">
          <h3 className="twof-col-title">Scheduled</h3>
          <ScheduledColumn schedule={schedule} limit={limit} />
          <p className="twof-footnote">{SENATE_NOTE}</p>
        </div>
        {showRecorded && (
          <div className="twof-col twof-col--recorded">
            <h3 className="twof-col-title">Recorded</h3>
            <RecordedColumn votes={votes} limit={limit} />
          </div>
        )}
      </div>
    </section>
  )
}
