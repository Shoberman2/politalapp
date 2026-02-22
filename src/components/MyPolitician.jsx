import { useState, useEffect, useRef, useCallback } from 'react'
import PoliticianCard from './PoliticianCard'
import {
  getAllRepresentativesForLocation,
  getCongressionalDistrict,
  getDistrictsByState,
  searchAddress
} from '../services/district'
import {
  saveUserAddress,
  getUserAddress,
  clearUserAddress,
  getFavorites
} from '../services/userService'
import '../styles/MyPolitician.css'

function MyPolitician() {
  const savedAddress = getUserAddress()

  const [formData, setFormData] = useState({
    street: savedAddress?.street || '',
    city: savedAddress?.city || '',
    state: savedAddress?.state || '',
    zip: savedAddress?.zip || ''
  })

  const [addressQuery, setAddressQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [addressConfirmed, setAddressConfirmed] = useState(!!savedAddress?.street)
  const [representatives, setRepresentatives] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasSearched, setHasSearched] = useState(!!savedAddress?.state)
  const [favorites, setFavorites] = useState([])
  const debounceRef = useRef(null)
  const suggestionsRef = useRef(null)

  // Load favorites on mount
  useEffect(() => {
    setFavorites(getFavorites())
  }, [])

  // Auto-load representatives if we have saved address
  useEffect(() => {
    if (savedAddress?.street && savedAddress?.state) {
      findRepresentatives()
    }
  }, [])

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Refresh favorites when representatives change (user may have favorited from results)
  const refreshFavorites = () => {
    setFavorites(getFavorites())
  }

  const handleAddressInput = useCallback((e) => {
    const value = e.target.value
    setAddressQuery(value)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.length < 3) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const results = await searchAddress(value)
      setSuggestions(results)
      setShowSuggestions(results.length > 0)
    }, 300)
  }, [])

  const handleSelectSuggestion = (suggestion) => {
    setFormData({
      street: suggestion.street,
      city: suggestion.city,
      state: suggestion.state,
      zip: suggestion.zip
    })
    setAddressQuery(suggestion.display)
    setSuggestions([])
    setShowSuggestions(false)
    setAddressConfirmed(true)
  }

  const handleChangeAddress = () => {
    setAddressQuery('')
    setFormData({ street: '', city: '', state: '', zip: '' })
    setAddressConfirmed(false)
    setSuggestions([])
    setShowSuggestions(false)
  }

  const findRepresentatives = async () => {
    if (!formData.street || !formData.state) {
      setError('Please select an address from the suggestions')
      return
    }

    setLoading(true)
    setError(null)
    setHasSearched(true)

    try {
      console.log(`[MyPolitician] Looking up representatives for: ${formData.street}, ${formData.city}, ${formData.state} ${formData.zip}`)

      // Save address
      saveUserAddress(formData)

      const stateAbbr = formData.state

      // Try Census Geocoder to get the exact congressional district
      const districtInfo = await getCongressionalDistrict(
        formData.street, formData.city, stateAbbr, formData.zip
      )

      if (districtInfo?.district) {
        // Got the district — fetch House rep + Senators from Congress.gov
        console.log(`[MyPolitician] Census Geocoder found district: ${districtInfo.state}-${districtInfo.district}`)
        const reps = await getAllRepresentativesForLocation(districtInfo.state, districtInfo.district)
        setRepresentatives(reps)
      } else {
        // Fallback: Census Geocoder couldn't resolve district, use state-based lookup
        console.log('[MyPolitician] Census Geocoder returned no district, using state-based fallback')

        const atLargeStates = ['AK', 'DE', 'MT', 'ND', 'SD', 'VT', 'WY']

        if (atLargeStates.includes(stateAbbr)) {
          console.log(`[MyPolitician] ${stateAbbr} is at-large, fetching all representatives`)
          const allReps = await getAllRepresentativesForLocation(stateAbbr, '0')
          setRepresentatives(allReps)
        } else {
          const districts = await getDistrictsByState(stateAbbr)

          if (districts.length === 1) {
            const allReps = await getAllRepresentativesForLocation(stateAbbr, districts[0])
            setRepresentatives(allReps)
          } else {
            // Multiple districts — show senators and prompt for district
            const allReps = await getAllRepresentativesForLocation(stateAbbr, null)
            const senators = allReps.filter(r => r.chamber === 'senate')
            setRepresentatives(senators)
            if (senators.length > 0) {
              setError(`Found your senators below. We couldn't determine your House district from your address. Visit house.gov/representatives/find-your-representative to find your district number.`)
            } else {
              setError('Could not find representatives for your address. Please check your address and try again.')
            }
          }
        }
      }
    } catch (err) {
      console.error('[MyPolitician] Error:', err)
      setError('Error finding representatives. Please check your address and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    findRepresentatives()
  }

  const handleReset = () => {
    clearUserAddress()
    setFormData({ street: '', city: '', state: '', zip: '' })
    setAddressQuery('')
    setAddressConfirmed(false)
    setSuggestions([])
    setShowSuggestions(false)
    setRepresentatives([])
    setHasSearched(false)
    setError(null)
  }

  const displayAddress = [formData.street, formData.city, formData.state, formData.zip]
    .filter(Boolean).join(', ')

  return (
    <div className="my-politician">
      <div className="page-header">
        <h1>Find Your Representatives</h1>
        <p>Enter your address to find your House Representative and Senators</p>
      </div>

      <div className="address-card">
        <form onSubmit={handleSubmit} className="address-form">
          {!addressConfirmed ? (
            <div className="autocomplete-wrapper" ref={suggestionsRef}>
              <input
                type="text"
                value={addressQuery}
                onChange={handleAddressInput}
                placeholder="Start typing your address..."
                className="form-input autocomplete-input"
                autoComplete="off"
              />
              {showSuggestions && (
                <ul className="suggestions-dropdown">
                  {suggestions.map((s, i) => (
                    <li
                      key={i}
                      className="suggestion-item"
                      onClick={() => handleSelectSuggestion(s)}
                    >
                      {s.display}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="confirmed-address">
              <span className="confirmed-address-text">{displayAddress}</span>
              <button type="button" className="btn-change" onClick={handleChangeAddress}>
                Change
              </button>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={loading || !addressConfirmed}>
              {loading ? 'Finding...' : 'Find My Representatives'}
            </button>
            {hasSearched && (
              <button type="button" className="btn-secondary" onClick={handleReset}>
                Clear
              </button>
            )}
          </div>
        </form>
      </div>

      {favorites.length > 0 && (
        <div className="favorites-section">
          <h2>Your Favorites</h2>
          <p className="favorites-subtitle">Politicians you're following</p>
          <div className="rep-grid">
            {favorites.map(fav => (
              <PoliticianCard
                key={fav.bioguideId}
                politician={fav}
                showFavorite
                onFavoriteChange={refreshFavorites}
              />
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Finding your representatives...</p>
        </div>
      )}

      {!loading && representatives.length > 0 && (
        <div className="representatives-results">
          <h2>Your Representatives</h2>
          <p className="results-subtitle">
            Representing {formData.street}, {formData.city}, {formData.state} {formData.zip}
          </p>

          {/* House Representative */}
          {representatives.filter(r => r.chamber === 'house').length > 0 && (
            <div className="rep-section">
              <h3>House of Representatives</h3>
              <div className="rep-grid">
                {representatives.filter(r => r.chamber === 'house').map(rep => (
                  <PoliticianCard key={rep.bioguideId} politician={rep} showFavorite onFavoriteChange={refreshFavorites} />
                ))}
              </div>
            </div>
          )}

          {/* Senators */}
          {representatives.filter(r => r.chamber === 'senate').length > 0 && (
            <div className="rep-section">
              <h3>U.S. Senate</h3>
              <div className="rep-grid">
                {representatives.filter(r => r.chamber === 'senate').map(senator => (
                  <PoliticianCard key={senator.bioguideId} politician={senator} showFavorite onFavoriteChange={refreshFavorites} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default MyPolitician
