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
import DonationComparison from './components/DonationComparison'
import DeveloperPortal from './components/DeveloperPortal'
import ApiKeyManager from './components/ApiKeyManager'
import UsageDashboard from './components/UsageDashboard'
import ApiDocs from './components/ApiDocs'
import CommitteePage from './components/CommitteePage'
import ChamberPage from './components/ChamberPage'
import ChamberMethodology from './components/ChamberMethodology'
import OpenSourcePage from './components/OpenSourcePage'
import MethodologyPage from './components/MethodologyPage'

// Feature flag gates the /committee/:code route registration.
// When false, requests fall through to the catch-all redirect to "/" — no
// broken link surface for users on the unflagged build.
const SHOW_ROUTING_PANEL = import.meta.env.VITE_BILLS_SHOW_ROUTING_PANEL === 'true'

// Feature flag for the historical chamber feature. Off in production until
// P3 ships per /plan-eng-review D1. Turn on with VITE_SHOW_CHAMBER=true.
const SHOW_CHAMBER = import.meta.env.VITE_SHOW_CHAMBER === 'true'

function App() {
  const location = useLocation()
  const isLanding = location.pathname === '/'

  return (
    <div className="app">
      {/* The shutdown banner stays off the landing's clean masthead; the
          broadsheet masthead itself now renders on every page. */}
      {!isLanding && <ShutdownBanner />}
      <Navigation />
      <main className="main-content">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/open" element={<OpenSourcePage />} />
          <Route path="/methodology" element={<MethodologyPage />} />
          <Route path="/methodology/:slug" element={<MethodologyPage />} />

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
          {SHOW_ROUTING_PANEL && (
            <Route path="/committee/:code" element={
              <ProtectedRoute><CommitteePage /></ProtectedRoute>
            } />
          )}

          {/* Historical chamber — feature flagged until P3 launch */}
          {SHOW_CHAMBER && (
            <>
              <Route path="/chamber" element={<ChamberPage />} />
              <Route path="/chamber/methodology" element={<ChamberMethodology />} />
              <Route path="/chamber/moment/:momentSlug" element={<ChamberPage />} />
              <Route path="/chamber/:congress" element={<ChamberPage />} />
              <Route path="/chamber/:congress/house" element={<ChamberPage />} />
              <Route path="/chamber/:congress/desk/:deskId" element={<ChamberPage />} />
            </>
          )}
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

          {/* Campaign finance comparison (public) */}
          <Route path="/compare" element={<DonationComparison />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Analytics />
    </div>
  )
}

export default App
