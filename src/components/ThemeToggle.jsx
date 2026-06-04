import { useState, useEffect } from 'react'

const STORAGE_KEY = 'bw-theme'

function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

// Light/dark theme toggle for the broadsheet masthead. The initial theme is
// applied before paint by the inline script in index.html; this component just
// keeps the <html data-theme> attribute and localStorage in sync on click.
function ThemeToggle() {
  const [theme, setTheme] = useState(getCurrentTheme)

  // Sync if the attribute was changed elsewhere (e.g. a second masthead mounts).
  useEffect(() => {
    setTheme(getCurrentTheme())
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch (e) { /* ignore */ }
    setTheme(next)
  }

  return (
    <button className="theme-toggle" onClick={toggle} aria-label="Toggle light or dark theme">
      <svg className="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
      <svg className="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    </button>
  )
}

export default ThemeToggle
