import { Link } from 'react-router-dom'
import SEO from './SEO'
import { BRAND } from '../config/brand'
import { DATA_SOURCES } from '../data/infoPages'
import '../styles/InfoPage.css'

// "How we get our data": every upstream source, what we take, how often, and
// what we compute or write with AI on top. The source list lives in
// src/data/infoPages.js with notes on which code each line was checked against.

const COMPUTED = [
  'A roll call’s result, from its tally and its question, using the real threshold (simple majority, 60 votes, or two-thirds). When the record doesn’t say which applies, we don’t assert one.',
  'Vote counts on a member’s record: votes cast and not voting this Congress.',
  'A bill’s stage (introduced, in committee, passed), read from its latest official action.',
]

const AI = [
  'A short plain-English explanation of a bill, written from its official CRS summary and labeled as AI. When there is no summary yet, we say so instead of guessing from the title.',
  'Short narration on some pages, such as a member’s voting pattern, written from numbers we computed first. AI never produces a vote count or a percentage.',
]

function DataSourcesPage() {
  return (
    <div className="bw info-page data-sources-page">
      <SEO
        title="How We Get Our Data"
        description={`Where ${BRAND.name}'s data comes from: Congress.gov, the House Clerk, the U.S. Senate, docs.house.gov, the U.S. Census Bureau, and the FEC. What we take from each, how often, and what we compute.`}
        path="/data-sources"
      />

      <section className="ip-hero">
        <div className="ip-inner">
          <span className="ip-kicker">Data sources</span>
          <h1 className="ip-title">How we get our data</h1>
          <p className="ip-lede">
            Everything on {BRAND.name} comes from official public sources, shown as published and linked back to
            where it came from.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Where it comes from</h2>
          <ul className="ip-sources">
            {DATA_SOURCES.map((s) => (
              <li key={s.name}>
                <div>
                  <h3>{s.name}</h3>
                  <p>{s.takes}</p>
                </div>
                <div className="ip-source-meta">
                  <span className="ip-cadence">{s.cadence}</span>
                  {s.cadenceNote && <span className="ip-cadence-note">{s.cadenceNote}</span>}
                  <a className="btn-text btn-go" href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.linkLabel}
                  </a>
                </div>
              </li>
            ))}
          </ul>
          <p className="ip-muted ip-after">
            Daily means our pipeline runs every morning at 06:00 UTC. Every API response reports when that last
            happened, and every record carries its official source link.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>What we compute</h2>
          <ul className="ip-list">
            {COMPUTED.map((t) => <li key={t}>{t}</li>)}
          </ul>
          <p className="ip-muted ip-after">We don’t score, rank, or rate members.</p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>What AI does here</h2>
          <ul className="ip-list">
            {AI.map((t) => <li key={t}>{t}</li>)}
          </ul>
          <p className="ip-muted ip-after">Procedural terms such as cloture are explained from a glossary we wrote, not by AI.</p>
          <div className="ip-links">
            <Link className="btn-text btn-go" to="/methodology/ai-explanations">How AI explanations are made</Link>
          </div>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Spot an error?</h2>
          <p>
            Official records are sometimes corrected after they are published. If something here doesn’t match the
            source, tell us with a link to the source that shows it.
          </p>
          <div className="ip-links">
            <Link className="btn-text btn-go" to="/methodology/corrections">Send a correction</Link>
            <Link className="btn-text btn-go" to="/methodology">Methodology</Link>
          </div>
        </div>
      </section>
    </div>
  )
}

export default DataSourcesPage
