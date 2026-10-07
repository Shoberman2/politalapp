import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SEO from './SEO'
import { BRAND } from '../config/brand'
import { getRecentFloorVotes, inboxFields, pickHeadlineVote } from '../services/floorVotes'
import '../styles/Offices.css'

// The page for congressional staff. Compliance research (2026-10) shapes the
// copy: House rules require a technology vendor to be authorized before
// marketing or selling to offices, and offices can't accept free in-kind
// services for official work. So this page describes what's being built,
// states its status plainly, and asks only for sponsorship of a review. It
// never offers a trial, a pilot, or a price. Don't add one without counsel.
//
// Layout: a dossier for a chief of staff (Offices.css, scoped under
// .offices-page). The hero's inbox visual is decorative (aria-hidden) and is
// built from the latest real recorded vote; it shows a skeleton while that
// loads, "Not available" if nothing real comes back, and never puts anything
// in the Member's name.

const CAO_TESTIMONY_URL = 'https://www.congress.gov/119/meeting/house/118781/witnesses/HHRG-119-HA27-Wstate-WardK-20251217.pdf'

const PARTS = [
  {
    title: 'Answers from your own sources',
    body: 'Your office chooses what the channel can draw on: published statements, issue pages, FAQs, and the Member’s public voting record. A constituent, or their AI assistant, gets an answer that quotes and cites those sources, or a plain “not found.” It never fills a gap with a guess.',
  },
  {
    title: 'Mail your staff can use',
    body: 'One message per person, written and approved by that person, tagged to the exact bill or roll call it’s about, with the vote shown beside it. Each message carries an honest status: received, read only if staff marked it read, answered only when staff answered.',
  },
  {
    title: 'Your office stays in control',
    body: 'Switch any capability on or off, pause the whole channel at any time, and review an audit log of every action. Every reply is written and sent by your staff.',
  },
]

const NEVER = [
  'Speak as the Member or the office, or present AI text as a staff reply',
  'Infer or invent a position the office hasn’t published',
  'Send a message the constituent hasn’t read and approved',
  'Rank, score, or profile constituents',
  'Automate an official contact form, or place calls to your office',
]

const NOT_AVAILABLE = 'Not available'

// The latest real recorded vote, picked the way the landing picks its headline
// vote (pickHeadlineVote in services/floorVotes.js): among votes with a
// roll-call page, a bill with a tally first, else the most recent one with
// anything to show. Only what the record says.
function useLatestVote() {
  // undefined while loading; once settled, { re, vote } with null for any line
  // the record does not give us.
  const [vote, setVote] = useState(undefined)
  useEffect(() => {
    let cancelled = false
    // The service never rejects: a failed query resolves to null.
    getRecentFloorVotes(16)
      .then((data) => {
        if (!cancelled) setVote(inboxFields(pickHeadlineVote(data?.votes)))
      })
    return () => { cancelled = true }
  }, [])
  return vote
}

function Field({ label, value, loading = false }) {
  return (
    <div className="of-field">
      <dt>{label}</dt>
      <dd>{loading ? <span className="of-skel" /> : (value ?? NOT_AVAILABLE)}</dd>
    </div>
  )
}

// Three stacked cards: a constituent message, a draft answer that may only
// cite approved sources, and the audit log. Decorative; the copy below says
// the same things in words.
function InboxStack() {
  // Skeleton only while loading; "Not available" when no real vote comes
  // back. Never a made-up bill or tally.
  const vote = useLatestVote()
  const loading = vote === undefined
  return (
    <div className="of-stack" aria-hidden="true">
      <div className="of-card of-card--message">
        <div className="of-card-head">
          <span>Constituent message</span>
        </div>
        <dl className="of-fields">
          <Field label="From" value="A constituent in your district" />
          <Field label="Re" value={vote?.re} loading={loading} />
          <Field label="Vote" value={vote?.vote} loading={loading} />
          <Field label="Status" value="Received" />
        </dl>
      </div>
      <div className="of-card of-card--draft">
        <div className="of-card-head">
          <span>Draft answer · from approved sources</span>
        </div>
        <div className="of-draft-lines">
          <span className="of-line" />
          <span className="of-line" />
          <span className="of-line of-line--short" />
        </div>
        <div className="of-chips">
          <span className="of-chip">Issue page</span>
          <span className="of-chip">Floor statement</span>
        </div>
      </div>
      <div className="of-card of-card--audit">
        <span className="of-audit-dot" />
        <span>Reviewed and sent by staff · 2 actions logged</span>
      </div>
    </div>
  )
}

