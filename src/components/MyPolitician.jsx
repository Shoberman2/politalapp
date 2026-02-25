import { useState, useEffect } from 'react'
import PoliticianCard from './PoliticianCard'
import {
  getAllRepresentativesForLocation,
  getCongressionalDistrict,
  getDistrictsByState,
  US_STATES
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
  const [representatives, setRepresentatives] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasSearched, setHasSearched] = useState(!!savedAddress?.state)
  const [favorites, setFavorites] = useState([])

  useEffect(() => {
    setFavorites(getFavorites())
  }, [])

  useEffect(() => {
    if (savedAddress?.street && savedAddress?.state) {
      findRepresentatives(savedAddress)
    }
  }, [])

  const refreshFavorites = () => {
    setFavorites(getFavorites())
  }

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const findRepresentatives = async (addressData) => {
    const data = addressData || formData
    if (!data.street || !data.state) {
      setError('Please enter your street address and select a state')
      return
    }

    setLoading(true)
    setError(null)
    setHasSearched(true)

    try {
      saveUserAddress(data)
      const stateAbbr = data.state

      const districtInfo = await getCongressionalDistrict(
        data.street, data.city, stateAbbr, data.zip
      )

      if (districtInfo?.district) {
        const reps = await getAllRepresentativesForLocation(districtInfo.state, districtInfo.district)
        setRepresentatives(reps)
      } else {
        const atLargeStates = ['AK', 'DE', 'MT', 'ND', 'SD', 'VT', 'WY']

        if (atLargeStates.includes(stateAbbr)) {
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
    findRepresentatives()
  }

  const handleReset = () => {
    clearUserAddress()
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
          <div className="form-group full-width">
            <label htmlFor="street">Street Address</label>
            <input
              id="street"
              name="street"
              type="text"
              value={formData.street}
              onChange={handleChange}
              placeholder="123 Main St"
              className="form-input"
              autoComplete="address-line1"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="city">City</label>
              <input
                id="city"
                name="city"
                type="text"
                value={formData.city}
                onChange={handleChange}
                placeholder="City"
                className="form-input"
                autoComplete="address-level2"
              />
            </div>

            <div className="form-group small">
              <label htmlFor="state">State</label>
              <select
                id="state"
                name="state"
                value={formData.state}
                onChange={handleChange}
                className="form-input"
                autoComplete="address-level1"
              >
                <option value="">--</option>
                {US_STATES.map(s => (
                  <option key={s.abbr} value={s.abbr}>{s.abbr}</option>
                ))}
              </select>
            </div>

            <div className="form-group small">
              <label htmlFor="zip">Zip Code</label>
              <input
                id="zip"
                name="zip"
                type="text"
                value={formData.zip}
                onChange={handleChange}
                placeholder="12345"
                className="form-input"
                maxLength={5}
                autoComplete="postal-code"
              />
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={loading || !formData.street.trim() || !formData.state}>
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
