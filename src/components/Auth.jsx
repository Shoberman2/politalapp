import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../styles/Auth.css'

function safeNextPath(value) {
  return value && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/my-representative'
}

function Auth() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const { signIn, signUp, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const nextPath = safeNextPath(new URLSearchParams(location.search).get('next'))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      if (isLogin) {
        const { error } = await signIn(email, password)
        if (error) {
          setError(error.message)
        } else {
          navigate(nextPath)
        }
      } else {
        const { error } = await signUp(email, password)
        if (error) {
          setError(error.message)
        } else {
          navigate(nextPath)
        }
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const { error } = await signInWithGoogle(nextPath)
      if (error) {
        setError(error.message)
        setLoading(false)
      }
    } catch (err) {
      setError('Google sign-in could not be started. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="bw auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-logo">BallotWatch</h1>
          <p className="auth-tagline">Congressional Voting Tracker</p>
        </div>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${isLogin ? 'auth-tab--active' : ''}`}
            onClick={() => { setIsLogin(true); setError(''); setMessage('') }}
          >
            Sign In
          </button>
          <button
            className={`auth-tab ${!isLogin ? 'auth-tab--active' : ''}`}
            onClick={() => { setIsLogin(false); setError(''); setMessage('') }}
          >
            Sign Up
          </button>
        </div>

        <button type="button" className="auth-google" onClick={handleGoogleSignIn} disabled={loading}>
          <span className="auth-google-mark">G</span>
          Continue with Google
        </button>

        <div className="auth-divider"><span>or</span></div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              required
              minLength={6}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-message">{message}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          <button className="auth-back" onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </div>
    </div>
  )
}

export default Auth