function OfficesPage() {
  return (
    <div className="bw offices-page">
      <SEO
        title="For Congressional Offices"
        description="A channel between constituents, their AI assistants, and congressional offices that answers from sources the office approves and never speaks for the Member. In development."
        path="/offices"
      />

      <section className="of-hero">
        <div className="of-wrap of-hero-grid">
          <div className="of-hero-copy">
            <span className="of-kicker">For congressional offices · In development</span>
            <h1 className="of-title">Answer constituents from your own record. Receive mail your staff can use.</h1>
            <p className="of-lede">
              We’re building a channel between constituents, the AI assistants they already use, and your office.
              It answers from sources your office approves, and it never speaks for the Member.
            </p>
            <div className="of-status" role="note">
              <b>Status: in development.</b> Not yet authorized for use by House or Senate offices. We are not
              selling it or offering trials. We’re looking for an office willing to sponsor a security review
              through the House’s authorization process.
            </div>
          </div>
          <InboxStack />
        </div>
      </section>

      <section className="of-section">
        <div className="of-wrap">
          <h2 className="of-h2">How it would work</h2>
          <ol className="of-parts">
            {PARTS.map((p, i) => (
              <li key={p.title}>
                <span className="of-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="of-section">
        <div className="of-wrap">
          <h2 className="of-h2">What it never does</h2>
          <ul className="of-never">
            {NEVER.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
      </section>

      <section className="of-section">
        <div className="of-wrap">
          <h2 className="of-h2">Why now</h2>
          <blockquote className="of-quote">
            <p>“…all Members’ constituent data resides within the proprietary platforms controlled by a very small pool of vendors. … This limits innovation.”</p>
            <footer>
              House Chief Administrative Officer, written testimony, Committee on House Administration,
              Dec. 17, 2025. <a href={CAO_TESTIMONY_URL} target="_blank" rel="noopener noreferrer">Source</a>
            </footer>
          </blockquote>
          <p className="of-after">
            The House is working toward a model where offices control their own constituent data and approved
            applications plug into it. We’re building for that model: a narrow tool that works alongside your
            constituent management system, not a replacement for it.
          </p>
        </div>
      </section>

      <section className="of-band">
        <div className="of-wrap of-band-grid">
          <div>
            <h2 className="of-h2">Built on the public record</h2>
            <p>
              Constituents already use {BRAND.name} to see how members voted, what’s on the floor this week, and
              what past bills did, every fact linked to its official source. That record is what lets a message
              to your office point to the exact vote it’s about.
            </p>
            <div className="of-links">
              <Link className="btn-text btn-go" to="/">See the public record</Link>
              <Link className="btn-text btn-go" to="/data-sources">How we get our data</Link>
            </div>
          </div>
          <div className="of-sponsor">
            <h2 className="of-h2">Interested in sponsoring a review?</h2>
            {BRAND.officesEmail ? (
              <a className="btn-primary" href={`mailto:${BRAND.officesEmail}?subject=${encodeURIComponent('Sponsoring a review')}`}>
                Contact us
              </a>
            ) : (
              <p className="of-muted">Contact details are coming shortly.</p>
            )}
            <p className="of-muted">
              {BRAND.name} is independent and nonpartisan. It is not affiliated with the U.S. Congress.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

export default OfficesPage
