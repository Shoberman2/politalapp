import { Link } from 'react-router-dom'
import SEO from './SEO'
import { BRAND } from '../config/brand'
import '../styles/InfoPage.css'

// The page for congressional staff. Compliance research (2026-10) shapes the
// copy: House rules require a technology vendor to be authorized before
// marketing or selling to offices, and offices can't accept free in-kind
// services for official work. So this page describes what's being built,
// states its status plainly, and asks only for sponsorship of a review. It
// never offers a trial, a pilot, or a price. Don't add one without counsel.

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

function OfficesPage() {
  return (
    <div className="bw info-page offices-page">
      <SEO
        title="For Congressional Offices"
        description="A channel between constituents, their AI assistants, and congressional offices that answers from sources the office approves and never speaks for the Member. In development."
        path="/offices"
      />

      <section className="ip-hero">
        <div className="ip-inner">
          <span className="ip-kicker">For congressional offices</span>
          <h1 className="ip-title">Answer constituents from your own record. Receive mail your staff can use.</h1>
          <p className="ip-lede">
            We’re building a channel between constituents, the AI assistants they already use, and your office.
            It answers from sources your office approves, and it never speaks for the Member.
          </p>
          <div className="ip-note" role="note">
            <b>Status: in development.</b> Not yet authorized for use by House or Senate offices. We are not
            selling it or offering trials. We’re looking for an office willing to sponsor a security review
            through the House’s authorization process.
          </div>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Why now</h2>
          <blockquote className="ip-quote">
            <p>“…all Members’ constituent data resides within the proprietary platforms controlled by a very small pool of vendors. … This limits innovation.”</p>
            <footer>
              House Chief Administrative Officer, written testimony, Committee on House Administration,
              Dec. 17, 2025. <a href={CAO_TESTIMONY_URL} target="_blank" rel="noopener noreferrer">Source</a>
            </footer>
          </blockquote>
          <p className="ip-after">
            The House is working toward a model where offices control their own constituent data and approved
            applications plug into it. We’re building for that model: a narrow tool that works alongside your
            constituent management system, not a replacement for it.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>How it would work</h2>
          <ul className="ip-list">
            {PARTS.map((p) => (
              <li key={p.title}>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>What it never does</h2>
          <ul className="ip-list">{NEVER.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Built on the public record</h2>
          <p>
            Constituents already use {BRAND.name} to see how members voted, what’s on the floor this week, and
            what past bills did, every fact linked to its official source. That record is what lets a message
            to your office point to the exact vote it’s about.
          </p>
          <div className="ip-links">
            <Link className="btn-text btn-go" to="/">See the public record</Link>
            <Link className="btn-text btn-go" to="/data-sources">How we get our data</Link>
          </div>
        </div>
      </section>

      <section className="ip-band">
        <div className="ip-inner">
          <h2>Interested in sponsoring a review?</h2>
          {BRAND.officesEmail ? (
            <a className="btn-primary" href={`mailto:${BRAND.officesEmail}?subject=${encodeURIComponent('Sponsoring a review')}`}>
              Contact us
            </a>
          ) : (
            <p className="ip-muted">Contact details are coming shortly.</p>
          )}
          <p className="ip-muted">
            {BRAND.name} is independent and nonpartisan. It is not affiliated with the U.S. Congress.
          </p>
        </div>
      </section>
    </div>
  )
}

export default OfficesPage
