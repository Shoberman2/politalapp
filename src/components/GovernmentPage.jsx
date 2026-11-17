import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import SEO from './SEO'
import GovernmentLadder from './GovernmentLadder'
import {
  DEPARTMENTS, INDEPENDENT_AGENCIES, CONGRESS_CHECKS, GOV_AS_OF, GOV_SOURCES, PHOTO_CREDITS,
} from '../data/government'
import { DEPARTMENT_DETAIL, WORKFORCE_FACTS, GOV_DEEP_AS_OF } from '../data/governmentDeep'
import '../styles/InfoPage.css'
import '../styles/Government.css'

// The executive branch in plain English: who is at the top, the 15
// departments under the President, who runs each one and what it does.
// Every department is shown as its real headquarters; pressing one opens a
// sheet that explains it. Facts and their sources live in
// src/data/government.js, checked on the date printed at the foot.

const OPM_DATA_URL = 'https://data.opm.gov/explore-data/analytics/workforce-size-and-composition'

// Photographs that need a credit and a license link (everything else is public domain).
const LICENSED_PHOTOS = Object.entries(PHOTO_CREDITS).filter(([, c]) => c.license && c.license !== 'Public domain')

const longDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
})

// A count printed as "about": the nearest thousand, or hundred when small.
export function roundedCount(n) {
  const step = n >= 100000 ? 1000 : 100
  return (Math.round(n / step) * step).toLocaleString('en-US')
}

// "Marco Rubio, Secretary of State", with "Acting" said plainly when it applies.
export function leaderLine(d) {
  if (!d.headName) return `${d.headTitle}: vacant`
  return `${d.headName}, ${d.acting ? 'Acting ' : ''}${d.headTitle}`
}

// "Run by Billy Long, Commissioner", or the title alone when we could not
// confirm who holds the job. Never a guessed name.
export function componentLeader(c) {
  if (!c.headTitle) return null
  if (!c.headName) return `${c.headTitle}: we could not confirm who holds this job`
  return `Run by ${c.headName}, ${c.acting ? 'Acting ' : ''}${c.headTitle}`
}

