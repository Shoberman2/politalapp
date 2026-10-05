import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import SEO from './SEO'
import { FEATURE_READABILITY, METHODOLOGY_PAGES, OPEN_TRACKS } from '../data/openSource'
import {
  OPEN_DATA_TABLES,
  OPEN_DATA_PATH,
  OPEN_DATA_ARCHIVE_PATH,
  DATA_LICENSE,
  UPDATE_CADENCE,
  CITATION,
  fileName,
  currentCongress,
} from '../../shared/openData.js'
import '../styles/OpenSourcePage.css'

const fileHref = (name) => `${OPEN_DATA_PATH}/${name}`

function OpenSourcePage() {
  const navigate = useNavigate()
  const congress = currentCongress()
  const { hash } = useLocation()

  // In-app links to /open#download land at the section, not the top.
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(hash.slice(1))
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView()
  }, [hash])

  return (
    <div className="open-page">
      <SEO
        title="Open Data"
        description="Download the full BallotWatch congressional record: every member, bill, roll call and vote as daily CSV and NDJSON files, CC0 public domain. Plus the API, MCP server, methodology and source code."
        path="/open"
      />

      <section className="open-hero">
        <div className="open-hero-copy">
          <span className="open-kicker">Open BallotWatch</span>
          <h1>Congressional records you can download, inspect and reuse.</h1>
          <p>
            Every member, bill, roll call and vote BallotWatch has, as daily bulk
            files dedicated to the public domain. The API, MCP server, methodology
            and code are open too, so you can check the work or build on it.
          </p>
          <div className="open-actions">
            <a className="open-primary btn-primary" href="#download">
              Download the full record
            </a>
            <button className="open-secondary btn-secondary" onClick={() => navigate('/methodology')}>
              Read methodology
            </button>
            <a className="open-secondary btn-secondary" href="https://github.com/Shoberman2/politalapp">
              View GitHub
            </a>
          </div>
        </div>
        <aside className="open-ledger" aria-label="Open-source status">
          <div>
            <span>Data license</span>
            <strong>CC0 1.0</strong>
          </div>
          <div>
            <span>Code license</span>
            <strong>MIT</strong>
          </div>
          <div>
            <span>Bulk files</span>
            <strong>Daily</strong>
          </div>
          <div>
            <span>API contract</span>
            <strong>OpenAPI 3.1</strong>
          </div>
          <div>
            <span>Corrections</span>
            <strong>Source-backed</strong>
          </div>
        </aside>
      </section>

      <section className="open-band open-band-ruled" id="download" aria-labelledby="download-title">
        <div className="open-section-heading">
          <span className="open-kicker">Open data</span>
          <h2 id="download-title">Download the full record</h2>
          <p className="open-section-lede">
            Every table below, as gzip CSV and gzip NDJSON: the full archive, and
            the {congress}th Congress on its own. Ids match the site, the API and
            the MCP server, so a row links straight to its page and its official
            source. Bulk files are rebuilt {UPDATE_CADENCE.charAt(0).toLowerCase() + UPDATE_CADENCE.slice(1)}
          </p>
        </div>
        <div className="open-feature-table-wrap">
          <table className="open-feature-table open-data-table">
            <thead>
              <tr>
                <th scope="col">Table</th>
                <th scope="col">What&rsquo;s in it</th>
                <th scope="col">Full archive</th>
                <th scope="col">{congress}th Congress</th>
              </tr>
            </thead>
            <tbody>
              {OPEN_DATA_TABLES.map((t) => (
                <tr key={t.table}>
                  <td>
                    {t.title}
                    <code className="open-data-key">{t.table}</code>
                  </td>
                  <td>{t.description}</td>
                  <td>
                    <span className="open-data-files">
                      <a href={fileHref(fileName(t.table, 'all', congress, 'csv'))} download>CSV</a>
                      <a href={fileHref(fileName(t.table, 'all', congress, 'ndjson'))} download>NDJSON</a>
                    </span>
                  </td>
                  <td>
                    {t.scopes.includes('congress') ? (
                      <span className="open-data-files">
                        <a href={fileHref(fileName(t.table, 'congress', congress, 'csv'))} download>CSV</a>
                        <a href={fileHref(fileName(t.table, 'congress', congress, 'ndjson'))} download>NDJSON</a>
                      </span>
                    ) : (
                      <span className="open-data-na">Same file</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="open-split open-data-meta">
          <div className="open-data-notes">
            <h3>Use it for anything</h3>
            <p>
              The files are dedicated to the public domain under CC0 1.0: copy,
              change, sell or train on them without asking. The underlying House,
              Senate and Congress.gov records are U.S. government works and already
              public domain. The manifest lists each file&rsquo;s row count, size and
              SHA-256; the datapackage gives every column&rsquo;s type and keys.
            </p>
            <h3>How to cite (optional)</h3>
            <p>Attribution is appreciated, never required:</p>
            <p className="open-data-cite">{CITATION.replace('{date}', 'YYYY-MM-DD')}</p>
            <p>
              Where the numbers come from, and what we compute (only a roll
              call&rsquo;s result): <Link to="/data-sources">How we get our data</Link>
              {' '}and <Link to="/methodology">Methodology</Link>.
            </p>
          </div>
          <dl className="open-ledger open-data-facts">
            <div>
              <dt>Manifest</dt>
              <dd><a href={`${OPEN_DATA_PATH}/manifest.json`}>manifest.json</a></dd>
            </div>
            <div>
              <dt>Schema</dt>
              <dd><a href={`${OPEN_DATA_PATH}/datapackage.json`}>datapackage.json</a></dd>
            </div>
            <div>
              <dt>For agents</dt>
              <dd><a href="/api/v1/datasets">/api/v1/datasets</a></dd>
            </div>
            <div>
              <dt>License</dt>
              <dd><a href={DATA_LICENSE.path} rel="license">CC0 1.0</a></dd>
            </div>
            <div>
              <dt>Past snapshots</dt>
              <dd>{OPEN_DATA_ARCHIVE_PATH}/YYYY-MM-DD/ (14 days)</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="open-band">
        <div className="open-section-heading">
          <span className="open-kicker">Public workbench</span>
          <h2>Four ways into the public record</h2>
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
          <h2>Inspect the parts that need trust.</h2>
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
            Small sample files show the shape of member, bill, roll call, and
            committee data at a glance. For everything, use the full download
            above, the keyless API, or the MCP server at /mcp.
          </p>
        </div>
        <div className="open-resource-list">
          <a href="#download">Full record (CSV, NDJSON)</a>
          <a href="/openapi.yaml">OpenAPI description</a>
          <a href="/llms.txt">llms.txt for AI agents</a>
          <a href="/data/datapackage.json">Sample Data Package metadata</a>
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
        <a className="btn-primary" href="https://github.com/Shoberman2/politalapp/issues/new?template=data_correction.yml">
          Report a source-linked correction
        </a>
      </section>
    </div>
  )
}

export default OpenSourcePage
