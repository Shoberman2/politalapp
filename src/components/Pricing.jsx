import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { startConsumerCheckout } from '../services/civicBriefing'
import '../styles/Pricing.css'

function Pricing() {
  const { user, session, isSubscribed, signOut } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubscribe = async () => {
    setError('')
    if (!user || !session) {
      navigate('/auth?next=/briefings')
      return
    }

    setLoading(true)
    try {
      const data = await startConsumerCheckout(session, `${window.location.origin}/briefings`)
      window.location.href = data.url
    } catch (err) {
      console.warn('[Pricing] Checkout API failed, using hosted link:', err)
      window.location.href = 'https://buy.stripe.com/5kQ3cwgEsglY8GXccmcjS08'
    } finally {
      setLoading(false)
    }
  }

  if (isSubscribed) {
    return (
      <div className="bw pricing-page">
        <div className="pricing-card">
          <div className="pricing-header">
            <h1>You're Subscribed</h1>
            <p>You have full access to BallotWatch Pro, including Civic Briefings.</p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/briefings')}>
            Open Civic Briefings
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bw pricing-page">
      <div className="pricing-card">
        <div className="pricing-header">
          <span className="pricing-label">BallotWatch Pro</span>
          <div className="pricing-amount">
            <span className="pricing-dollar">$</span>
            <span className="pricing-number">2</span>
            <span className="pricing-period">/month</span>
          </div>
          <p className="pricing-tagline">Civic records, source links, and email briefings for people who want to keep up without the noise.</p>
        </div>

        <ul className="pricing-features">
          <li>Civic Briefing Agent for districts or candidates</li>
          <li>Gmail delivery for modern source-linked updates</li>
          <li>Track your representatives' voting records</li>
          <li>Browse all 535+ members of Congress</li>
          <li>Search and review congressional bills</li>
          <li>Source-linked bill explanations</li>
        </ul>

        <button
          className="btn btn-primary pricing-subscribe-btn"
          onClick={handleSubscribe}
          disabled={loading}
        >
          {loading ? 'Opening checkout...' : 'Subscribe Now'}
        </button>

        {error && <div className="pricing-error">{error}</div>}

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
            <button className="pricing-auth-link" onClick={() => navigate('/auth?next=/briefings')}>
              Already have an account? Sign in
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Pricing
