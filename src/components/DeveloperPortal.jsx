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
      '10,000 API requests/month',
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
    popular: true,
    features: [
      '100,000 API requests/month',
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
      'Unlimited API requests',
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
        title="BallotWatch API and Open Data"
        description="OpenAPI docs, public sample data, and hosted API access for congressional voting records, bills, member profiles, and civic statistics."
        path="/developers"
      />

      <section className="dev-hero">
        <span className="dev-label">BallotWatch API and Open Data</span>
        <h1>Build on source-linked congressional data</h1>
        <p className="dev-hero-subtitle">
          Start with public samples, inspect the OpenAPI contract, then use hosted
          access when you need fresh congressional data at production volume.
        </p>
        <div className="dev-hero-actions">
          <button className="btn-secondary dev-open-button" onClick={() => navigate('/open')}>
            Explore Open Data
          </button>
          {user ? (
            <button className="btn-primary" onClick={() => navigate('/developers/keys')}>
              Get Your API Key
            </button>
          ) : (
            <button className="btn-primary" onClick={() => navigate('/auth')}>
              Sign Up for API Access
            </button>
          )}
          <button className="btn-tertiary" onClick={() => navigate('/developers/docs')}>
            Read the Docs
          </button>
        </div>
      </section>

      <section className="dev-endpoints">
        <h2>What you can build</h2>
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

      <section className="dev-open-data">
        <div className="dev-open-data-copy">
          <span className="dev-label">Open first</span>
          <h2>Use the samples before you need a key</h2>
          <p>
            BallotWatch publishes schema samples and an OpenAPI spec so civic
            hackers, classrooms, and newsrooms can prototype without a paid plan.
            Hosted API plans cover freshness, uptime, volume, and support.
          </p>
        </div>
        <div className="dev-open-data-links">
          <a href="/data/datapackage.json">Data Package metadata</a>
          <a href="/data/members-current.sample.csv">Members CSV sample</a>
          <a href="/data/bills-current-congress.sample.csv">Bills CSV sample</a>
          <a href="/data/sample-votes.json">Votes JSON sample</a>
          <a href="https://github.com/Shoberman2/politalapp/blob/main/docs/api/openapi.yaml">OpenAPI source</a>
        </div>
      </section>

      <section className="dev-pricing" id="pricing">
        <h2>Hosted API plans</h2>
        <p className="dev-pricing-subtitle">Public samples are open. Hosted plans add keys, freshness, request volume, usage tracking, and support.</p>
        <div className="dev-tier-grid">
          {TIERS.map(tier => (
            <div key={tier.name} className={`dev-tier-card ${tier.popular ? 'dev-tier-popular' : ''}`}>
              {tier.popular && <span className="dev-tier-badge">Most Popular</span>}
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
                className={tier.popular ? 'btn-primary' : 'btn-secondary'}
                onClick={() => user ? navigate('/developers/keys') : navigate('/auth')}
              >
                Get Started
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="dev-cta">
        <h2>Ready to build on the live API?</h2>
        <p>Start from the samples, then sign up when your project needs fresh hosted data.</p>
        <button className="btn-primary" onClick={() => user ? navigate('/developers/keys') : navigate('/auth')}>
          {user ? 'Go to API Keys' : 'Create Account'}
        </button>
      </section>
    </div>
  )
}

export default DeveloperPortal
