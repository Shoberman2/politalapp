import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import '../styles/Navigation.css'

// Per-route announcement copy for the strip above the masthead.
function announceFor(pathname) {
  if (pathname === '/') {
    return 'Open-source congressional records / Built from public Congress.gov, Census & FEC data'
  }
  if (pathname.startsWith('/all')) {
    return 'Open-source congressional records / All 535 members of the 119th Congress'
  }
  if (pathname.startsWith('/bills') || pathname.startsWith('/bill/')) {
    return 'Open-source congressional records / Updated daily from Congress.gov'
  }
  if (pathname.startsWith('/briefings')) {
    return 'BallotWatch Pro / Neutral civic briefings delivered from public sources'
  }
  return 'Open-source congressional data, powered by public sources'
}

const NAV_LINKS = [
  { to: '/my-representative', label: 'My Rep' },
  { to: '/briefings', label: 'Briefings' },
  { to: '/bills', label: 'Bills' },
  { to: '/all', label: 'Members' },
  { to: '/methodology', label: 'Methodology' },
  { to: '/developers', label: 'API' },
]

function Navigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const isLanding = location.pathname === '/'
  const [overHero, setOverHero] = useState(isLanding)

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  // On the landing page the masthead overlays the cinematic film: transparent
  // with light text while a dark shot sits behind the bar, then solid once the
  // page scrolls down to the editorial content. Driven off the film's own
  // geometry so it stays correct across breakpoints and the reduced-motion
  // static hero (no hard-coded viewport thresholds).
  useEffect(() => {
    if (!isLanding) {
      setOverHero(false)
      return
    }
    let raf = 0
    const update = () => {
      raf = 0
      const film = document.querySelector('.film')
      setOverHero(!!film && film.getBoundingClientRect().bottom > 72)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [isLanding])

  const mastheadClass = `bw bw-masthead${isLanding ? ' masthead-landing' : ''}${isLanding && overHero ? ' over-hero' : ''}`

  return (
    <div className={mastheadClass}>
      <div className="announce"><span>{announceFor(location.pathname)}</span></div>
      <div className="topbar-wrap">
        <div className="topbar">
          <button className="brand" onClick={() => navigate('/')} aria-label="BallotWatch home">
            <span className="brand-mark"><img src="/capitol-logo.svg" alt="" /></span>
            <span className="brand-name">BallotWatch</span>
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
          </nav>

          <div className="topbar-right">
            <ThemeToggle />
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/my-representative')}>
              <span className="nav-cta-full">Find My Rep</span>
              <span className="nav-cta-short">My Rep</span>
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
