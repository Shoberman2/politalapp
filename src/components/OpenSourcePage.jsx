import { Link, useNavigate } from 'react-router-dom'
import SEO from './SEO'
import { FEATURE_READABILITY, METHODOLOGY_PAGES, OPEN_TRACKS } from '../data/openSource'
import '../styles/OpenSourcePage.css'

function OpenSourcePage() {
  const navigate = useNavigate()

  return (
    <div className="open-page">
      <SEO
        title="Open BallotWatch"
        description="Use, inspect, cite, and contribute to BallotWatch congressional data, methodology, API docs, and open-source civic tools."
        path="/open"
      />

      <section className="open-hero">
        <div className="open-hero-copy">
          <span className="open-kicker">Open BallotWatch</span>
          <h1>Congressional accountability you can inspect.</h1>
          <p>
            BallotWatch is built as an open civic commons: source-backed data,
            readable methodology, public samples, API docs, and contribution paths
            for people who want to improve the work.
          </p>
          <div className="open-actions">
            <button className="open-primary" onClick={() => navigate('/methodology')}>
              Read Methodology
            </button>
            <a className="open-secondary" href="https://github.com/Shoberman2/politalapp">
              View GitHub
            </a>
          </div>
        </div>
        <aside className="open-ledger" aria-label="Open-source status">
          <div>
            <span>License</span>
            <strong>MIT code</strong>
          </div>
          <div>
            <span>API contract</span>
            <strong>OpenAPI 3.1</strong>
          </div>
          <div>
            <span>Sample data</span>
            <strong>Data Package</strong>
          </div>
          <div>
            <span>Corrections</span>
            <strong>Source-backed</strong>
          </div>
        </aside>
      </section>

      <section className="open-band">
        <div className="open-section-heading">
          <span className="open-kicker">Public workbench</span>
          <h2>Four ways into the commons</h2>
        </div>
        <div className="open-track-grid">
          {OPEN_TRACKS.map(track => (
            <article className="open-track" key={track.title}>
              <h3>{track.title}</h3>
              <p>{track.text}</p>
              <div className="open-link-row">
                {track.links.map(link => (
                  link.to ? (
                    <Link key={link.label} to={link.to}>{link.label}</Link>
                  ) : (
                    <a key={link.label} href={link.href}>{link.label}</a>
                  )
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="open-band open-band-ruled">
        <div className="open-section-heading">
          <span className="open-kicker">Readable features</span>
          <h2>Every feature explains its source and next action.</h2>
        </div>
        <div className="open-feature-table-wrap">
          <table className="open-feature-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Question</th>
                <th>Source</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {FEATURE_READABILITY.map(item => (
                <tr key={item.feature}>
                  <td>{item.feature}</td>
                  <td>{item.question}</td>
                  <td>{item.source}</td>
                  <td>{item.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="open-band">
        <div className="open-section-heading">
          <span className="open-kicker">Methodology</span>
          <h2>Audit the parts that need trust.</h2>
        </div>
        <div className="open-method-grid">
          {METHODOLOGY_PAGES.map(page => (
            <Link className="open-method-link" key={page.slug} to={`/methodology/${page.slug}`}>
              <span>{page.title}</span>
              <p>{page.dek}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="open-band open-split">
        <div>
          <span className="open-kicker">Build with it</span>
          <h2>Start without an API key.</h2>
          <p>
            Public sample files show the shape of member, bill, roll call, and
            committee data. They are schema samples, not production exports.
          </p>
        </div>
        <div className="open-resource-list">
          <a href="/data/datapackage.json">Data Package metadata</a>
          <a href="/data/members-current.sample.csv">Members sample CSV</a>
          <a href="/data/bills-current-congress.sample.csv">Bills sample CSV</a>
          <a href="/data/roll-calls-current-congress.sample.csv">Roll calls sample CSV</a>
          <a href="/data/sample-votes.json">Vote sample JSON</a>
        </div>
      </section>

      <section className="open-callout">
        <h2>Found a factual issue?</h2>
        <p>
          Report it with the BallotWatch page or record, the field that appears
          wrong, the expected value, and a public source URL.
        </p>
        <a href="https://github.com/Shoberman2/politalapp/issues/new?template=data_correction.yml">
          Report a source-backed correction
        </a>
      </section>
    </div>
  )
}

export default OpenSourcePage
