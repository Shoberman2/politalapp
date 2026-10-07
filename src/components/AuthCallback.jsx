import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SEO from './SEO'
import { safeNextPath } from '../utils/safeNextPath'
import { DEFAULT_SIGNED_IN_PATH } from '../config/access'
import '../styles/Auth.css'

// The client uses the PKCE flow, so the only valid callback carries ?code=.
// Tokens in the URL hash are ignored on purpose: a crafted link with someone
// else's tokens must not sign a reader into that account.

// The code verifier lives in the browser that started the flow. Opening the
// confirmation email on another device leaves it missing; the email is still
// confirmed, so the reader only needs to sign in here.
const VERIFIER_RE = /verifier|pkce/i

function hashParams(value) {
  return new URLSearchParams(String(value || '').replace(/^#/, ''))
}

function authError(params) {
  return params.get('error_description') || params.get('error')
}

function AuthCallback() {
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState('')
  const [needsSignIn, setNeedsSignIn] = useState(false)
  const next = safeNextPath(new URLSearchParams(location.search).get('next'), DEFAULT_SIGNED_IN_PATH)
  const signInHref = `/auth?next=${encodeURIComponent(next)}`

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const params = new URLSearchParams(location.search)
      const hash = hashParams(location.hash)
      const code = params.get('code')
      const providerError = authError(params) || authError(hash)

      try {
        // The provider's text is attacker-controllable (anyone can craft the
        // URL), so show fixed copy rather than echoing it.
        if (providerError) throw new Error('Sign-in was cancelled or refused by the provider. Please try again.')

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            if (VERIFIER_RE.test(exchangeError.message || '')) {
              // A used or foreign code: if this device already has a session
              // (a reload, or React StrictMode's second run), just continue.
              const { data: { session: existing } } = await supabase.auth.getSession()
              if (cancelled) return
              if (existing) { navigate(next, { replace: true }); return }
              setNeedsSignIn(true)
              return
            }
            throw exchangeError
          }
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (!session) throw new Error('Google sign-in did not return a session.')
        if (!cancelled) navigate(next, { replace: true })
      } catch (err) {
        if (!cancelled) setError(err.message || 'Google sign-in could not be completed.')
      }
    })()

    return () => { cancelled = true }
  }, [location.search, location.hash, navigate, next])

  return (
    <div className="bw auth-page">
      <SEO
        title="Completing Sign In"
        description="Completing your BallotWatch sign in."
        path="/auth/callback"
        noindex
      />
      <div className="auth-card auth-callback-card">
        <div className="auth-header">
          <h1 className="auth-logo">BallotWatch</h1>
          <p className="auth-tagline">Completing sign in</p>
        </div>
        {needsSignIn ? (
          <>
            <div className="auth-message">Your email is confirmed. Sign in on this device to continue.</div>
            <Link className="auth-submit btn-primary" to={signInHref}>Sign in</Link>
          </>
        ) : error ? (
          <>
            <div className="auth-error">{error}</div>
            <button className="auth-submit btn-primary" onClick={() => navigate(signInHref)}>Back to sign in</button>
          </>
        ) : (
          <div className="auth-message">Checking your Google session...</div>
        )}
      </div>
    </div>
  )
}

export default AuthCallback
