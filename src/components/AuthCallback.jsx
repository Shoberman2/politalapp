import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SEO from './SEO'
import '../styles/Auth.css'

function safeNextPath(value) {
  return value && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/my-representative'
}

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

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const params = new URLSearchParams(location.search)
      const hash = hashParams(location.hash)
      const next = safeNextPath(params.get('next'))
      const code = params.get('code')
      const providerError = authError(params) || authError(hash)

      try {
        if (providerError) throw new Error(providerError)

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) throw exchangeError
        } else if (hash.get('access_token') && hash.get('refresh_token')) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: hash.get('access_token'),
            refresh_token: hash.get('refresh_token'),
          })
          if (setSessionError) throw setSessionError
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
  }, [location.search, navigate])

  return (
    <div className="bw auth-page">
      <SEO
        title="Completing Sign In"
        description="Completing your BallotWatch sign in."
        path="/auth/callback"
      />
      <div className="auth-card auth-callback-card">
        <div className="auth-header">
          <h1 className="auth-logo">BallotWatch</h1>
          <p className="auth-tagline">Completing sign in</p>
        </div>
        {error ? (
          <>
            <div className="auth-error">{error}</div>
            <button className="auth-submit" onClick={() => navigate('/auth')}>Back to sign in</button>
          </>
        ) : (
          <div className="auth-message">Checking your Google session...</div>
        )}
      </div>
    </div>
  )
}

export default AuthCallback
