import { useNavigate } from 'react-router-dom'
import '../styles/BillCard.css'

function BillCard({ bill, onSponsorClick }) {
  const navigate = useNavigate()

  const getBillTypeColor = (type) => {
    const colors = {
      hr: '#2563eb',
      s: '#dc2626',
      hjres: '#7c3aed',
      sjres: '#059669',
      hconres: '#d97706',
      sconres: '#0891b2',
      hres: '#4f46e5',
      sres: '#be185d'
    }
    return colors[type?.toLowerCase()] || '#6b7280'
  }

  const getBillTypeName = (type) => {
    const names = {
      hr: 'House Bill',
      s: 'Senate Bill',
      hjres: 'Joint Resolution',
      sjres: 'Joint Resolution',
      hconres: 'Resolution',
      sconres: 'Resolution',
      hres: 'Resolution',
      sres: 'Resolution'
    }
    return names[type?.toLowerCase()] || type
  }

  // Simplify long bill titles
  const simplifyTitle = (title) => {
    if (!title) return 'Untitled Bill'

    // Remove common verbose prefixes
    let simplified = title
      .replace(/^A bill to /i, '')
      .replace(/^To /i, '')
      .replace(/^An act to /i, '')
      .replace(/^Providing for /i, '')
      .replace(/^Expressing the sense of (the )?Congress /i, 'Congress Resolution: ')
      .replace(/^Expressing the sense of (the )?House /i, 'House Resolution: ')
      .replace(/^Expressing the sense of (the )?Senate /i, 'Senate Resolution: ')
      .replace(/, and for other purposes\.?$/i, '')
      .replace(/\.$/i, '')

    // Capitalize first letter
    simplified = simplified.charAt(0).toUpperCase() + simplified.slice(1)

    // Truncate if still too long
    if (simplified.length > 150) {
      simplified = simplified.substring(0, 147) + '...'
    }

    return simplified
  }

  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const handleCardClick = () => {
    const congress = bill.congress || 118
    const type = bill.type?.toLowerCase() || 'hr'
    const number = bill.number
    navigate(`/bill/${congress}/${type}/${number}`)
  }

  const handleSponsorClick = (e, sponsorBioguideId) => {
    e.stopPropagation()
    if (sponsorBioguideId) {
      navigate(`/politician/${sponsorBioguideId}`)
    }
    if (onSponsorClick) {
      onSponsorClick(sponsorBioguideId)
    }
  }

  const sponsor = bill.sponsors?.[0] || bill.sponsor
  const sponsorName = sponsor?.fullName || sponsor?.name || 'Unknown Sponsor'
  const sponsorBioguideId = sponsor?.bioguideId

  return (
    <div className="bill-card" onClick={handleCardClick}>
      <div className="bill-card-header">
        <span
          className="bill-type-badge"
          style={{ backgroundColor: getBillTypeColor(bill.type) }}
        >
          {bill.type?.toUpperCase()}
        </span>
        <span className="bill-number">
          {bill.type?.toUpperCase()}.{bill.number}
        </span>
      </div>

      <h3 className="bill-title">{simplifyTitle(bill.title)}</h3>

      <div className="bill-meta">
        {bill.latestAction && (
          <div className="bill-action">
            <span className="action-label">Latest Action:</span>
            <span className="action-text">{bill.latestAction.text}</span>
            <span className="action-date">{formatDate(bill.latestAction.actionDate)}</span>
          </div>
        )}
      </div>

      <div className="bill-footer">
        <div className="bill-sponsor">
          <span className="sponsor-label">Sponsor:</span>
          <button
            className="sponsor-link"
            onClick={(e) => handleSponsorClick(e, sponsorBioguideId)}
          >
            {sponsorName}
          </button>
        </div>
        <span className="bill-congress">
          {bill.congress}th Congress
        </span>
      </div>
    </div>
  )
}

export default BillCard
