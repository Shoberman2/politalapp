import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../styles/Pricing.css'

function Pricing() {
  const { user, isSubscribed, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSubscribe = () => {
    window.location.href = 'https://buy.stripe.com/5kQ3cwgEsglY8GXccmcjS08'
  }

  if (isSubscribed) {
    return (
      <div className="pricing-page">
        <div className="pricing-card">
          <div className="pricing-header">
            <h1>You're Subscribed</h1>
            <p>You have full access to BallotWatch.</p>
          </div>
          <button className="pricing-btn" onClick={() => navigate('/my-representative')}>
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pricing-page">
      <div className="pricing-card">
        <div className="pricing-header">
          <span className="pricing-label">BallotWatch Pro</span>
          <div className="pricing-amount">
            <span className="pricing-dollar">$</span>
            <span className="pricing-number">2</span>
            <span className="pricing-period">/month</span>
          </div>
          <p className="pricing-tagline">Full access to congressional records and source links</p>
        </div>

        <ul className="pricing-features">
          <li>Track your representatives' voting records</li>
          <li>Browse all 535+ members of Congress</li>
          <li>Search and review congressional bills</li>
          <li>Source-linked bill explanations</li>
          <li>Campaign finance and FEC data</li>
          <li>Government shutdown risk tracker</li>
        </ul>

        <button
          className="pricing-subscribe-btn"
          onClick={handleSubscribe}
        >
          Subscribe Now
        </button>

        <p className="pricing-note">
          Secure payment via Stripe. Cancel anytime.
        </p>

        {user && (
          <div className="pricing-footer">
            <span className="pricing-email">Signed in as {user.email}</span>
            <button className="pricing-signout" onClick={signOut}>Sign out</button>
          </div>
        )}

        {!user && (
          <div className="pricing-footer">
            <button className="pricing-auth-link" onClick={() => navigate('/auth')}>
              Already have an account? Sign in
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Pricing
