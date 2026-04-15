import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import Navigation from './components/Navigation'
import Landing from './components/Landing'
import Auth from './components/Auth'
import ProtectedRoute from './components/ProtectedRoute'
import MyPolitician from './components/MyPolitician'
import AllPoliticians from './components/AllPoliticians'
import BillsPage from './components/BillsPage'
import BillDetail from './components/BillDetail'
import PoliticianDetail from './components/PoliticianDetail'
import ShutdownBanner from './components/ShutdownBanner'
import ShutdownTracker from './components/ShutdownTracker'
import DistrictMap from './components/DistrictMap'
import BlogPage from './components/BlogPage'
import ArticlePage from './components/ArticlePage'
import AiCongress from './components/AiCongress'
import AiCongressSession from './components/AiCongressSession'
import DeveloperPortal from './components/DeveloperPortal'
import ApiKeyManager from './components/ApiKeyManager'
import UsageDashboard from './components/UsageDashboard'
import ApiDocs from './components/ApiDocs'

function App() {
  const location = useLocation()
  const isLanding = location.pathname === '/'
  const hideChrome = isLanding

  return (
    <div className="app">
      {!hideChrome && <ShutdownBanner />}
      {!hideChrome && <Navigation />}
      <main className="main-content">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />

          {/* Developer portal */}
          <Route path="/developers" element={<DeveloperPortal />} />
          <Route path="/developers/keys" element={<ApiKeyManager />} />
          <Route path="/developers/usage" element={<UsageDashboard />} />
          <Route path="/developers/docs" element={<ApiDocs />} />

          {/* App routes */}
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
          <Route path="/map" element={
            <ProtectedRoute><DistrictMap /></ProtectedRoute>
          } />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:slug" element={<ArticlePage />} />

          {/* AI Congress simulation (public) */}
          <Route path="/ai-congress" element={<AiCongress />} />
          <Route path="/ai-congress/:sessionId" element={<AiCongressSession />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Analytics />
    </div>
  )
}

export default App
