import { NavLink, useNavigate } from 'react-router-dom'
// import { useAuth } from '../context/AuthContext'
import '../styles/Navigation.css'

function Navigation() {
  const navigate = useNavigate()
  // const { user, signOut } = useAuth()

  // const handleSignOut = async () => {
  //   await signOut()
  //   navigate('/')
  // }

  return (
    <>
      <div className="announcement-bar">
        <span>Congressional voting data &mdash; powered by Congress.gov</span>
      </div>
      <nav className="navigation">
        <div className="nav-container">
          <div className="nav-brand" onClick={() => navigate('/')}>
            <img src="/capitol-logo.png" alt="" className="brand-logo" />
            <h1 className="brand-name">BallotWatch</h1>
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
