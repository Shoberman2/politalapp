import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import { SHOW_BILL_ALERTS } from '../config/features'
import { useAuth } from '../context/AuthContext'
import { BRAND } from '../config/brand'
import '../styles/Navigation.css'

// Public pages only. Everything here works without an account; features that
// need one live behind Sign in, not in the main row.
const NAV_LINKS = [
  { to: '/all', label: 'Members' },
  { to: '/bills', label: 'Bills' },
  { to: '/this-week', label: 'This week' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/offices', label: 'For offices' },
]

function Navigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const { user } = useAuth()
  // Signing in only matters for bill alerts; with alerts off there is nothing
  // in the nav to sign in for (API keys have their own entry on /developers).
  let account = null
  if (SHOW_BILL_ALERTS) {
    account = user
      ? { to: '/alerts', label: 'My alerts' }
      : { to: location.pathname.startsWith('/auth') ? '/auth' : `/auth?next=${encodeURIComponent(location.pathname)}`, label: 'Sign in' }
  }

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <div className="bw bw-masthead">
      <div className="topbar-wrap">
        <div className="topbar">
          <button className="brand" onClick={() => navigate('/')} aria-label={`${BRAND.name} home`}>
            <span className="brand-mark"><img src="/capitol-logo.svg" alt="" /></span>
            <span className="brand-name">{BRAND.name}</span>
          </button>

          <nav className={`topnav ${menuOpen ? 'open-mobile' : ''}`}>
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {link.label}
              </NavLink>
            ))}
            {account && (
              <NavLink to={account.to} className="topnav-account-mobile">{account.label}</NavLink>
            )}
          </nav>

          <div className="topbar-right">
            <ThemeToggle />
            {account && <NavLink to={account.to} className="nav-account">{account.label}</NavLink>}
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/my-representative')}>
              <span className="nav-cta-full">Find my reps</span>
              <span className="nav-cta-short">My reps</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
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
