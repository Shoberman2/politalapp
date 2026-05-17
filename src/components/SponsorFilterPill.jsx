import { useState, useEffect, useRef, useCallback } from 'react'
import { searchPoliticians } from '../services/billsDb'
import '../styles/SponsorFilterPill.css'

/**
 * Inline dropdown filter pill for selecting a sponsor (or cosponsor).
 *
 * Per design-review D2:
 *   - Pill clicked → 320px dropdown opens below the pill
 *   - Typeahead filters politicians (150ms debounce)
 *   - ↑↓ navigate rows, Enter selects, Esc dismisses
 *   - Click outside dismisses
 *   - Empty: "No politicians match '{q}'." italic row
 *   - Active filter: pill turns pale blue + ✕ to clear
 *
 * Used by BillsPage for both sponsor and cosponsor filtering.
 */

function partyClass(party) {
  if (!party) return 'party-tag-ind'
  const p = String(party).toLowerCase()
  if (p.startsWith('d')) return 'party-tag-dem'
  if (p.startsWith('r')) return 'party-tag-rep'
  return 'party-tag-ind'
}

function partyAbbrev(party) {
  if (!party) return 'I'
  const p = String(party).toLowerCase()
  if (p.startsWith('d')) return 'D'
  if (p.startsWith('r')) return 'R'
  return 'I'
}

export default function SponsorFilterPill({
  label,                  // "Sponsored by" or "Cosponsored by"
  selected,               // { bioguideId, name, party, state } | null
  onChange,               // (politician|null) => void
  ariaLabel,              // for the dropdown listbox
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // Focus input on open
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  // Debounced search (150ms — faster than bills-search 300ms; politicians is N=540)
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setLoading(true)
    setError(null)
    debounceRef.current = setTimeout(async () => {
      try {
        const matches = await searchPoliticians(query, 50)
        setResults(matches)
        setFocusedIndex(-1)
      } catch (err) {
        console.error('[SponsorFilterPill] search failed:', err)
        setError('Search failed, try again.')
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 150)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open])

  const handlePick = useCallback(
    (politician) => {
      onChange(politician)
      setOpen(false)
      setQuery('')
      setResults([])
      setFocusedIndex(-1)
    },
    [onChange]
  )

  const handleClear = useCallback(
    (e) => {
      e.stopPropagation()
      onChange(null)
    },
    [onChange]
  )

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex((i) => Math.min(i + 1, results.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < results.length) {
          handlePick(results[focusedIndex])
        } else if (results.length > 0) {
          handlePick(results[0])
        }
      }
    },
    [results, focusedIndex, handlePick]
  )

  const isActive = !!selected

  return (
    <div className="sponsor-pill-container" ref={containerRef}>
      <button
        type="button"
        className={`bills-filter-pill sponsor-pill ${isActive ? 'sponsor-pill-active' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={isActive ? `${label}: ${selected.name}. Press to change.` : label}
        onClick={() => setOpen((o) => !o)}
      >
        {isActive ? (
          <>
            <span className="sponsor-pill-label">{label}:</span>{' '}
            <span className="sponsor-pill-name">{selected.name}</span>
            <span
              className="sponsor-pill-clear"
              role="button"
              aria-label={`Clear ${label.toLowerCase()} filter`}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  onChange(null)
                }
              }}
              tabIndex={0}
            >
              ×
            </span>
          </>
        ) : (
          <span className="sponsor-pill-placeholder">{label}</span>
        )}
      </button>

      {open && (
        <div className="sponsor-pill-dropdown" role="presentation">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a name…"
            className="sponsor-pill-input"
            aria-label={`Search politicians to filter ${label.toLowerCase()}`}
          />

          <ul
            className="sponsor-pill-listbox"
            role="listbox"
            aria-label={ariaLabel || label}
          >
            {loading && (
              <li className="sponsor-pill-row sponsor-pill-loading" role="option" aria-selected={false}>
                <span className="loading-spinner-small" aria-hidden="true"></span>
                <span className="sponsor-pill-loading-text">Searching…</span>
              </li>
            )}
            {!loading && error && (
              <li className="sponsor-pill-row sponsor-pill-error" role="option" aria-selected={false}>
                {error}
              </li>
            )}
            {!loading && !error && results.length === 0 && (
              <li className="sponsor-pill-row sponsor-pill-empty" role="option" aria-selected={false}>
                {query ? `No politicians match "${query}".` : 'Type to search…'}
              </li>
            )}
            {!loading &&
              !error &&
              results.map((p, idx) => (
                <li
                  key={p.bioguideId}
                  role="option"
                  aria-selected={focusedIndex === idx}
                  className={`sponsor-pill-row ${focusedIndex === idx ? 'sponsor-pill-row-focused' : ''}`}
                  onMouseEnter={() => setFocusedIndex(idx)}
                  onClick={() => handlePick(p)}
                >
                  <span className="sponsor-pill-row-name">{p.name}</span>
                  {p.party && (
                    <span className={`sponsor-pill-row-party ${partyClass(p.party)}`}>
                      {partyAbbrev(p.party)}
                    </span>
                  )}
                  {p.state && <span className="sponsor-pill-row-state">{p.state}</span>}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}
