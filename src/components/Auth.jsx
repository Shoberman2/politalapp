import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { BRAND } from '../config/brand'
import { safeNextPath } from '../utils/safeNextPath'
import { DEFAULT_SIGNED_IN_PATH } from '../config/access'
import SEO from './SEO'
import '../styles/Auth.css'

const DEFAULT_NEXT = DEFAULT_SIGNED_IN_PATH

// ?next= pointing back at /auth (or /auth/callback) would loop; use the default.
function nextFrom(search) {
  const next = safeNextPath(new URLSearchParams(search).get('next'), DEFAULT_NEXT)
  return /^\/auth(?:[/?#]|$)/i.test(next) ? DEFAULT_NEXT : next
}

// The Google provider can be switched off in Supabase. Ask the project's public
// settings endpoint and show the button only when Google is actually enabled,
// so nobody clicks into a provider error.
function useGoogleEnabled() {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!url || !key || typeof fetch !== 'function') return undefined
    let cancelled = false
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => { if (!cancelled && json?.external?.google === true) setEnabled(true) })
      .catch(() => { /* keep the button hidden */ })
    return () => { cancelled = true }
  }, [])
  return enabled
}

const CONFIRM_EMAIL_MESSAGE = 'Check your email to confirm your account, then sign in.'

function Auth() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const { user, loading: authLoading, signIn, signUp, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const nextPath = nextFrom(location.search)
  const googleEnabled = useGoogleEnabled()

  const switchMode = () => {
    setIsLogin((v) => !v)
    setError('')
    setMessage('')
  }

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
        const { data, error } = await signUp(email, password, nextPath)
        if (error) {
          setError(error.message)
        } else if (data?.session) {
          navigate(nextPath)
        } else {
          // Email confirmation is on: there is no session until the link is
          // clicked, so sending them into the app would bounce them back here.
          setIsLogin(true)
          setPassword('')
          setMessage(CONFIRM_EMAIL_MESSAGE)
        }
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
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

  // Already signed in: go straight to where they were headed.
  if (!authLoading && user) return <Navigate to={nextPath} replace />

  return (
    <div className="bw auth-page">
      <SEO title="Sign in" description="Sign in to BallotWatch." path="/auth" noindex />
      <div className="auth-card">
        <div className="auth-header">
          <p className="auth-wordmark">{BRAND.name}</p>
          <h1 className="auth-title">{isLogin ? 'Sign in' : 'Create your account'}</h1>
          <p className="auth-tagline">Free. With an account you can keep your representatives on one page and browse bills in plain English.</p>
        </div>

        {googleEnabled && (
          <>
            <button type="button" className="auth-google" onClick={handleGoogleSignIn} disabled={loading}>
              <span className="auth-google-mark" aria-hidden="true">G</span>
              Continue with Google
            </button>
            <div className="auth-divider"><span>or</span></div>
          </>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
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
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isLogin ? 'Your password' : 'At least 6 characters'}
              required
              minLength={6}
            />
          </div>

          {error && <div className="auth-error" role="alert">{error}</div>}
          {message && <div className="auth-message" role="status">{message}</div>}

          <button type="submit" className="auth-submit btn-primary" disabled={loading}>
            {loading ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          {isLogin ? 'New here?' : 'Already have an account?'}{' '}
          <button type="button" className="btn-text" onClick={switchMode}>
            {isLogin ? 'Create an account' : 'Sign in'}
          </button>
        </p>

        <div className="auth-footer">
          <Link className="btn-text" to="/">Back to home</Link>
        </div>
      </div>
    </div>
  )
}

export default Auth
