import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
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

// "Find my reps" links here with ?mode=signup; everything else opens sign-in.
function modeFrom(search) {
  return new URLSearchParams(search).get('mode') === 'signup' ? 'signup' : 'signin'
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
const RESET_SENT_MESSAGE = 'If that email has an account, a reset link is on its way.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

// Supabase's own wording is terse or technical; say what to do next instead.
export function friendlyAuthError(error) {
  const text = String(error?.message || '')
  if (/invalid login credentials/i.test(text)) return 'That email and password do not match.'
  if (/email not confirmed/i.test(text)) return 'Confirm your email first. The link is in your inbox.'
  if (/already registered|already been registered/i.test(text)) return 'That email already has an account. Sign in instead.'
  if (/rate limit|too many/i.test(text)) return 'Too many tries. Wait a minute, then try again.'
  if (/failed to fetch|network/i.test(text)) return 'We could not reach the server. Check your connection and try again.'
  return text || GENERIC_ERROR
}

const COPY = {
  signin: { title: 'Welcome Back', line: 'Sign in to see your representatives.', submit: 'Sign in' },
  signup: { title: 'Create Your Account', line: 'Free. Your representatives and every bill in plain English.', submit: 'Create account' },
  forgot: { title: 'Reset Your Password', line: 'Enter your email and we will send a link to set a new one.', submit: 'Send reset link' },
}

function Auth() {
  const location = useLocation()
  const [mode, setMode] = useState(() => modeFrom(location.search))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const { user, loading: authLoading, signIn, signUp, signInWithGoogle, resetPassword } = useAuth()
  const navigate = useNavigate()
  const nextPath = nextFrom(location.search)
  const googleEnabled = useGoogleEnabled()
  const copy = COPY[mode]

  // The nav's "Sign in" and "Find my reps" both link here; follow the link's mode.
  useEffect(() => {
    setMode(modeFrom(location.search))
    setError('')
    setMessage('')
  }, [location.search, location.key])

  const switchMode = (next) => {
    setMode(next)
    setError('')
    setMessage('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      if (mode === 'forgot') {
        const { error } = await resetPassword(email)
        if (error) {
          setError(friendlyAuthError(error))
        } else {
          // Same answer whether or not the address has an account.
          setMode('signin')
          setPassword('')
          setMessage(RESET_SENT_MESSAGE)
        }
      } else if (mode === 'signin') {
        const { error } = await signIn(email, password)
        if (error) {
          setError(friendlyAuthError(error))
        } else {
          navigate(nextPath)
        }
      } else {
        const { data, error } = await signUp(email, password, nextPath)
        if (error) {
          setError(friendlyAuthError(error))
        } else if (data?.session) {
          navigate(nextPath)
        } else {
          // Email confirmation is on: there is no session until the link is
          // clicked, so sending them into the app would bounce them back here.
          setMode('signin')
          setPassword('')
          setMessage(CONFIRM_EMAIL_MESSAGE)
        }
      }
    } catch (err) {
      setError(GENERIC_ERROR)
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
        setError(friendlyAuthError(error))
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
      <SEO title="Sign in" description={`Sign in to ${BRAND.name}.`} path="/auth" noindex />
      <div className="auth-column">
        <div className="auth-header">
          <span className="auth-mark" aria-hidden="true" />
          <h1 className="auth-title">{copy.title}</h1>
          <p className="auth-tagline">{copy.line}</p>
        </div>

        {googleEnabled && mode !== 'forgot' && (
          <>
            <button type="button" className="auth-google" onClick={handleGoogleSignIn} disabled={loading}>
              <span className="auth-google-mark" aria-hidden="true">G</span>
              Continue with Google
            </button>
            <p className="auth-or">or with email</p>
          </>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="field"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {mode !== 'forgot' && (
            <div className="auth-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="field"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={mode === 'signup' ? 'password-hint' : undefined}
                required
                minLength={6}
              />
              {mode === 'signup' && <p id="password-hint" className="auth-hint">At least 6 characters.</p>}
            </div>
          )}

          {error && <div className="auth-error" role="alert">{error}</div>}
          {message && <div className="auth-message" role="status">{message}</div>}

          <button type="submit" className="auth-submit btn-primary" disabled={loading}>
            {loading ? 'One moment' : copy.submit}
          </button>
        </form>

        <div className="auth-links">
          {mode === 'signin' && (
            <>
              <button type="button" className="btn-text" onClick={() => switchMode('forgot')}>Forgot password?</button>
              <p>New here? <button type="button" className="btn-text" onClick={() => switchMode('signup')}>Sign up</button></p>
            </>
          )}
          {mode === 'signup' && (
            <p>Have an account? <button type="button" className="btn-text" onClick={() => switchMode('signin')}>Sign in</button></p>
          )}
          {mode === 'forgot' && (
            <button type="button" className="btn-text" onClick={() => switchMode('signin')}>Back to sign in</button>
          )}
        </div>
      </div>
    </div>
  )
}

export default Auth
