import { useNavigate } from 'react-router-dom'
import articles from '../data/articles'
import Footer from './Footer'
import SEO from './SEO'
import '../styles/Landing.css'

const ArrowRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
)

const FLOOR_ITEMS = [
  { id: 'H.R. 4821', text: 'Passed House, 248-176', sub: 'Energy Permitting Modernization Act' },
  { id: 'S. 1402', text: 'Cloture invoked, 61-38', sub: 'Rural Broadband Access Act' },
  { id: 'H.R. 9', text: 'In committee markup', sub: 'Federal Permitting Reform' },
]

const STATS = [
  { n: '535', l: 'Members tracked' },
  { n: '10K', small: '+', l: 'Bills indexed' },
  { n: '119', small: 'th', l: 'Congress, live' },
  { n: 'MIT', l: 'Code license' },
  { n: 'API', l: 'OpenAPI spec' },
]

const SOURCES = [
  { num: '01', name: 'Congress.gov', desc: 'Bills, roll calls, actions, sponsors, committees and official legislative records.', type: 'Primary source' },
  { num: '02', name: 'U.S. Census Bureau', desc: 'Address-to-district matching for representative lookup.', type: 'Primary source' },
  { num: '03', name: 'Federal Election Commission', desc: 'Campaign-finance context linked to members and policy areas, with visible caveats.', type: 'Primary source' },
  { num: '04', name: 'Open Methodology', desc: 'Public pages cover AI explanations, committee survival, sponsor activity, finance matching and corrections.', type: 'Computed' },
]

const FEATURES = [
  { tag: 'Bill Tracking', title: 'Source-backed bill tracking', body: "Search bills and see the source record, current status, plain-English explanation and methodology caveat together.", meta: [['Asks', "What's moving?"], ['Source', 'Congress.gov'], ['Do', 'Search & cite']] },
  { tag: 'Accountability', title: 'Representative profile pages', body: "Profiles organize a member's votes, sponsorship, party alignment and finance context with source links in one place.", meta: [['Asks', 'Who represents me?'], ['Source', 'Member records'], ['Do', 'Inspect votes']] },
  { tag: 'AI, Audited', title: 'Auditable AI explanations', body: 'AI helps translate dense records, but source facts stay separate and methodology explains the guardrails.', meta: [['Asks', 'What does it mean?'], ['Source', 'Structured inputs'], ['Do', 'Read caveats']] },
  { tag: 'Roll Calls', title: 'Open roll-call records', body: 'Every vote surface tells you how a member voted, what the chamber decided and where the record came from.', meta: [['Asks', "How'd they vote?"], ['Source', 'Roll calls'], ['Do', 'Filter records']] },
  { tag: 'Open Data', title: 'Open data & public API', body: 'Start from sample data and OpenAPI docs, then move to hosted API access when you need freshness and volume.', meta: [['Asks', 'Can I build it?'], ['Source', 'API contract'], ['Do', 'Pull samples']] },
  { tag: 'Corrections', title: 'Source-backed corrections', body: 'Spot something wrong? File a correction with a record, the field, the expected value and a public source URL.', meta: [['Asks', 'Is this right?'], ['Source', 'Public URL'], ['Do', 'Open an issue']] },
]

