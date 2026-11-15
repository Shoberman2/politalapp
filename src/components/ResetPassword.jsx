import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DEFAULT_SIGNED_IN_PATH } from '../config/access'
import { friendlyAuthError } from './Auth'
import SEO from './SEO'
import { hasRecovery, clearRecovery } from '../utils/recovery'
import '../styles/Auth.css'

// Where the emailed reset link lands (through /auth/callback, which signs the
// reader in from the link's code). With a session, set a new password; without
// one the link was already used or has expired.
function ResetPassword() {
  const { user, loading: authLoading, updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const { error } = await updatePassword(password)
      if (error) {
        setError(friendlyAuthError(error))
      } else {
        clearRecovery()
        navigate(DEFAULT_SIGNED_IN_PATH, { replace: true })
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // A session alone is not enough: it must have come from a reset link in this tab.
  const expired = !authLoading && (!user || !hasRecovery())

  return (
    <div className="bw auth-page">
      <SEO title="Set a new password" description="Set a new BallotWatch password." path="/auth/reset" noindex />
      <div className="auth-column">
        <div className="auth-header">
          <span className="auth-mark" aria-hidden="true" />
          <h1 className="auth-title">{expired ? 'This Link Has Expired' : 'Set A New Password'}</h1>
          <p className="auth-tagline">
            {expired ? 'Reset links work once, for a short time. Ask for a new one.' : 'Choose a password of at least 6 characters.'}
          </p>
        </div>

        {expired ? (
          <Link className="auth-submit btn-primary" to="/auth">Back to sign in</Link>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                className="field"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button type="submit" className="auth-submit btn-primary" disabled={saving || authLoading}>
              {saving ? 'One moment' : 'Save password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default ResetPassword
