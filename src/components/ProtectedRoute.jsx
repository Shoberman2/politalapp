import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GateLoading, authRedirectFor } from './AccessGate'

// A per-element signed-in check, kept for existing imports. The app no longer
// wraps routes in it: src/components/AccessGate.jsx gates every route listed
// in shared/access.js. Same behavior: a spinner while the session loads, then
// /auth?next=<path, query and hash> when signed out. There is no paid tier.
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <GateLoading />
  if (!user) return <Navigate to={authRedirectFor(location)} replace />
  return children
}

export default ProtectedRoute
