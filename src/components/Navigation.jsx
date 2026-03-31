import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
// import { useAuth } from '../context/AuthContext'
import '../styles/Navigation.css'

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
        <span>Congressional voting data &mdash; powered by Congress.gov</span>
      </div>
      <nav className="navigation">
        <div className="nav-container">
          <div className="nav-brand" onClick={() => navigate('/')}>
            <img src="/capitol-logo.svg" alt="" className="brand-logo" />
            <h1 className="brand-name">BallotWatch</h1>
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
              My Representative
            </NavLink>
            <NavLink
              to="/all"
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
            >
              All Politicians
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
            <NavLink
              to="/shutdown-tracker"
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
            >
              Shutdown Tracker
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
