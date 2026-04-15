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
      'AI-generated bill summaries included',
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
        title="BallotWatch API — Congressional Data for Developers"
        description="REST API for congressional voting records, bills, member profiles, and political statistics. Built for journalists, advocacy orgs, and political analysts."
        path="/developers"
      />

      <section className="dev-hero">
        <span className="dev-label">BallotWatch API</span>
        <h1>Congressional intelligence, delivered as JSON</h1>
        <p className="dev-hero-subtitle">
          535 members. 10,000+ bills. Every roll call vote. Pre-computed stats.
          One API, updated daily from Congress.gov.
        </p>
        <div className="dev-hero-actions">
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
            <p>All 535 members of Congress. Filter by state, chamber, party. Includes photos, contact info, and district.</p>
          </div>
          <div className="dev-endpoint-card">
            <code>GET /api/v1/bills</code>
            <p>10,000+ bills with CRS summaries, AI explanations, policy areas, and full status tracking.</p>
          </div>
          <div className="dev-endpoint-card">
            <code>GET /api/v1/members/:id/votes</code>
            <p>Complete voting history for any member. Joined with bill metadata for context.</p>
          </div>
          <div className="dev-endpoint-card">
            <code>GET /api/v1/stats</code>
            <p>Party loyalty rankings, attendance stats, bills by policy area. Pre-computed, fast.</p>
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

      <section className="dev-pricing" id="pricing">
        <h2>Simple, transparent pricing</h2>
        <p className="dev-pricing-subtitle">No hidden fees. Cancel anytime. All plans include every endpoint.</p>
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
        <h2>Ready to build?</h2>
        <p>Sign up, grab your API key, and make your first request in under 2 minutes.</p>
        <button className="btn-primary" onClick={() => user ? navigate('/developers/keys') : navigate('/auth')}>
          {user ? 'Go to API Keys' : 'Create Account'}
        </button>
      </section>
    </div>
  )
}

export default DeveloperPortal
