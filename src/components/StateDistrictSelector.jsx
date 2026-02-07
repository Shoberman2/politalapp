import { useState, useEffect } from 'react'
import { US_STATES, getDistrictsByState } from '../services/district'
import '../styles/StateDistrictSelector.css'

function StateDistrictSelector({ onSubmit, initialState = '' }) {
  const [selectedState, setSelectedState] = useState(initialState)
  const [selectedDistrict, setSelectedDistrict] = useState('')
  const [districts, setDistricts] = useState([])
  const [loadingDistricts, setLoadingDistricts] = useState(false)

  // Update selected state if initialState prop changes
  useEffect(() => {
    if (initialState) {
      setSelectedState(initialState)
    }
  }, [initialState])

  useEffect(() => {
    const fetchDistricts = async () => {
      if (selectedState) {
        setLoadingDistricts(true)
        try {
          const districtList = await getDistrictsByState(selectedState)
          setDistricts(districtList)
          if (districtList.length === 1) {
            setSelectedDistrict(districtList[0])
          } else {
            setSelectedDistrict('')
          }
        } catch (error) {
          console.error('Error fetching districts:', error)
          setDistricts([])
        } finally {
          setLoadingDistricts(false)
        }
      } else {
        setDistricts([])
        setSelectedDistrict('')
      }
    }

    fetchDistricts()
  }, [selectedState])

  const handleSubmit = (e) => {
    e.preventDefault()

    if (!selectedState) {
      return
    }

    onSubmit(selectedState, selectedDistrict || districts[0])
  }

  return (
    <form onSubmit={handleSubmit} className="selector-form">
      <div className="selector-row">
        <div className="form-group">
          <label htmlFor="state-select">State</label>
          <select
            id="state-select"
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="selector-input"
            required
          >
            <option value="">Choose your state...</option>
            {US_STATES.map(state => (
              <option key={state.abbr} value={state.abbr}>
                {state.name}
              </option>
            ))}
          </select>
        </div>

        {selectedState && (
          <div className="form-group">
            <label htmlFor="district-select">District</label>
            {loadingDistricts ? (
              <div className="loading-districts">Loading...</div>
            ) : districts.length > 1 ? (
              <select
                id="district-select"
                value={selectedDistrict}
                onChange={(e) => setSelectedDistrict(e.target.value)}
                className="selector-input"
                required
              >
                <option value="">Choose district...</option>
                {districts.map(district => (
                  <option key={district} value={district}>
                    District {parseInt(district)}
                  </option>
                ))}
              </select>
            ) : (
              <div className="at-large-district">At-Large (Single District)</div>
            )}
          </div>
        )}
      </div>

      <button
        type="submit"
        className="selector-button"
        disabled={!selectedState || (districts.length > 1 && !selectedDistrict)}
      >
        Find Representatives
      </button>
    </form>
  )
}

export default StateDistrictSelector
