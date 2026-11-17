import { useState, useEffect, useRef } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import AccountSheet from './AccountSheet'
import { useAuth } from '../context/AuthContext'
import { BRAND } from '../config/brand'
import { DEFAULT_SIGNED_IN_PATH } from '../config/access'
import { CTA_HREF, CTA_LABEL } from '../config/cta'
import '../styles/Navigation.css'

// The main row: three public pages. The personal app (your reps, the Bills
// index and tools) sits behind "Find my reps". No members list, no offices
// page and no "This week" here: This week is public and shown on the landing
// (founder, 2026-11-17).
const NAV_LINKS = [
  { to: '/how-it-works', label: 'How it works' },
  { to: '/government', label: 'The government' },
  { to: '/developers', label: 'For developers' },
]

// "Find my reps" opens the create-account form; "Sign in" opens the sign-in form.
const DEFAULT_CTA = CTA_HREF
const isAuthPath = (pathname) => /^\/auth(?:\/|$)/i.test(pathname)
// The sign-in page itself ('/auth' or '/auth/'), not /auth/callback or /auth/reset.
const isAuthPage = (pathname) => /^\/auth\/?$/i.test(pathname)

// Where the reader was headed, when they are already on /auth.
function authNext(location) {
  return isAuthPage(location.pathname) ? new URLSearchParams(location.search).get('next') : null
}

// Already on /auth: keep its ?next= instead of dropping or replacing it.
// Anywhere else: return to the current page.
function signInHref(location) {
  if (isAuthPath(location.pathname)) {
    const next = authNext(location)
    return next ? `/auth?next=${encodeURIComponent(next)}` : '/auth'
  }
  return `/auth?next=${encodeURIComponent(`${location.pathname}${location.search}${location.hash || ''}`)}`
}

function ctaHref(location) {
  const next = authNext(location)
  return next ? `/auth?mode=signup&next=${encodeURIComponent(next)}` : DEFAULT_CTA
}

function Navigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const { user, signOut } = useAuth()
  const burgerRef = useRef(null)

  // The landing page is marketing: it never shows signed-in state.
  const signedIn = Boolean(user) && location.pathname !== '/'

  useEffect(() => {
    setMenuOpen(false)
    setAccountOpen(false)
  }, [location.pathname])

  // The mobile menu is a full-screen sheet: lock the page behind it and close
  // it on Escape, returning focus to the menu button.
  useEffect(() => {
    if (!menuOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        burgerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('nav-sheet-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('nav-sheet-open')
    }
  }, [menuOpen])

  // Leave the page first: signing out on a gated page would otherwise bounce
  // the reader to /auth while the session clears.
  const handleSignOut = async () => {
    setMenuOpen(false)
    setAccountOpen(false)
    navigate('/')
    // Dark is chosen in the account sheet; signed out there is no control to undo it.
    document.documentElement.removeAttribute('data-theme')
    try { localStorage.removeItem('bw-theme') } catch { /* storage unavailable */ }
    try { await signOut() } catch { /* the session is cleared either way */ }
  }

  const cta = signedIn
    ? { to: DEFAULT_SIGNED_IN_PATH, label: CTA_LABEL }
    : { to: ctaHref(location), label: CTA_LABEL }

  const openAccount = () => {
    setMenuOpen(false)
    setAccountOpen(true)
  }

  const accountLink = (className) => (signedIn ? (
    <button type="button" className={className} onClick={openAccount} aria-haspopup="dialog">Account</button>
  ) : (
    <Link to={user ? DEFAULT_SIGNED_IN_PATH : signInHref(location)} className={className} rel="nofollow">Sign in</Link>
  ))

  return (
    <div className="bw bw-masthead">
      <div className="topbar-wrap">
        <div className="topbar">
          <Link className="brand" to="/" aria-label={`${BRAND.name} home`}>
            <span className="brand-mark"><img src="/capitol-logo.svg" alt="" /></span>
            <span className="brand-name">{BRAND.name}</span>
          </Link>

          <nav id="site-nav" className={`topnav ${menuOpen ? 'open-mobile' : ''}`} aria-label="Main">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {link.label}
              </NavLink>
            ))}
            <div className="topnav-foot">
              {accountLink('topnav-account-mobile')}
              <Link className="btn-primary topnav-cta-mobile" to={cta.to}>{cta.label}</Link>
            </div>
          </nav>

          <div className="topbar-right">
            {accountLink('nav-account')}
            <Link className="btn-primary btn-sm nav-cta" to={cta.to}>{cta.label}</Link>
            <button
              ref={burgerRef}
              className="nav-burger"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="site-nav"
            >
              {menuOpen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 8h16M4 16h16" /></svg>
              )}
            </button>
          </div>
        </div>
      </div>
      {accountOpen && signedIn && (
        <AccountSheet email={user?.email} onClose={() => setAccountOpen(false)} onSignOut={handleSignOut} />
      )}
    </div>
  )
}

export default Navigation
