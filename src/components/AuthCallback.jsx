import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SEO from './SEO'
import { safeNextPath } from '../utils/safeNextPath'
import { DEFAULT_SIGNED_IN_PATH } from '../config/access'
import { markRecovery } from '../utils/recovery'
import '../styles/Auth.css'

// The client uses the PKCE flow, so the only valid callback carries ?code=.
// Tokens in the URL hash are ignored on purpose: a crafted link with someone
// else's tokens must not sign a reader into that account.

// The code verifier lives in the browser that started the flow. Opening the
// confirmation email on another device leaves it missing; the email is still
// confirmed, so the reader only needs to sign in here.
const VERIFIER_RE = /verifier|pkce/i

const isResetPath = (path) => /^\/auth\/reset(?:[/?#]|$)/i.test(path)

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
  const signInHref = /^\/auth(?:[/?#]|$)/i.test(next) ? '/auth' : `/auth?next=${encodeURIComponent(next)}`

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
              // Never for a password reset: the session here may belong to
              // someone else, and the reset page would change their password.
              if (existing && !isResetPath(next)) { navigate(next, { replace: true }); return }
              setNeedsSignIn(true)
              return
            }
            throw exchangeError
          }
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (!session) throw new Error('Sign-in did not finish. Please try again.')
        if (cancelled) return
        // Only a reset link that signed the reader in here opens the password form.
        if (code && isResetPath(next)) markRecovery()
        navigate(next, { replace: true })
      } catch (err) {
        if (!cancelled) setError(err.message || 'Sign-in could not be completed.')
      }
    })()

    return () => { cancelled = true }
  }, [location.search, location.hash, navigate, next])

  const isReset = isResetPath(next)

  return (
    <div className="bw auth-page">
      <SEO
        title="Completing Sign In"
        description="Completing your BallotWatch sign in."
        path="/auth/callback"
        noindex
      />
      <div className="auth-column">
        <div className="auth-header">
          <span className="auth-mark" aria-hidden="true" />
          <h1 className="auth-title">{needsSignIn || error ? 'Almost There' : 'Signing You In'}</h1>
        </div>
        {needsSignIn ? (
          <>
            <div className="auth-message">
              {isReset
                ? 'Open the reset link in the browser where you asked for it, or ask for a new link.'
                : 'Your email is confirmed. Sign in on this device to continue.'}
            </div>
            <Link className="auth-submit btn-primary" to={isReset ? '/auth' : signInHref}>{isReset ? 'Back to sign in' : 'Sign in'}</Link>
          </>
        ) : error ? (
          <>
            <div className="auth-error" role="alert">{error}</div>
            <button className="auth-submit btn-primary" onClick={() => navigate(signInHref)}>Back to sign in</button>
          </>
        ) : (
          <div className="auth-message" role="status">Checking your session.</div>
        )}
      </div>
    </div>
  )
}

export default AuthCallback
