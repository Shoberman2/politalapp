import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getMemberDetails } from '../services/congress'
import { getDonationsByPoliticianName, formatCurrency, getMoneyVotesCorrelation } from '../services/donations'
import { getIndustryBreakdown, formatCurrency as formatCompact } from '../data/industryMap'
import { getMemberDashboardData } from '../services/supabaseVotes'
import { InfoTip } from './Tooltip'
import VoteDashboard from './VoteDashboard'
import VotingPatternAnalysis from './VotingPatternAnalysis'
import SEO from './SEO'
import '../styles/PoliticianDetail.css'

function PoliticianDetail() {
  const { bioguideId } = useParams()
  const navigate = useNavigate()

  const [member, setMember] = useState(null)
  const [donations, setDonations] = useState(null)
  const [industryData, setIndustryData] = useState([])
  const [correlationData, setCorrelationData] = useState([])
  const [loading, setLoading] = useState(true)
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

      // Fetch donations after member loads (votes handled by VoteDashboard)
      fetchDonations(memberData)
    } catch (err) {
      setError('Failed to load politician details. Please try again.')
      console.error('[PoliticianDetail] Error loading member:', err)
      setLoading(false)
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

      // Compute industry breakdown from donor data
      if (donationsData?.donors?.length > 0) {
        const breakdown = getIndustryBreakdown(donationsData.donors)
        setIndustryData(breakdown)

        // Compute money-votes correlation using Supabase voting data
        try {
          const dashData = await getMemberDashboardData(bioguideId)
          if (dashData?.votes && dashData.votes.length > 0) {
            const votes = dashData.votes
            const bills = votes.map(v => v.bills).filter(Boolean)
            const corr = await getMoneyVotesCorrelation(breakdown, votes, bills)
            setCorrelationData(corr)
          }
        } catch (err) {
          console.warn('[PoliticianDetail] Correlation data unavailable:', err.message)
        }
      }
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
      <SEO
        title={`${displayName} — Voting Record`}
        description={`View ${displayName}'s congressional voting record, sponsored legislation, and campaign finance data.`}
        path={`/politician/${bioguideId}`}
        schema={{
          '@type': 'Person',
          name: displayName,
          jobTitle: chamber === 'Senate' ? 'U.S. Senator' : 'U.S. Representative',
          affiliation: {
            '@type': 'GovernmentOrganization',
            name: 'United States Congress'
          },
          memberOf: {
            '@type': 'Organization',
            name: party
          },
          ...(member.depiction?.imageUrl && {
            image: member.depiction.imageUrl
          })
        }}
      />
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
                <th><InfoTip text="Congress has two chambers: the House of Representatives (435 members, based on population) and the Senate (100 members, 2 per state).">Chamber</InfoTip></th>
                <td>{chamber || 'N/A'}</td>
              </tr>
              <tr>
                <th>State</th>
                <td>{state || 'N/A'}</td>
              </tr>
              {district && (
                <tr>
                  <th><InfoTip text="A congressional district is a geographic area within a state represented by one House member. Each state is divided into districts based on population.">District</InfoTip></th>
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

      {/* Voting Dashboard — replaces old voting history table */}
      <section className="detail-section votes-section">
        <VoteDashboard bioguideId={bioguideId} />
      </section>

      {/* Campaign Funding Section */}
      <section className="detail-section funding-section">
        <h2><InfoTip text="Money raised and spent for election campaigns, reported to the Federal Election Commission (FEC). Includes donations from individuals, PACs, and organizations.">Campaign Funding</InfoTip></h2>
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
              {donations.individualTotal > 0 && (
                <div className="funding-stat">
                  <span className="stat-value">{formatCurrency(donations.individualTotal)}</span>
                  <span className="stat-label">Individuals</span>
                </div>
              )}
              {donations.pacTotal > 0 && (
                <div className="funding-stat">
                  <span className="stat-value">{formatCurrency(donations.pacTotal)}</span>
                  <span className="stat-label">PACs</span>
                </div>
              )}
            </div>

            {/* Industry Breakdown */}
            {industryData.length > 0 && (
              <div className="industry-breakdown">
                <h3>Industry Breakdown</h3>
                <div className="industry-bars">
                  {industryData.slice(0, 8).map((sector, i) => (
                    <div key={i} className="industry-bar-row">
                      <span className="industry-label">{sector.industry}</span>
                      <div className="industry-bar-track">
                        <div
                          className="industry-bar-fill"
                          style={{ width: `${Math.max(sector.percentage, 2)}%` }}
                        />
                      </div>
                      <span className="industry-amount">{formatCompact(sector.totalAmount)}</span>
                      <span className="industry-pct">{sector.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Money-Votes Correlation */}
            {correlationData.length > 0 && (
              <div className="money-votes-section">
                <h3><InfoTip text="How often this politician votes 'Yea' on bills related to the industries that fund them. Based on FEC donation data matched to Congress.gov bill policy areas.">Money &amp; Votes</InfoTip></h3>
                <div className="correlation-cards">
                  {correlationData.map((corr, i) => (
                    <div key={i} className="correlation-card">
                      <div className="correlation-industry">{corr.industry}</div>
                      <div className="correlation-stats">
                        <span className="correlation-donated">{formatCompact(corr.donationAmount)} donated</span>
                        <span className="correlation-votes">
                          Voted Yea {corr.yeaPercent}% on {corr.billsVotedOn} related bill{corr.billsVotedOn !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="correlation-bar-track">
                        <div
                          className="correlation-bar-fill"
                          style={{ width: `${corr.yeaPercent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Committee Financial Details */}
            {donations.committees && donations.committees.length > 0 && (
              <div className="committees-section">
                <h3><InfoTip text="Official fundraising organizations registered with the FEC to raise and spend money on behalf of a candidate.">Campaign Committees</InfoTip></h3>
                <div className="committees-grid">
                  {donations.committees.map((committee, index) => (
                    <div key={index} className="committee-card">
                      <span className="committee-name">{committee.name}</span>
                      <div className="committee-financials">
                        <span className="committee-stat">
                          <span className="committee-stat-label" title="Total money received">Receipts</span>
                          <span className="committee-stat-value">{formatCurrency(committee.receipts)}</span>
                        </span>
                        <span className="committee-stat">
                          <span className="committee-stat-label" title="Total money spent">Disbursements</span>
                          <span className="committee-stat-value">{formatCurrency(committee.disbursements)}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Donors */}
            {donations.donors && donations.donors.length > 0 && (
              <div className="top-donors-section">
                <h3>Top Donors</h3>
                <div className="donors-list">
                  {donations.donors.slice(0, 10).map((donor, i) => (
                    <div key={i} className="donor-row">
                      <div className="donor-info">
                        <span className="donor-name">{donor.name}</span>
                        {donor.entityType && donor.entityType !== 'IND' && (
                          <span className={`entity-badge ${donor.entityType.toLowerCase()}`}>
                            {donor.entityType === 'COM' ? 'PAC' : 'ORG'}
                          </span>
                        )}
                        {donor.employer && <span className="donor-employer">{donor.employer}</span>}
                      </div>
                      <span className="donor-amount">{formatCurrency(donor.totalAmount)}</span>
                    </div>
                  ))}
                </div>
              </div>
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

      {/* Voting Pattern Analysis — new in v2 */}
      <VotingPatternAnalysis member={{ ...member, bioguideId, state, district, party }} />

      {member.depiction?.attribution && (
        <div className="photo-attribution">
          Photo: {member.depiction.attribution}
        </div>
      )}
    </div>
  )
}

export default PoliticianDetail
