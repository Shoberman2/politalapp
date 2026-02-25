import { useState, useEffect } from 'react'
import PoliticianCard from './PoliticianCard'
import {
  getAllRepresentativesForLocation,
  getCongressionalDistrict,
  getDistrictsByState,
  getDistrictFromAddress
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

  const [address, setAddress] = useState(
    savedAddress?.street
      ? [savedAddress.street, savedAddress.city, savedAddress.state, savedAddress.zip].filter(Boolean).join(', ')
      : ''
  )
  const [formData, setFormData] = useState({
    street: savedAddress?.street || '',
    city: savedAddress?.city || '',
    state: savedAddress?.state || '',
    zip: savedAddress?.zip || ''
  })
  const [representatives, setRepresentatives] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasSearched, setHasSearched] = useState(!!savedAddress?.state)
  const [favorites, setFavorites] = useState([])

  // Load favorites on mount
  useEffect(() => {
    setFavorites(getFavorites())
  }, [])

  // Auto-load representatives if we have saved address
  useEffect(() => {
    if (savedAddress?.street && savedAddress?.state) {
      findRepresentatives(savedAddress)
    }
  }, [])

  const refreshFavorites = () => {
    setFavorites(getFavorites())
  }

  // Parse a full address string into components
  const parseAddress = (fullAddress) => {
    // Expected format: "123 Main St, City, ST 12345" or similar
    const parts = fullAddress.split(',').map(p => p.trim())

    if (parts.length >= 3) {
      const street = parts[0]
      const city = parts[1]
      // Last part might be "ST 12345" or "State 12345"
      const lastPart = parts[parts.length - 1]
      const stateZipMatch = lastPart.match(/^([A-Za-z]{2})\s*(\d{5})?/)
      const state = stateZipMatch ? stateZipMatch[1].toUpperCase() : ''
      const zip = stateZipMatch ? (stateZipMatch[2] || '') : ''
      return { street, city, state, zip }
    } else if (parts.length === 2) {
      const street = parts[0]
      const lastPart = parts[1]
      const stateZipMatch = lastPart.match(/^(.+?)\s+([A-Za-z]{2})\s*(\d{5})?$/)
      if (stateZipMatch) {
        return { street, city: stateZipMatch[1], state: stateZipMatch[2].toUpperCase(), zip: stateZipMatch[3] || '' }
      }
      return { street, city: '', state: '', zip: '' }
    }

    return { street: fullAddress, city: '', state: '', zip: '' }
  }

  const findRepresentatives = async (addressData) => {
    const data = addressData || formData
    if (!data.street || !data.state) {
      setError('Please enter a full address (e.g. 123 Main St, City, ST 12345)')
      return
    }

    setLoading(true)
    setError(null)
    setHasSearched(true)

    try {
      console.log(`[MyPolitician] Looking up representatives for: ${data.street}, ${data.city}, ${data.state} ${data.zip}`)

      // Save address
      saveUserAddress(data)

      const stateAbbr = data.state

      // Try Census Geocoder to get the exact congressional district
      const districtInfo = await getCongressionalDistrict(
        data.street, data.city, stateAbbr, data.zip
      )

      if (districtInfo?.district) {
        console.log(`[MyPolitician] Census Geocoder found district: ${districtInfo.state}-${districtInfo.district}`)
        const reps = await getAllRepresentativesForLocation(districtInfo.state, districtInfo.district)
        setRepresentatives(reps)
      } else {
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
    const parsed = parseAddress(address)
    setFormData(parsed)
    findRepresentatives(parsed)
  }

  const handleReset = () => {
    clearUserAddress()
    setAddress('')
    setFormData({ street: '', city: '', state: '', zip: '' })
    setRepresentatives([])
    setHasSearched(false)
    setError(null)
  }

  return (
    <div className="my-politician">
      <div className="page-header">
        <h1>Find Your Representatives</h1>
        <p>Enter your address to find your House Representative and Senators</p>
      </div>

      <div className="address-card">
        <form onSubmit={handleSubmit} className="address-form">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, City, ST 12345"
            className="form-input autocomplete-input"
          />

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={loading || !address.trim()}>
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
            Representing {formData.street}{formData.city ? `, ${formData.city}` : ''}, {formData.state} {formData.zip}
          </p>

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
