import ProtectedRoute from './ProtectedRoute'

// Kept for existing imports. The app-wide gate is AccessGate; this is an alias
// for ProtectedRoute.
export default function RequireAuth({ children }) {
  return <ProtectedRoute>{children}</ProtectedRoute>
}
