import { useNavigate } from 'react-router-dom'

function TrendingBillCard({ bill }) {
  const navigate = useNavigate()

  const getStatusInfo = () => {
    const latestAction = (bill.latestAction?.text || '').toLowerCase()
    if (latestAction.includes('became public law') || latestAction.includes('signed by president')) {
      return { label: 'Enacted', className: 'status-enacted' }
    }
    if (latestAction.includes('passed house') && latestAction.includes('passed senate')) {
      return { label: 'Passed Both', className: 'status-passed-both' }
    }
    if (latestAction.includes('passed house') || latestAction.includes('passed senate')) {
      return { label: 'Passed', className: 'status-passed' }
    }
    if (latestAction.includes('committee')) {
      return { label: 'In Committee', className: 'status-committee' }
    }
    if (latestAction.includes('introduced')) {
      return { label: 'Introduced', className: 'status-introduced' }
    }
    return { label: 'In Progress', className: 'status-progress' }
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

  const handleClick = () => {
    navigate(`/bill/${bill.congress}/${bill.type}/${bill.number}`)
  }

  const handleSponsorClick = (e, bioguideId) => {
    e.stopPropagation()
    if (bioguideId) {
      navigate(`/politician/${bioguideId}`)
    }
  }

  const status = getStatusInfo()
  const sponsor = bill.sponsors?.[0]
  const sponsorName = sponsor
    ? (sponsor.fullName || sponsor.name || `${sponsor.firstName || ''} ${sponsor.lastName || ''}`.trim())
    : null

  return (
    <div className="trending-bill-card" onClick={handleClick}>
      <div className="trending-bill-top">
        <span className="trending-badge">IN THE NEWS</span>
        <span className={`bill-status-badge ${status.className}`}>
          {status.label}
        </span>
      </div>

      <h3 className="trending-bill-headline">{bill.headline}</h3>

      <p className="trending-bill-blurb">{bill.whyItMatters}</p>

      <div className="trending-bill-meta">
        <span className="trending-bill-number">
          {bill.type?.toUpperCase()}.{bill.number}
        </span>
        {bill.latestAction && (
          <span className="trending-bill-action">
            {bill.latestAction.text}
            {bill.latestAction.actionDate && (
              <> &middot; {formatDate(bill.latestAction.actionDate)}</>
            )}
          </span>
        )}
      </div>

      <div className="trending-bill-footer">
        {sponsorName ? (
          <button
            className="sponsor-link"
            onClick={(e) => handleSponsorClick(e, sponsor.bioguideId)}
          >
            {sponsorName}
          </button>
        ) : (
          <span className="trending-bill-number">{bill.congress}th Congress</span>
        )}
      </div>
    </div>
  )
}

export default TrendingBillCard
