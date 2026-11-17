import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SEO from './SEO'
import '../styles/DeveloperPortal.css'

const TIERS = [
  {
    name: 'Starter',
    price: 50,
    limit: '10,000',
    features: [
      'All endpoints (members, bills, votes, stats)',
      'Pagination & filtering',
      'Up to 5 API keys',
      'Usage dashboard',
    ],
  },
  {
    name: 'Pro',
    price: 200,
    limit: '100,000',
    features: [
      'Everything in Starter',
      'Priority support',
      'Source-linked bill summaries included',
      'CRS official summaries',
    ],
  },
  {
    name: 'Enterprise',
    price: 500,
    limit: 'Unlimited',
    features: [
      'Everything in Pro',
      'Dedicated support',
      'SLA guarantee',
      'Custom integrations',
    ],
  },
]

function DeveloperPortal() {
  const navigate = useNavigate()
  const { user } = useAuth()

  return (
    <div className="dev-portal">
      <SEO
        title="For Developers: API, MCP Server and Open Data"
        description="Build on the congressional record: a free JSON API with no key needed to read, an MCP server for Claude, ChatGPT and other AI assistants, and bulk open data."
        path="/developers"
      />

      <section className="dev-hero">
        <h1>Build On Source-Linked Congressional Data</h1>
        <p className="dev-hero-subtitle">
          Every GET endpoint is open without a key. Read the OpenAPI contract, or point an
          agent at <code>/llms.txt</code> or the MCP server.
        </p>
        <div className="dev-hero-actions">
          {user ? (
            <button className="btn-primary" onClick={() => navigate('/developers/keys')}>
              Get your API key
            </button>
          ) : (
            <button className="btn-primary" onClick={() => navigate('/auth?next=/developers/keys')}>
              Get a free key
            </button>
          )}
          <button className="btn-outline" onClick={() => navigate('/developers/docs')}>
            Read the docs
          </button>
          <button className="btn-secondary" onClick={() => navigate('/open')}>
            Explore open data
          </button>
        </div>
      </section>

      <section className="dev-endpoints">
        <h2>What You Can Build</h2>
        <div className="dev-endpoint-grid">
          <div className="dev-endpoint-card">
            <code>GET /api/v1/members</code>
            <p>The current congressional roster. Filter members and delegates by state, chamber, or party, with photos, contact info, and districts.</p>
          </div>
          <div className="dev-endpoint-card">
            <code>GET /api/v1/bills</code>
            <p>10,000+ bills with CRS summaries, source-linked explanations, policy areas, and full status tracking.</p>
          </div>
          <div className="dev-endpoint-card">
            <code>GET /api/v1/members/:id/votes</code>
            <p>Complete voting history for any member. Joined with bill metadata for context.</p>
          </div>
          <div className="dev-endpoint-card">
            <code>GET /api/v1/stats</code>
            <p>Party-alignment statistics, attendance stats, bills by policy area. Pre-computed, fast.</p>
          </div>
          <div className="dev-endpoint-card">
            <code>GET /api/v1/votes/:rollCallId</code>
            <p>Full roll call breakdown: every member's vote, party splits, pass/fail summary.</p>
          </div>
          <div className="dev-endpoint-card">
            <code>GET /api/v1/search</code>
            <p>Cross-table search. Find members by name, bills by keyword. One query, all results.</p>
          </div>
        </div>
      </section>

      <section className="dev-agents" id="mcp">
        <div className="dev-open-data-copy">
          <h2>Ask Your AI Assistant</h2>
          <p>
            Connect Claude, ChatGPT or any MCP client and ask how your representative voted.
            Every answer cites the official record. No key and no account are needed: add the
            server address below as a custom connector.
          </p>
          <pre className="dev-curl"><code>{'https://www.ballotwatch.io/mcp'}</code></pre>
        </div>
        <div className="dev-open-data-links">
          <a href="/.well-known/mcp/server-card.json">MCP server card</a>
          <a href="/llms.txt">llms.txt (site map for agents)</a>
          <a href="/llms-full.txt">Everything for agents in one file</a>
        </div>
      </section>

      <section className="dev-agents">
        <div className="dev-open-data-copy">
          <h2>The Same Record As JSON</h2>
          <p>
            Sixty requests a minute and five thousand a day per IP, no signup. Every
            response carries <code>data_updated_at</code> and the official source URL.
            Member, bill, and roll-call pages also answer <code>Accept: text/markdown</code>.
          </p>
          <pre className="dev-curl"><code>{'curl https://www.ballotwatch.io/api/v1/members/P000197/votes?limit=5'}</code></pre>
        </div>
        <div className="dev-open-data-links">
          <a href="/openapi.yaml">OpenAPI spec</a>
          <a href="/sitemap.xml">Sitemap</a>
        </div>
      </section>

      <section className="dev-open-data">
        <div className="dev-open-data-copy">
          <h2>Download The Full Record</h2>
          <p>
            BallotWatch publishes every member, bill, roll call and vote as
            daily CC0 bulk files, plus schema samples and an OpenAPI spec, so
            civic hackers, classrooms, and newsrooms can build without a plan.
          </p>
        </div>
        <div className="dev-open-data-links">
          <a href="/open#download">Full record downloads (CC0)</a>
          <a href="/data/full/manifest.json">Open-data manifest</a>
          <a href="/data/datapackage.json">Sample Data Package metadata</a>
          <a href="/data/members-current.sample.csv">Members CSV sample</a>
          <a href="/data/bills-current-congress.sample.csv">Bills CSV sample</a>
          <a href="/data/sample-votes.json">Votes JSON sample</a>
          <a href="https://github.com/Shoberman2/politalapp/blob/main/docs/api/openapi.yaml">OpenAPI source</a>
        </div>
      </section>

      <section className="dev-pricing" id="pricing">
        <h2>Hosted API Plans</h2>
        <p className="dev-pricing-subtitle">A free key raises the limit from 60 requests a minute to 600. Paid plans add monthly volume and support.</p>
        <div className="dev-tier-grid">
          {TIERS.map(tier => (
            <div key={tier.name} className="dev-tier-card">
              <h3>{tier.name}</h3>
              <div className="dev-tier-price">
                <span className="dev-tier-dollar">$</span>
                <span className="dev-tier-amount">{tier.price}</span>
                <span className="dev-tier-period">/month</span>
              </div>
              <p className="dev-tier-limit">{tier.limit} requests/month</p>
              <ul className="dev-tier-features">
                {tier.features.map(f => <li key={f}>{f}</li>)}
              </ul>
              <button
                className="btn-outline"
                onClick={() => user ? navigate('/developers/keys') : navigate('/auth?next=/developers/keys')}
              >
                Get started
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default DeveloperPortal