function PhotoCredit({ file }) {
  const c = PHOTO_CREDITS[file]
  if (!c) return null
  return (
    <p className="gov-credit">
      Photo: {c.sourceUrl ? <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">{c.author}</a> : c.author}
      {c.license && <>, {c.licenseUrl && c.license !== 'Public domain' ? <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer">{c.license}</a> : c.license}</>}
    </p>
  )
}

function DepartmentSheet({ dept, onClose }) {
  const ref = useRef(null)
  const detail = DEPARTMENT_DETAIL[dept.id] || null
  const components = detail?.components || []
  const congress = detail?.congress || null

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return undefined
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal()
    } else {
      dialog.setAttribute('open', '')
    }
    // No close() on cleanup: closing fires the dialog's own close event, which
    // would dismiss the sheet the moment React re-runs this effect. Leaving
    // the page removes the element, and the top layer with it.
    return undefined
  }, [dept.id])

  return (
    <dialog
      ref={ref}
      className="gov-sheet"
      aria-labelledby="gov-sheet-title"
      onClose={onClose}
      onCancel={onClose}
      // A press on the dimmed page behind the sheet closes it.
      onClick={(e) => { if (e.target === ref.current) onClose() }}
    >
      <div className="gov-sheet-photo">
        <img src={dept.photo} alt={`${dept.building}, headquarters of the ${dept.name}`} width="1600" height="686" />
        <button type="button" className="btn-outline btn-sm gov-sheet-close" onClick={onClose}>Close</button>
      </div>
      <div className="gov-sheet-body">
        <h2 id="gov-sheet-title">{dept.name}</h2>
        <p className="gov-sheet-does">{dept.does}</p>
        {dept.note && <p className="gov-sheet-note">{dept.note}</p>}

        <dl className="gov-facts">
          <div>
            <dt>Who runs it</dt>
            <dd>{leaderLine(dept)}</dd>
          </div>
          <div>
            <dt>How they got the job</dt>
            <dd>
              {dept.acting
                ? 'Serving as acting head. A permanent head is picked by the President and must be confirmed by the Senate.'
                : 'Picked by the President and confirmed by a vote of the Senate.'}
            </dd>
          </div>
          <div>
            <dt>Founded</dt>
            <dd>{dept.founded}</dd>
          </div>
          {dept.employees && (
            <div>
              <dt>People who work there</dt>
              <dd>
                About {roundedCount(dept.employees.count)}
                <small>
                  {dept.employees.note} Our sum of{' '}
                  <a href={OPM_DATA_URL} target="_blank" rel="noopener noreferrer">OPM’s employment data</a>.
                </small>
              </dd>
            </div>
          )}
          {components.length === 0 && (
            <div className="gov-fact-wide">
              <dt>Inside it</dt>
              <dd>{dept.agencies.join(' · ')}</dd>
            </div>
          )}
          <div>
            <dt>The building</dt>
            <dd>{dept.building}<small>{dept.address}</small></dd>
          </div>
        </dl>

        {components.length > 0 && (
          <section className="gov-part" aria-labelledby="gov-inside-title">
            <h3 id="gov-inside-title">Inside The Department</h3>
            <p className="gov-part-sub">
              A department is made of smaller agencies, each with its own job and its own boss.
              These are the {components.length} largest or best known.
            </p>
            <ul className="gov-components">
              {components.map((c) => (
                <li key={c.name}>
                  <h4>{c.website ? <a href={c.website} target="_blank" rel="noopener noreferrer">{c.name}</a> : c.name}</h4>
                  <p>{c.does}</p>
                  {componentLeader(c) && (
                    <p className="gov-comp-head">
                      {componentLeader(c)}
                      {c.headSource && <> · <a href={c.headSource} target="_blank" rel="noopener noreferrer">Source</a></>}
                    </p>
                  )}
                  {c.note && <p className="gov-comp-note">{c.note}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="gov-part" aria-labelledby="gov-congress-part-title">
          <h3 id="gov-congress-part-title">How Congress Shapes It</h3>
          <dl className="gov-facts">
            {congress?.fundedBy && (
              <div>
                <dt>How it gets its money</dt>
                <dd>Congress funds it each year through the {congress.fundedBy}.</dd>
              </div>
            )}
            {congress?.confirmed && (
              <div>
                <dt>Who the Senate must approve</dt>
                <dd>{congress.confirmed}</dd>
              </div>
            )}
            {congress?.laws?.length > 0 && (
              <div className="gov-fact-wide">
                <dt>Laws Congress wrote for it</dt>
                <dd>
                  <ul className="gov-laws">
                    {congress.laws.map((l) => <li key={l.name}><b>{l.name}.</b> {l.what}</li>)}
                  </ul>
                </dd>
              </div>
            )}
            <div className="gov-fact-wide">
              <dt>Committees that watch it</dt>
              <dd>
                {dept.oversight.house.join(', ')}
                <small>{dept.oversight.senate.join(', ')}</small>
              </dd>
            </div>
          </dl>
          {congress?.source && (
            <p className="gov-sheet-links">
              <a href={congress.source} target="_blank" rel="noopener noreferrer">Source for the funding bill</a>
            </p>
          )}
        </section>

        <p className="gov-sheet-links">
          <a href={dept.website} target="_blank" rel="noopener noreferrer">Official website</a>
          <a href={dept.headSource} target="_blank" rel="noopener noreferrer">Source for who runs it</a>
        </p>
        <PhotoCredit file={dept.photo.split('/').pop()} />
      </div>
    </dialog>
  )
}

function GovernmentPage() {
  const { hash } = useLocation()
  const [openId, setOpenId] = useState(null)
  const openerRef = useRef(null)
  const open = DEPARTMENTS.find((d) => d.id === openId) || null

  // /government#treasury opens that department.
  useEffect(() => {
    const id = hash ? decodeURIComponent(hash.slice(1)) : ''
    if (id && DEPARTMENTS.some((d) => d.id === id)) setOpenId(id)
  }, [hash])

  const close = () => {
    setOpenId(null)
    openerRef.current?.focus?.()
  }

  return (
    <div className="bw info-page gov-page">
      <SEO
        title="Who Runs the U.S. Government? The 15 Departments"
        description="Who runs the U.S. government, in plain English: the President, the 15 executive departments, who leads each one, what it does, and how Congress checks them."
        path="/government"
        image="https://www.ballotwatch.io/gov/og-government.jpg"
      />

      <GovernmentLadder headingLevel="h1" linkTo={null} />

      <section aria-labelledby="gov-depts-title">
        <div className="gov-wide">
          <h2 id="gov-depts-title">The 15 Departments</h2>
          <p className="gov-sub">
            Each one is a real building in or near Washington, with one person in charge. Pick a building
            to see who runs it and what it does.
          </p>
          <ul className="gov-depts">
            {DEPARTMENTS.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className="gov-dept"
                  aria-haspopup="dialog"
                  onClick={(e) => { openerRef.current = e.currentTarget; setOpenId(d.id) }}
                >
                  <span className="gov-dept-photo">
                    <img src={d.photo} alt={d.building} width="1600" height="1067" loading="lazy" decoding="async" />
                  </span>
                  <span className="gov-dept-name">{d.short}</span>
                  <span className="gov-dept-head">{leaderLine(d)}</span>
                  {DEPARTMENT_DETAIL[d.id]?.components?.length > 0 && (
                    <span className="gov-dept-count">{DEPARTMENT_DETAIL[d.id].components.length} agencies inside, explained</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {WORKFORCE_FACTS.length > 0 && (
        <section aria-labelledby="gov-workers-title">
          <div className="ip-inner">
            <h2 id="gov-workers-title">The Two Million Workers</h2>
            <p>
              Under the people the President appoints are the career staff who do the daily work
              and stay when the President changes.
            </p>
            <ul className="gov-workers gov-more">
              {WORKFORCE_FACTS.map((f) => (
                <li key={f.fact}>
                  <p>{f.fact}</p>
                  <small>
                    {f.asOf ? `${f.asOf} · ` : ''}
                    <a href={f.source} target="_blank" rel="noopener noreferrer">Source</a>
                  </small>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section aria-labelledby="gov-congress-title">
        <div className="ip-inner">
          <h2 id="gov-congress-title">Where Congress Comes In</h2>
          <ul className="gov-checks">
            {CONGRESS_CHECKS.map((c) => (
              <li key={c.title}>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </li>
            ))}
          </ul>
          <p className="gov-more"><Link className="btn-text" to="/this-week">See this week’s votes</Link></p>
        </div>
      </section>

      <section aria-labelledby="gov-indies-title">
        <div className="ip-inner">
          <h2 id="gov-indies-title">Outside The Departments</h2>
          <p>
            Some agencies answer to the President or to Congress without sitting inside any department.
          </p>
          <ul className="gov-indies gov-more">
            {INDEPENDENT_AGENCIES.map((a) => (
              <li key={a.name}>
                <h3>{a.name}</h3>
                <p>{a.does}</p>
                {a.headName && <small>{a.headName}, {a.acting ? 'Acting ' : ''}{a.headTitle}</small>}
              </li>
            ))}
          </ul>
          <p className="gov-asof">
            Department heads checked on {longDate(GOV_AS_OF)}; the agencies inside them
            on {longDate(GOV_DEEP_AS_OF)}. People change jobs: each department’s sheet links to the
            official page we checked. Sources:{' '}
            {GOV_SOURCES.map((s, i) => (
              <span key={s.url}>
                {i > 0 && ' · '}
                <a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a>
              </span>
            ))}
          </p>
          <p className="gov-credit">
            Building photographs are public domain except these, used under their licenses:{' '}
            {LICENSED_PHOTOS.map(([file, c], i) => (
              <span key={file}>
                {i > 0 && ' · '}
                {DEPARTMENTS.find((d) => d.photo.endsWith(`/${file}`))?.short}, by{' '}
                <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">{c.author}</a>{' '}
                (<a href={c.licenseUrl} target="_blank" rel="noopener noreferrer">{c.license}</a>)
              </span>
            ))}
            . Images were resized.
          </p>
        </div>
      </section>

      {open && <DepartmentSheet dept={open} onClose={close} />}
    </div>
  )
}

export default GovernmentPage
