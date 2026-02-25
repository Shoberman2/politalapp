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

  const getBillTypeInfo = (type) => {
    const info = {
      hr: { name: 'House Bill', desc: 'A bill originating in the House of Representatives' },
      s: { name: 'Senate Bill', desc: 'A bill originating in the Senate' },
      hjres: { name: 'House Joint Resolution', desc: 'A joint resolution from the House — has the force of law, often used for constitutional amendments' },
      sjres: { name: 'Senate Joint Resolution', desc: 'A joint resolution from the Senate — has the force of law, often used for constitutional amendments' },
      hconres: { name: 'House Concurrent Resolution', desc: 'Expresses the position of both chambers but does not have the force of law' },
      sconres: { name: 'Senate Concurrent Resolution', desc: 'Expresses the position of both chambers but does not have the force of law' },
      hres: { name: 'House Simple Resolution', desc: 'Addresses matters within the House only — does not become law' },
      sres: { name: 'Senate Simple Resolution', desc: 'Addresses matters within the Senate only — does not become law' }
    }
    return info[type?.toLowerCase()] || { name: type, desc: '' }
  }

  const simplifyTitle = (title) => {
    if (!title) return 'Untitled Bill'

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

    simplified = simplified.charAt(0).toUpperCase() + simplified.slice(1)

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

  const getStatusInfo = () => {
    const latestAction = (bill.latestAction?.text || '').toLowerCase()
    if (latestAction.includes('became public law') || latestAction.includes('signed by president')) {
      return { label: 'Enacted', className: 'status-enacted', desc: 'Signed into law by the President' }
    }
    if (latestAction.includes('passed house') && latestAction.includes('passed senate')) {
      return { label: 'Passed Both', className: 'status-passed-both', desc: 'Passed both the House and Senate' }
    }
    if (latestAction.includes('passed house') || latestAction.includes('passed senate')) {
      return { label: 'Passed', className: 'status-passed', desc: 'Passed one chamber, awaiting the other' }
    }
    if (latestAction.includes('committee')) {
      return { label: 'In Committee', className: 'status-committee', desc: 'Being reviewed by a congressional committee' }
    }
    if (latestAction.includes('introduced')) {
      return { label: 'Introduced', className: 'status-introduced', desc: 'Newly introduced, not yet assigned to committee' }
    }
    return { label: 'In Progress', className: 'status-progress', desc: 'Moving through the legislative process' }
  }

  const sponsor = bill.sponsors?.[0] || bill.sponsor
  const sponsorName = sponsor
    ? (sponsor.fullName || sponsor.name || `${sponsor.firstName || ''} ${sponsor.lastName || ''}`.trim())
    : null
  const sponsorBioguideId = sponsor?.bioguideId
  const status = getStatusInfo()
  const typeInfo = getBillTypeInfo(bill.type)

  return (
    <div className="bill-card" onClick={handleCardClick}>
      <div className="bill-card-header">
        <span
          className="bill-type-badge"
          style={{ backgroundColor: getBillTypeColor(bill.type) }}
          title={typeInfo.desc}
        >
          {bill.type?.toUpperCase()}
        </span>
        <span className="bill-number" title={typeInfo.name}>
          {bill.type?.toUpperCase()}.{bill.number}
        </span>
        <span className={`bill-status-badge ${status.className}`} title={status.desc}>
          {status.label}
        </span>
      </div>

      <h3 className="bill-title">{simplifyTitle(bill.title)}</h3>

      <div className="bill-type-desc">{typeInfo.name}</div>

      {bill.introducedDate && (
        <div className="bill-introduced">
          Introduced {formatDate(bill.introducedDate)}
        </div>
      )}

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
          {sponsorName ? (
            <>
              <span className="sponsor-label">Sponsor:</span>
              <button
                className="sponsor-link"
                onClick={(e) => handleSponsorClick(e, sponsorBioguideId)}
              >
                {sponsorName}
              </button>
            </>
          ) : (
            <span className="sponsor-label">Sponsor info on detail page</span>
          )}
        </div>
        <span className="bill-congress">
          {bill.congress}th Congress
        </span>
      </div>
    </div>
  )
}

export default BillCard
