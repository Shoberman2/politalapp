import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getMemberDetails, getMemberVotes } from '../services/congress'
import { getDonationsByPoliticianName, formatCurrency } from '../services/donations'
import '../styles/PoliticianDetail.css'

function PoliticianDetail() {
  const { bioguideId } = useParams()
  const navigate = useNavigate()

  const [member, setMember] = useState(null)
  const [votes, setVotes] = useState([])
  const [donations, setDonations] = useState(null)
  const [loading, setLoading] = useState(true)
  const [votesLoading, setVotesLoading] = useState(true)
  const [donationsLoading, setDonationsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    fetchMemberData()
  }, [bioguideId])

  const fetchMemberData = async () => {
    try {
      setLoading(true)
      console.log('[PoliticianDetail] Fetching data for:', bioguideId)

      const memberData = await getMemberDetails(bioguideId)
      console.log('[PoliticianDetail] Member data received:', memberData?.name || 'Unknown')

      setMember(memberData)
      setError(null)
      setLoading(false)

      // Fetch votes and donations in parallel after member loads
      fetchVotes()
      fetchDonations(memberData)
    } catch (err) {
      setError('Failed to load politician details. Please try again.')
      console.error('[PoliticianDetail] Error loading member:', err)
      setLoading(false)
    }
  }

  const fetchVotes = async () => {
    try {
      setVotesLoading(true)
      console.log('[PoliticianDetail] Fetching votes for:', bioguideId)
      const votesData = await getMemberVotes(bioguideId, 20)
      console.log('[PoliticianDetail] Votes received:', votesData?.length || 0)
      setVotes(votesData || [])
    } catch (err) {
      console.error('[PoliticianDetail] Error fetching votes:', err)
    } finally {
      setVotesLoading(false)
    }
  }

  // State name to abbreviation mapping
  const stateNameToAbbr = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
    'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
    'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
    'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
    'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
    'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
    'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
    'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY'
  }

  const normalizeState = (state) => {
    if (!state) return ''
    const lower = state.toLowerCase().trim()
    // If already an abbreviation
    if (lower.length === 2) return state.toUpperCase()
    // Convert full name to abbreviation
    return stateNameToAbbr[lower] || state
  }

  const fetchDonations = async (memberData) => {
    try {
      setDonationsLoading(true)
      const displayName = memberData.directOrderName || memberData.invertedOrderName || `${memberData.firstName} ${memberData.lastName}`
      const rawState = memberData.state || memberData.terms?.[0]?.state
      const state = normalizeState(rawState)
      console.log('[PoliticianDetail] Fetching donations for:', displayName, 'state:', state, '(raw:', rawState, ')')

      const donationsData = await getDonationsByPoliticianName(displayName, state)
      console.log('[PoliticianDetail] Donations data:', donationsData ? 'received' : 'none')
      setDonations(donationsData)
    } catch (err) {
      console.error('[PoliticianDetail] Error fetching donations:', err)
    } finally {
      setDonationsLoading(false)
    }
  }

  const getPartyColor = (party) => {
    const p = party?.toLowerCase()
    if (p?.includes('democrat')) return '#2563eb'
    if (p?.includes('republican')) return '#dc2626'
    return '#8b5cf6'
  }

  const getPartyGradient = (party) => {
    const p = party?.toLowerCase()
    if (p?.includes('democrat')) return 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
    if (p?.includes('republican')) return 'linear-gradient(135deg, #ef4444 0%, #991b1b 100%)'
    return 'linear-gradient(135deg, #a78bfa 0%, #6d28d9 100%)'
  }

  const getCurrentTerm = (terms) => {
    if (!terms || terms.length === 0) return null
    const sortedTerms = [...terms].sort((a, b) => (b.startYear || 0) - (a.startYear || 0))
    return sortedTerms[0]
  }

  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getVoteClass = (position) => {
    const pos = position?.toLowerCase()
    if (pos === 'yea' || pos === 'yes' || pos === 'aye') return 'vote-yea'
    if (pos === 'nay' || pos === 'no') return 'vote-nay'
    if (pos === 'sponsor') return 'vote-sponsor'
    return 'vote-other'
  }

  // Tooltips for voting terms
  const voteTooltips = {
    'yea': 'Voted YES - The representative voted in favor of this measure',
    'yes': 'Voted YES - The representative voted in favor of this measure',
    'aye': 'Voted YES - The representative voted in favor of this measure',
    'nay': 'Voted NO - The representative voted against this measure',
    'no': 'Voted NO - The representative voted against this measure',
    'sponsor': 'SPONSOR - This representative authored or introduced this bill',
    'cosponsor': 'CO-SPONSOR - This representative formally supports this bill',
    'present': 'PRESENT - The representative was present but did not vote yes or no',
    'not voting': 'NOT VOTING - The representative did not cast a vote on this measure'
  }

  const getVoteTooltip = (position) => {
    const pos = position?.toLowerCase()
    return voteTooltips[pos] || `Vote position: ${position}`
  }

  // Parse bill number to navigate to bill detail page
  const parseBillNumber = (billNumber) => {
    if (!billNumber) return null
    // Format: HR123, S456, HRES789, SRES101, HJRES12, SJRES34, HCONRES56, SCONRES78
    const match = billNumber.match(/^(HR|S|HRES|SRES|HJRES|SJRES|HCONRES|SCONRES)\.?\s*(\d+)$/i)
    if (match) {
      const typeMap = {
        'hr': 'hr',
        's': 's',
        'hres': 'hres',
        'sres': 'sres',
        'hjres': 'hjres',
        'sjres': 'sjres',
        'hconres': 'hconres',
        'sconres': 'sconres'
      }
      return {
        type: typeMap[match[1].toLowerCase()],
        number: match[2],
        congress: 118 // Current congress
      }
    }
    return null
  }

  const handleBillClick = (billNumber, e) => {
    e.preventDefault()
    const parsed = parseBillNumber(billNumber)
    if (parsed) {
      navigate(`/bill/${parsed.congress}/${parsed.type}/${parsed.number}`)
    }
  }

  if (loading) {
    return (
      <div className="politician-detail-loading">
        <div className="loading-spinner"></div>
        <p>Loading politician profile...</p>
      </div>
    )
  }

  if (error || !member) {
    return (
      <div className="politician-detail-error">
        <div className="error-message">{error || 'Politician not found'}</div>
        <button className="back-button" onClick={() => navigate('/all')}>
          Back to All Politicians
        </button>
      </div>
    )
  }

  const imageUrl = `https://www.congress.gov/img/member/${bioguideId.toLowerCase()}.jpg`
  const currentTerm = getCurrentTerm(member.terms)
  const displayName = member.directOrderName || member.invertedOrderName || `${member.firstName} ${member.lastName}`
  const party = member.partyHistory?.[0]?.partyName || member.party
  const state = member.state || currentTerm?.state
  const district = currentTerm?.district
  const chamber = currentTerm?.chamber

  return (
    <div className="politician-detail">
      <button className="back-link" onClick={() => navigate('/all')}>
        ← Back to All Politicians
      </button>

      {/* Header Section: Photo Left, Info Table Right */}
      <div className="politician-header-section">
        <div className="politician-photo-side">
          {!imageError ? (
            <img
              src={imageUrl}
              alt={displayName}
              className="politician-photo"
              onError={() => setImageError(true)}
            />
          ) : (
            <div
              className="politician-photo-placeholder"
              style={{ background: getPartyGradient(party) }}
            >
              <span>{displayName.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
            </div>
          )}
        </div>

        <div className="politician-info-side">
          <h1 className="politician-name">{displayName}</h1>
          <span
            className="party-badge-large"
            style={{ background: getPartyGradient(party) }}
          >
            {party}
          </span>

          <table className="info-table">
            <tbody>
              <tr>
                <th>Chamber</th>
                <td>{chamber || 'N/A'}</td>
              </tr>
              <tr>
                <th>State</th>
                <td>{state || 'N/A'}</td>
              </tr>
              {district && (
                <tr>
                  <th>District</th>
                  <td>{district}</td>
                </tr>
              )}
              <tr>
                <th>Years in Office</th>
                <td>{member.terms?.length || 0} term(s)</td>
              </tr>
              {member.birthYear && (
                <tr>
                  <th>Born</th>
                  <td>{member.birthYear}</td>
                </tr>
              )}
              {member.addressInformation?.officeAddress && (
                <tr>
                  <th>Office</th>
                  <td>{member.addressInformation.officeAddress}</td>
                </tr>
              )}
              {member.addressInformation?.phoneNumber && (
                <tr>
                  <th>Phone</th>
                  <td>
                    <a href={`tel:${member.addressInformation.phoneNumber}`}>
                      {member.addressInformation.phoneNumber}
                    </a>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="profile-links">
            {member.officialWebsiteUrl && (
              <a
                href={member.officialWebsiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="profile-link website"
              >
                Official Website
              </a>
            )}
            {member.url && (
              <a
                href={member.url}
                target="_blank"
                rel="noopener noreferrer"
                className="profile-link congress"
              >
                Congress.gov
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Voting History Section */}
      <section className="detail-section votes-section">
        <h2>Voting History</h2>
        {votesLoading ? (
          <div className="section-loading">
            <div className="loading-spinner"></div>
            <p>Loading voting history...</p>
          </div>
        ) : votes.length > 0 ? (
          <div className="votes-table-container">
            <table className="votes-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Bill</th>
                  <th>Vote</th>
                  <th>Description</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {votes.map((vote, index) => (
                  <tr key={index} className={vote.isSponsoredBill ? 'sponsored-row' : ''}>
                    <td className="vote-date">{formatDate(vote.date)}</td>
                    <td className="vote-bill">
                      {vote.billNumber ? (
                        parseBillNumber(vote.billNumber) ? (
                          <a
                            href="#"
                            onClick={(e) => handleBillClick(vote.billNumber, e)}
                            className="bill-link"
                            title="Click to view bill details"
                          >
                            {vote.billNumber}
                          </a>
                        ) : (
                          vote.billNumber
                        )
                      ) : (
                        'N/A'
                      )}
                    </td>
                    <td>
                      <span
                        className={`vote-badge ${getVoteClass(vote.position)} has-tooltip`}
                        title={getVoteTooltip(vote.position)}
                      >
                        {vote.position || 'N/A'}
                      </span>
                    </td>
                    <td className="vote-description">
                      <span
                        className="description-text"
                        title={vote.billTitle || vote.description || ''}
                      >
                        {vote.question || vote.description || vote.billTitle || 'Vote'}
                      </span>
                    </td>
                    <td className="vote-result">
                      <span title={vote.result === 'Passed' ? 'This measure was approved' : vote.result === 'Failed' ? 'This measure was rejected' : ''}>
                        {vote.result || 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="no-data-message">No voting records available</p>
        )}
      </section>

      {/* Campaign Funding Section */}
      <section className="detail-section funding-section">
        <h2>Campaign Funding</h2>
        {donationsLoading ? (
          <div className="section-loading">
            <div className="loading-spinner"></div>
            <p>Loading campaign finance data...</p>
          </div>
        ) : donations ? (
          <div className="funding-content">
            <div className="funding-summary">
              <div className="funding-stat">
                <span className="stat-value">{formatCurrency(donations.totalRaised)}</span>
                <span className="stat-label">Total Raised</span>
              </div>
              <div className="funding-stat corporate-stat">
                <span className="stat-value">{donations.corporateCount || 0}</span>
                <span className="stat-label">Major Corporate Donors</span>
              </div>
            </div>

            {/* Corporate Donors Section */}
            {donations.corporateDonors && donations.corporateDonors.length > 0 ? (
              <div className="corporate-donors-section">
                <h3>Major Corporate Contributions</h3>
                <p className="section-subtitle">Donations from employees of major corporations</p>
                <div className="corporate-tags">
                  {donations.corporateDonors.map((corp, index) => (
                    <div key={index} className="corporate-tag">
                      <span className="corp-name">{corp.company}</span>
                      <span className="corp-amount">{formatCurrency(corp.totalAmount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="no-corporate-message">No major corporate donations found</p>
            )}

            <div className="funding-source">
              <a
                href={`https://www.fec.gov/data/candidate/${donations.candidate?.id || ''}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="fec-link"
              >
                View Full FEC Records →
              </a>
            </div>
          </div>
        ) : (
          <p className="no-data-message">
            Campaign finance data not available for this politician.
            <br />
            <small>Data sourced from the Federal Election Commission (FEC)</small>
          </p>
        )}
      </section>

      {member.depiction?.attribution && (
        <div className="photo-attribution">
          Photo: {member.depiction.attribution}
        </div>
      )}
    </div>
  )
}

export default PoliticianDetail
