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

  const getPartyColor = (party) => {
    if (party === 'D' || party === 'Democrat' || party === 'Democratic') return '#2563eb'
    if (party === 'R' || party === 'Republican') return '#dc2626'
    return '#8b5cf6'
  }

  const getPartyGradient = (party) => {
    if (party === 'D' || party === 'Democrat' || party === 'Democratic') return 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
    if (party === 'R' || party === 'Republican') return 'linear-gradient(135deg, #ef4444 0%, #991b1b 100%)'
    return 'linear-gradient(135deg, #a78bfa 0%, #6d28d9 100%)'
  }

  const getPartyAbbr = (party) => {
    if (party === 'Democrat' || party === 'Democratic') return 'D'
    if (party === 'Republican') return 'R'
    if (party === 'Independent') return 'I'
    return party?.charAt(0) || '?'
  }

  const displayName = politician.name || `${politician.firstName || ''} ${politician.lastName || ''}`.trim()
  const bioguideId = politician.bioguideId || politician.bioguide_id
  const imageUrl = bioguideId
    ? `https://www.congress.gov/img/member/${bioguideId.toLowerCase()}.jpg`
    : null

  const location = politician.state + (politician.district ? `-${politician.district}` : '')
  const partyAbbr = getPartyAbbr(politician.party || politician.partyName || '')
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
              background: getPartyGradient(partyAbbr)
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
            className="card-party"
            style={{
              background: getPartyGradient(partyAbbr),
              boxShadow: `0 2px 10px ${getPartyColor(partyAbbr)}40`
            }}
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
