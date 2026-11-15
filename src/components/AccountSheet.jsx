import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'bw-theme'

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

// Account and settings open as a sheet over the page, never a page of their
// own. It holds the two things an account changes for the reader: how the
// site looks (light is the default; dark is a choice made here) and signing
// out. The saved theme is applied before paint by the script in index.html.
function AccountSheet({ email, onClose, onSignOut }) {
  const [theme, setTheme] = useState(currentTheme)
  const sheetRef = useRef(null)

  useEffect(() => {
    const previous = document.activeElement
    sheetRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (previous && typeof previous.focus === 'function') previous.focus()
    }
  }, [onClose])

  const choose = (next) => {
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* storage unavailable */ }
    setTheme(next)
  }

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div
        className="sheet account-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-sheet-title"
        tabIndex={-1}
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="account-sheet-title" className="sheet-title">Account</h2>
        {email && <p className="sheet-line">{email}</p>}

        <div className="sheet-row">
          <span className="sheet-label" id="appearance-label">Appearance</span>
          <div className="sheet-segment" role="group" aria-labelledby="appearance-label">
            {['light', 'dark'].map((value) => (
              <button
                key={value}
                type="button"
                className="btn-toggle theme-choice"
                aria-pressed={theme === value}
                onClick={() => choose(value)}
              >
                {value === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </div>

        <div className="sheet-actions">
          <button type="button" className="btn-outline" onClick={onSignOut}>Sign out</button>
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

export default AccountSheet
