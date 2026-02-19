import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import '../styles/Pricing.css'

function Pricing() {
  const { user, isSubscribed, signOut } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubscribe = async () => {
    if (!user) {
      navigate('/auth')
      return
    }

    setLoading(true)
    setError('')

    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-checkout', {
        body: { returnUrl: window.location.origin + '/pricing' }
      })

      if (fnError) throw fnError

      if (data?.url) {
        window.location.href = data.url
      } else {
        setError('Could not create checkout session. Please try again.')
      }
    } catch (err) {
      console.error('[Pricing] Checkout error:', err)
      setError('Failed to start checkout. Please try again later.')
    } finally {
      setLoading(false)
    }
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
          <p className="pricing-tagline">Full access to congressional intelligence</p>
        </div>

        <ul className="pricing-features">
          <li>Track your representatives' voting records</li>
          <li>Browse all 535+ members of Congress</li>
          <li>Search and analyze congressional bills</li>
          <li>AI-powered bill explanations</li>
          <li>Campaign finance and FEC data</li>
          <li>Government shutdown risk tracker</li>
        </ul>

        {error && <div className="pricing-error">{error}</div>}

        <button
          className="pricing-subscribe-btn"
          onClick={handleSubscribe}
          disabled={loading}
        >
          {loading ? 'Redirecting to checkout...' : 'Subscribe Now'}
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
