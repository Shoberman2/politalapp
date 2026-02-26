import { useState, useEffect } from 'react'
import PoliticianCard from './PoliticianCard'
import SEO from './SEO'
import {
  getHouseRepForDistrict,
  getSenatorsForState,
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
  const [houseRep, setHouseRep] = useState(null)
  const [senators, setSenators] = useState([])
  const [loadingHouse, setLoadingHouse] = useState(false)
  const [loadingSenators, setLoadingSenators] = useState(false)
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

    setLoadingHouse(true)
    setLoadingSenators(true)
    setError(null)
    setHasSearched(true)
    setHouseRep(null)
    setSenators([])

    try {
      saveUserAddress(data)
      const stateAbbr = data.state

      const districtInfo = await getCongressionalDistrict(
        data.street, data.city, stateAbbr, data.zip
      )

      let resolvedState = stateAbbr
      let resolvedDistrict = null

      if (districtInfo?.district) {
        resolvedState = districtInfo.state
        resolvedDistrict = districtInfo.district
      } else {
        const atLargeStates = ['AK', 'DE', 'MT', 'ND', 'SD', 'VT', 'WY']

        if (atLargeStates.includes(stateAbbr)) {
          resolvedDistrict = '0'
        } else {
          const districts = await getDistrictsByState(stateAbbr)

          if (districts.length === 1) {
            resolvedDistrict = districts[0]
          } else {
            // Can't determine district — just load senators
            resolvedDistrict = null
            setLoadingHouse(false)
            setError(`We couldn't determine your House district from your address. Visit house.gov/representatives/find-your-representative to find your district number.`)
          }
        }
      }

      // Fetch House rep and Senators in parallel
      const housePromise = resolvedDistrict !== null
        ? getHouseRepForDistrict(resolvedState, resolvedDistrict)
            .then(rep => {
              setHouseRep(rep)
              setLoadingHouse(false)
            })
            .catch(err => {
              console.error('[MyPolitician] Error fetching House rep:', err)
              setLoadingHouse(false)
            })
        : Promise.resolve()

      const senatePromise = getSenatorsForState(resolvedState)
        .then(sens => {
          setSenators(sens)
          setLoadingSenators(false)
        })
        .catch(err => {
          console.error('[MyPolitician] Error fetching Senators:', err)
          setLoadingSenators(false)
        })

      await Promise.all([housePromise, senatePromise])

    } catch (err) {
      console.error('[MyPolitician] Error:', err)
      setError('Error finding representatives. Please check your address and try again.')
      setLoadingHouse(false)
      setLoadingSenators(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    findRepresentatives()
  }

  const handleReset = () => {
    clearUserAddress()
    setFormData({ street: '', city: '', state: '', zip: '' })
    setHouseRep(null)
    setSenators([])
    setHasSearched(false)
    setError(null)
  }

  const isLoading = loadingHouse || loadingSenators
  const hasResults = houseRep || senators.length > 0

  return (
    <div className="my-politician">
      <SEO
        title="Find My Representative"
        description="Look up your U.S. senators and house representative by address. Find out who represents you in Congress."
        path="/my-representative"
      />
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
            <button type="submit" className="btn-primary" disabled={isLoading || !formData.street.trim() || !formData.state}>
              {isLoading ? 'Finding...' : 'Find My Representatives'}
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

      {loadingHouse && !houseRep && senators.length === 0 && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Finding your representatives...</p>
        </div>
      )}

      {hasResults && (
        <div className="representatives-results">
          <h2>Your Representatives</h2>
          <p className="results-subtitle">
            Representing {formData.street}{formData.city ? `, ${formData.city}` : ''}, {formData.state} {formData.zip}
          </p>

          {houseRep && (
            <div className="rep-section">
              <h3>House of Representatives</h3>
              <div className="rep-grid">
                <PoliticianCard politician={houseRep} showFavorite onFavoriteChange={refreshFavorites} />
              </div>
            </div>
          )}

          <div className="rep-section">
            <h3>U.S. Senate</h3>
            {loadingSenators ? (
              <div className="senators-loading">
                <div className="loading-spinner small"></div>
                <p>Loading senators — this can take a minute...</p>
              </div>
            ) : senators.length > 0 ? (
              <div className="rep-grid">
                {senators.map(senator => (
                  <PoliticianCard key={senator.bioguideId} politician={senator} showFavorite onFavoriteChange={refreshFavorites} />
                ))}
              </div>
            ) : !loadingHouse && (
              <p className="no-senators-message">No senators found for your state.</p>
            )}
          </div>
        </div>
      )}

      {loadingSenators && houseRep && (
        <div className="senators-loading-standalone">
          <div className="loading-spinner small"></div>
          <p>Loading senators — this can take a minute...</p>
        </div>
      )}
    </div>
  )
}

export default MyPolitician
