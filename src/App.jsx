import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import Navigation from './components/Navigation'
import Landing from './components/Landing'
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

  return (
    <div className="app">
      {!isLanding && <ShutdownBanner />}
      {!isLanding && <Navigation />}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/my-representative" element={<MyPolitician />} />
          <Route path="/all" element={<AllPoliticians />} />
          <Route path="/bills" element={<BillsPage />} />
          <Route path="/bill/:congress/:billType/:number" element={<BillDetail />} />
          <Route path="/politician/:bioguideId" element={<PoliticianDetail />} />
          <Route path="/shutdown-tracker" element={<ShutdownTracker />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Analytics />
    </div>
  )
}

export default App
