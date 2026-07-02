import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isFavorite, toggleFavorite } from '../services/userService'
import '../styles/PoliticianCard.css'

function PoliticianCard({ politician, showFavorite = false, onFavoriteChange }) {
  const navigate = useNavigate()
  const [favorited, setFavorited] = useState(false)

  useEffect(() => {
    if (showFavorite && politician.bioguideId) {
      setFavorited(isFavorite(politician.bioguideId))
    }
  }, [politician.bioguideId, showFavorite])

  const getPartyAbbr = (party) => {
    if (party === 'Democrat' || party === 'Democratic') return 'D'
    if (party === 'Republican') return 'R'
    if (party === 'Independent') return 'I'
    return party?.charAt(0) || '?'
  }

  const displayName = politician.name || `${politician.firstName || ''} ${politician.lastName || ''}`.trim()
  const bioguideId = politician.bioguideId || politician.bioguide_id
  // Prefer the API-supplied depiction URL — congress.gov/img/member/{bioguide}.jpg
  // 404s for newer members who get hashed filenames instead.
  const imageUrl = politician.imageUrl
    || (bioguideId ? `https://www.congress.gov/img/member/${bioguideId.toLowerCase()}.jpg` : null)

  const location = politician.state + (politician.district ? `-${politician.district}` : '')
  const partyAbbr = getPartyAbbr(politician.party || politician.partyName || '')
  const partyClass = partyAbbr === 'D' ? 'dem' : partyAbbr === 'R' ? 'rep' : 'ind'
  const chamber = politician.chamber === 'senate' ? 'Senator' : 'Representative'

  const handleClick = () => {
    if (bioguideId) {
      navigate(`/politician/${bioguideId}`)
    }
  }

  const handleFavoriteClick = (e) => {
    e.stopPropagation()
    const newStatus = toggleFavorite(politician)
    setFavorited(newStatus)
    if (onFavoriteChange) {
      onFavoriteChange(newStatus)
    }
  }

  return (
    <div className="politician-card" onClick={handleClick}>
      <div className="card-content">
        <div className="card-photo">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={displayName}
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'flex'
              }}
            />
          ) : null}
          <div
            className="photo-placeholder"
            style={{
              display: imageUrl ? 'none' : 'flex',
            }}
          >
            <span>{displayName.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
          </div>
        </div>

        <div className="card-info">
          <h3 className="card-name">{displayName}</h3>
          <p className="card-role">{chamber}</p>
          <p className="card-location">{location}</p>
        </div>

        <div className="card-actions">
          <div
            className={`card-party ${partyClass}`}
            title={partyAbbr === 'D' ? 'Democrat' : partyAbbr === 'R' ? 'Republican' : partyAbbr === 'I' ? 'Independent' : partyAbbr}
          >
            {partyAbbr}
          </div>

          {showFavorite && (
            <button
              className={`favorite-btn ${favorited ? 'active' : ''}`}
              onClick={handleFavoriteClick}
              title={favorited ? 'Remove from favorites' : 'Add to favorites'}
            >
              <svg viewBox="0 0 24 24" fill={favorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default PoliticianCard
