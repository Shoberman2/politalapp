import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Navigation from './components/Navigation'
import Landing from './components/Landing'
import SignUp from './components/SignUp'
import Login from './components/Login'
import MyPolitician from './components/MyPolitician'
import AllPoliticians from './components/AllPoliticians'
import Profile from './components/Profile'
import BillsPage from './components/BillsPage'
import BillDetail from './components/BillDetail'
import PoliticianDetail from './components/PoliticianDetail'
import { Analytics } from '@vercel/analytics/react'

function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div className="loading-spinner"></div>
      </div>
    )
  }

  return isAuthenticated ? children : <Navigate to="/login" />
}

function App() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="app">
      <Navigation />
      <main className="main-content">
        <Routes>
          <Route path="/" element={isAuthenticated ? <Navigate to="/my-representative" /> : <Landing />} />
          <Route path="/signup" element={!isAuthenticated ? <SignUp /> : <Navigate to="/my-representative" />} />
          <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/my-representative" />} />
          <Route
            path="/my-representative"
            element={
              <PrivateRoute>
                <MyPolitician />
              </PrivateRoute>
            }
          />
          <Route
            path="/all"
            element={
              <PrivateRoute>
                <AllPoliticians />
              </PrivateRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <PrivateRoute>
                <Profile />
              </PrivateRoute>
            }
          />
          <Route
            path="/bills"
            element={
              <PrivateRoute>
                <BillsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/bill/:congress/:billType/:number"
            element={
              <PrivateRoute>
                <BillDetail />
              </PrivateRoute>
            }
          />
          <Route
            path="/politician/:bioguideId"
            element={
              <PrivateRoute>
                <PoliticianDetail />
              </PrivateRoute>
            }
          />
        </Routes>
      </main>
      <Analytics />
    </div>
  )
}

export default App
