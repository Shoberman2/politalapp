import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isGatedPath } from '../config/access'

// The account gate for the whole app. It wraps <Routes> once in src/App.jsx
// and checks the current path against the list in shared/access.js (imported
// through src/config/access.js): a gated path shows a skeleton while the
// session resolves, then sends a signed-out reader to /auth with the full
// path (query and hash included) in ?next=. Every other path renders as is.

export function GateLoading() {
  return (
    <div className="gate-loading" role="status" aria-label="Checking your sign-in">
      <span className="skeleton gate-loading-title" />
      <span className="skeleton gate-loading-line" />
      <span className="skeleton gate-loading-line short" />
    </div>
  )
}

export function authRedirectFor(location) {
  const next = `${location.pathname}${location.search || ''}${location.hash || ''}`
  return `/auth?next=${encodeURIComponent(next)}`
}

export default function AccessGate({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (!isGatedPath(location.pathname)) return children
  if (loading) return <GateLoading />
  if (!user) return <Navigate to={authRedirectFor(location)} replace />
  return children
}
