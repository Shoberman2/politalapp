import { useState, useEffect } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import { useAuth } from '../context/AuthContext'
import { BRAND } from '../config/brand'
import { DEFAULT_SIGNED_IN_PATH } from '../config/access'
import '../styles/Navigation.css'

// Public pages only. Everything in the main row works without an account; the
// personal app (your reps, the Bills index and tools) sits behind "Find my reps".
const NAV_LINKS = [
  { to: '/how-it-works', label: 'How it works' },
  { to: '/this-week', label: 'This week' },
  { to: '/all', label: 'Members' },
  { to: '/offices', label: 'For offices' },
]

const DEFAULT_CTA = `/auth?next=${encodeURIComponent(DEFAULT_SIGNED_IN_PATH)}`
const isAuthPath = (pathname) => /^\/auth(?:\/|$)/i.test(pathname)
// The sign-in page itself ('/auth' or '/auth/'), not /auth/callback.
const isAuthPage = (pathname) => /^\/auth\/?$/i.test(pathname)

// Already on /auth: keep its ?next= (where the reader was headed) instead of
// dropping it or replacing it. Anywhere else: return to the current page.
function signInHref(location) {
  if (isAuthPath(location.pathname)) {
    return isAuthPage(location.pathname) && location.search ? `/auth${location.search}` : '/auth'
  }
  return `/auth?next=${encodeURIComponent(`${location.pathname}${location.search}${location.hash || ''}`)}`
}

function ctaHref(location) {
  return isAuthPage(location.pathname) && new URLSearchParams(location.search).get('next') ? `/auth${location.search}` : DEFAULT_CTA
}

function Navigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, signOut } = useAuth()

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  // Leave the page first: signing out on a gated page would otherwise bounce
  // the reader to /auth while the session clears.
  const handleSignOut = async () => {
    setMenuOpen(false)
    navigate('/')
    try { await signOut() } catch { /* the session is cleared either way */ }
  }

  const cta = user
    ? { to: '/my-representative', label: 'My reps' }
    : { to: ctaHref(location), label: 'Find my reps' }

  const accountLink = (className) => (user ? (
    <button type="button" className={className} onClick={handleSignOut}>Sign out</button>
  ) : (
    <Link to={signInHref(location)} className={className} rel="nofollow">Sign in</Link>
  ))

  return (
    <div className="bw bw-masthead">
      <div className="topbar-wrap">
        <div className="topbar">
          <Link className="brand" to="/" aria-label={`${BRAND.name} home`}>
            <span className="brand-mark"><img src="/capitol-logo.svg" alt="" /></span>
            <span className="brand-name">{BRAND.name}</span>
          </Link>

          <nav className={`topnav ${menuOpen ? 'open-mobile' : ''}`} aria-label="Main">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {link.label}
              </NavLink>
            ))}
            {accountLink('topnav-account-mobile')}
          </nav>

          <div className="topbar-right">
            {user && <ThemeToggle />}
            {accountLink('nav-account')}
            <Link className="btn-primary btn-sm nav-cta" to={cta.to}>{cta.label}</Link>
            <button
              className="nav-burger"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Navigation
