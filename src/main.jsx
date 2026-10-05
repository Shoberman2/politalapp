import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { AuthProvider } from './context/AuthContext'
import App from './App.jsx'
import './styles/App.css'
import './styles/broadsheet.css'

// The shell (or the server-rendered page) ships its own canonical and social
// tags for crawlers. Once the app runs, react-helmet-async writes the right
// ones per route, so drop the originals rather than leave duplicates (e.g. a
// canonical pointing at "/" on every client-rendered page).
document.head
  .querySelectorAll('link[rel="canonical"]:not([data-rh]), meta[property^="og:"]:not([data-rh]), meta[name^="twitter:"]:not([data-rh]), meta[name="description"]:not([data-rh])')
  .forEach((el) => el.remove())

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>,
)
