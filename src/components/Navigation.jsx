import { NavLink, useNavigate } from 'react-router-dom'
import '../styles/Navigation.css'

function Navigation() {
  const navigate = useNavigate()

  return (
    <nav className="navigation">
      <div className="nav-container">
        <div className="nav-brand" onClick={() => navigate('/')}>
          <h1 className="brand-name">VoteTrack</h1>
        </div>

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
            to="/shutdown-tracker"
            className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
          >
            Shutdown Tracker
          </NavLink>
        </div>
      </div>
    </nav>
  )
}

export default Navigation
