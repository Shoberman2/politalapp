import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../styles/Navigation.css'

function Navigation() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  return (
    <nav className="navigation">
      <div className="nav-container">
        <div className="nav-brand" onClick={() => navigate('/')}>
          <h1 className="brand-name">VoteTrack</h1>
        </div>

        {isAuthenticated ? (
          <div className="nav-tabs">
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
              to="/profile"
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
            >
              Profile
            </NavLink>
          </div>
        ) : (
          <div className="nav-tabs">
            <button onClick={() => navigate('/login')} className="nav-button">
              Login
            </button>
            <button onClick={() => navigate('/signup')} className="nav-button primary">
              Sign Up
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}

export default Navigation