function Landing() {
  const navigate = useNavigate()

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="bw landing">
      <SEO
        title="Open-Source Congressional Accountability"
        description="BallotWatch is an open-source congressional accountability platform for tracking representatives, bills, votes, methodology, and civic data."
        path="/"
        schema={{
          '@graph': [
            {
              '@type': 'WebSite',
              name: 'BallotWatch',
              url: 'https://www.ballotwatch.io',
              potentialAction: {
                '@type': 'SearchAction',
                target: 'https://www.ballotwatch.io/bills?search={search_term_string}',
                'query-input': 'required name=search_term_string',
              },
            },
            {
              '@type': 'Organization',
              name: 'BallotWatch',
              url: 'https://www.ballotwatch.io',
              logo: 'https://www.ballotwatch.io/capitol-logo.svg',
            },
          ],
        }}
      />

      {/* ===== DATELINE ===== */}
      <div className="dateline-strip">
        <div className="inner">
          <span className="dateline">Washington, D.C. / {today}</span>
          <span className="dateline mid">119th Congress / 1st Session</span>
          <span className="dateline">Vol. I / No. 217 / Edition: Public</span>
        </div>
      </div>

      {/* ===== LEAD ===== */}
      <header className="lead">
        <div className="lead-left">
          <span className="lead-kicker kicker">The Open Congressional Record</span>
          <h1>Every vote, every bill, every dollar, <em>on the record.</em></h1>
          <p className="lead-deck">BallotWatch tracks representatives, legislation, roll-call votes and campaign finance, then shows the source behind every number. Built open-source so voters, journalists and developers can audit the work.</p>
          <div className="lead-cta">
            <button className="btn btn-primary" onClick={() => navigate('/my-representative')}>
              Find My Representative<ArrowRight />
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/bills')}>Browse the Bills Desk</button>
          </div>
          <p className="lead-source">Source-backed / OpenAPI documented / Public methodology<br />Drawn from <b>Congress.gov</b>, <b>U.S. Census Bureau</b> &amp; the <b>Federal Election Commission</b>.</p>
        </div>

        <div className="lead-divider"></div>

        <div className="lead-right">
          <figure className="lead-figure">
            <div className="frame"><img src="/congress.jpg" alt="The United States Capitol" /></div>
            <figcaption>The 119th Congress convenes at the U.S. Capitol. BallotWatch indexes its public record daily.</figcaption>
          </figure>
          <div className="today-rail">
            <div className="rail-head">
              <span className="t">Today on the Floor</span>
              <span className="live-dot">Live</span>
            </div>
            {FLOOR_ITEMS.map((item) => (
              <div className="rail-item" key={item.id}>
                <span className="rid">{item.id}</span>
                <span className="rtxt">{item.text}<small>{item.sub}</small></span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ===== STATS ===== */}
      <section className="stats-ribbon">
        <div className="stats-inner">
          {STATS.map((s) => (
            <div className="stat" key={s.l}>
              <div className="n">{s.n}{s.small && <small>{s.small}</small>}</div>
              <div className="l">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== WORKBENCH ===== */}
      <section className="flow">
        <div className="flow-head">
          <span className="kicker">A public workbench for Congress</span>
          <h2>Use it. Check it. Build on it. <em>Then improve it.</em></h2>
          <p>Four ways into the same open record for readers, auditors, builders and contributors alike.</p>
        </div>
        <div className="flow-items">
          <button className="flow-item" onClick={() => navigate('/my-representative')}>
            <span className="flow-num">01</span>
            <div className="flow-body">
              <h3>Use the App</h3>
              <p>Find your representatives, read their voting records and follow bills without decoding congressional databases.</p>
            </div>
            <span className="flow-link btn-text">Find Reps →</span>
          </button>
          <button className="flow-item" onClick={() => navigate('/methodology')}>
            <span className="flow-num">02</span>
            <div className="flow-body">
              <h3>Check the Work</h3>
              <p>Open methodology pages explain the source, cadence, caveat and code reference behind every computed feature.</p>
            </div>
            <span className="flow-link btn-text">Read Methodology →</span>
          </button>
          <button className="flow-item" onClick={() => navigate('/developers')}>
            <span className="flow-num">03</span>
            <div className="flow-body">
              <h3>Build With Data</h3>
              <p>OpenAPI docs, schema samples and hosted API access for newsroom, research and civic projects.</p>
            </div>
            <span className="flow-link btn-text">Explore the API →</span>
          </button>
          <button className="flow-item" onClick={() => navigate('/open')}>
            <span className="flow-num">04</span>
            <div className="flow-body">
              <h3>Contribute Fixes</h3>
              <p>Report source-backed data issues, improve docs, add examples or help make features clearer for everyone.</p>
            </div>
            <span className="flow-link btn-text">Open the Commons →</span>
          </button>
        </div>
      </section>

      {/* ===== DATA SOURCES ===== */}
      <section className="sources" id="methodology">
        <div className="sources-inner">
          <div className="sources-left">
            <span className="kicker">Where the data comes from</span>
            <h2 className="serif-display sources-title">Source facts, calculations and AI explanations, kept separate.</h2>
            <p className="sources-deck">So a reader can always audit the difference between what the record says, what we computed, and what a model summarized.</p>
            <button className="btn btn-primary" onClick={() => navigate('/methodology')}>
              Read the Methodology<ArrowRight />
            </button>
          </div>
          <ul className="src-list">
            {SOURCES.map((s) => (
              <li className="src-item" key={s.num}>
                <span className="si-num">{s.num}</span>
                <div><h4>{s.name}</h4><p>{s.desc}</p></div>
                <span className="si-type">{s.type}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="section features" id="features">
        <div className="sec-head">
          <span className="kicker">Features</span>
          <h2>Readable by citizens. Useful to builders.</h2>
        </div>
        <div className="feat-grid">
          {FEATURES.map((f) => (
            <div className="feat" key={f.title}>
              <span className="feat-tag">{f.tag}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
              <div className="feat-meta">
                {f.meta.map(([k, v]) => (
                  <div key={k}><span className="k">{k}</span><span className="v">{v}</span></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== CORRECTION DESK ===== */}
      <section className="record-note">
        <div className="record-note-inner">
          <span className="kicker">Correction Desk</span>
          <h2>Public records get better when the audit trail is visible.</h2>
          <p>Every correction asks for the page, field, expected value and a public source URL. That keeps fixes useful to readers, maintainers and downstream projects.</p>
          <button className="btn btn-ghost" onClick={() => navigate('/open')}>Contribute a Correction</button>
        </div>
      </section>

      {/* ===== ARTICLES ===== */}
      <section className="section" id="articles">
        <div className="sec-head">
          <span className="kicker">From the Desk</span>
          <h2>Understand how Congress <em>really</em> works</h2>
          <p>Nonpartisan explainers on legislation, voting records, campaign finance and the procedures that shape American law.</p>
        </div>
        <div className="articles-grid">
          {articles.slice(0, 3).map((article) => (
            <article className="art" key={article.slug} onClick={() => navigate(`/blog/${article.slug}`)}>
              <div className="art-tags">
                {article.tags.map((tag) => <span className="art-tag" key={tag}>{tag}</span>)}
              </div>
              <h3>{article.title}</h3>
              <p>{article.excerpt}</p>
              <span className="btn-text">Read Article →</span>
            </article>
          ))}
        </div>
        <div className="articles-foot"><button className="btn btn-ghost" onClick={() => navigate('/blog')}>View All Articles</button></div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="final" id="open">
        <div>
          <span className="kicker">Start with your district</span>
          <h2>Open the record for <em>your</em> Congress.</h2>
          <p>Find your elected officials, review their voting records, and follow the legislation that shapes your life.</p>
        </div>
        <div className="final-cta">
          <button className="btn btn-primary" onClick={() => navigate('/my-representative')}>
            Find My Representative<ArrowRight />
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/bills')}>Browse Congressional Bills</button>
        </div>
      </section>

      <Footer />
    </div>
  )
}

export default Landing
