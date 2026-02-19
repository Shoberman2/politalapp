import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import Navigation from './components/Navigation'
import Landing from './components/Landing'
import Auth from './components/Auth'
import Pricing from './components/Pricing'
import ProtectedRoute from './components/ProtectedRoute'
import MyPolitician from './components/MyPolitician'
import AllPoliticians from './components/AllPoliticians'
import BillsPage from './components/BillsPage'
import BillDetail from './components/BillDetail'
import PoliticianDetail from './components/PoliticianDetail'
import ShutdownBanner from './components/ShutdownBanner'
import ShutdownTracker from './components/ShutdownTracker'

function App() {
  const location = useLocation()
  const isLanding = location.pathname === '/'
  const isAuthPage = location.pathname === '/auth'
  const isPricingPage = location.pathname === '/pricing'
  const hideChrome = isLanding || isAuthPage || isPricingPage

  return (
    <div className="app">
      {!hideChrome && <ShutdownBanner />}
      {!hideChrome && <Navigation />}
      <main className="main-content">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/pricing" element={<Pricing />} />

          {/* Protected routes */}
          <Route path="/my-representative" element={
            <ProtectedRoute><MyPolitician /></ProtectedRoute>
          } />
          <Route path="/all" element={
            <ProtectedRoute><AllPoliticians /></ProtectedRoute>
          } />
          <Route path="/bills" element={
            <ProtectedRoute><BillsPage /></ProtectedRoute>
          } />
          <Route path="/bill/:congress/:billType/:number" element={
            <ProtectedRoute><BillDetail /></ProtectedRoute>
          } />
          <Route path="/politician/:bioguideId" element={
            <ProtectedRoute><PoliticianDetail /></ProtectedRoute>
          } />
          <Route path="/shutdown-tracker" element={
            <ProtectedRoute><ShutdownTracker /></ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Analytics />
    </div>
  )
}

export default App
