import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
// import { useAuth } from '../context/AuthContext'
import '../styles/Navigation.css'

// Match the feature flag in App.jsx so the nav slot only appears when the
// chamber routes are registered.
const SHOW_CHAMBER = import.meta.env.VITE_SHOW_CHAMBER === 'true'

function Navigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  // const { user, signOut } = useAuth()

  // const handleSignOut = async () => {
  //   await signOut()
  //   navigate('/')
  // }

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <>
      <div className="announcement-bar">
        <span>Open-source congressional accountability data, powered by public sources</span>
      </div>
      <nav className="navigation">
        <div className="nav-container">
          <div className="nav-brand" onClick={() => navigate('/')}>
            <img src="/capitol-logo.svg" alt="" className="brand-logo" />
            <span className="brand-name">BallotWatch</span>
          </div>

          <button
            className={`nav-hamburger ${menuOpen ? 'open' : ''}`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle navigation menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>

          <div className={`nav-tabs ${menuOpen ? 'nav-tabs-open' : ''}`}>
            <NavLink
              to="/my-representative"
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
            >
              My Rep
            </NavLink>
            <NavLink
              to="/all"
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
            >
              Members
            </NavLink>
            <NavLink
              to="/bills"
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
            >
              Bills
            </NavLink>
            <NavLink
              to="/map"
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
            >
              District Map
            </NavLink>
            {SHOW_CHAMBER && (
              <NavLink
                to="/chamber"
                className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
              >
                Chamber
              </NavLink>
            )}
            <NavLink
              to="/shutdown-tracker"
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
            >
              Shutdown
            </NavLink>
            <NavLink
              to="/open"
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
            >
              Open Source
            </NavLink>
            <NavLink
              to="/developers"
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
            >
              API
            </NavLink>
            <NavLink
              to="/blog"
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
            >
              Blog
            </NavLink>
          </div>

          <div className="nav-spacer"></div>
        </div>
      </nav>
    </>
  )
}

export default Navigation
