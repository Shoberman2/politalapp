import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getMemberDetails } from '../services/congress'
import { getAllTermsForMember } from '../services/memberTerms'
import { resolveMemberImageUrl } from '../utils/memberImage'
import {
  BILL_CONGRESS_MIN,
  CONGRESS_MAX,
  formatCongressLabel,
  getCongressEndYear,
  getCongressStartYear,
} from '../utils/congressUtil'
import { getDonationsByPoliticianName, formatCurrency, getMoneyVotesCorrelation } from '../services/donations'
import { getIndustryBreakdown, formatCurrency as formatCompact } from '../data/industryMap'
import { getMemberDashboardData } from '../services/supabaseVotes'
import { InfoTip } from './Tooltip'
import VoteDashboard from './VoteDashboard'
import VotingPatternAnalysis from './VotingPatternAnalysis'
import SponsorActivityBadge from './SponsorActivityBadge'
import SEO from './SEO'
import '../styles/PoliticianDetail.css'

// Same feature flag as the BillsPage filter pills — both surfaces depend on
// the same sponsor data being persisted by migration 006 + Phase A backfill.
const SHOW_SPONSOR_FILTER = import.meta.env.VITE_BILLS_SHOW_SPONSOR_FILTER === 'true'

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
}

function PoliticianDetail() {
  const { bioguideId } = useParams()
  const navigate = useNavigate()

  const [member, setMember] = useState(null)
  const [careerTerms, setCareerTerms] = useState([])
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
      const [memberData, termRows] = await Promise.all([
        getMemberDetails(bioguideId),
        getAllTermsForMember(bioguideId),
      ])
      setMember(memberData)
      setCareerTerms(termRows)
      setError(null)
      setLoading(false)
      fetchDonations(memberData)
    } catch (err) {
      setError('Failed to load politician details. Please try again.')
      console.error('[PoliticianDetail] Error loading member:', err)
      setLoading(false)
    }
  }

  const stateNameToAbbr = Object.fromEntries(
    Object.entries(STATE_NAMES).map(([k, v]) => [v.toLowerCase(), k])
  )

  const normalizeState = (state) => {
    if (!state) return ''
    const lower = state.toLowerCase().trim()
    if (lower.length === 2) return state.toUpperCase()
    return stateNameToAbbr[lower] || state
  }

  const getTermsArray = (terms) => {
    if (Array.isArray(terms)) return terms
    if (Array.isArray(terms?.item)) return terms.item
    return []
  }

  const fetchDonations = async (memberData) => {
    try {
      setDonationsLoading(true)
      const displayName = memberData.directOrderName || memberData.invertedOrderName || `${memberData.firstName} ${memberData.lastName}`
      const rawState = memberData.state || getTermsArray(memberData.terms)[0]?.state
      const state = normalizeState(rawState)
      const donationsData = await getDonationsByPoliticianName(displayName, state)
      setDonations(donationsData)

      if (donationsData?.donors?.length > 0) {
        const breakdown = getIndustryBreakdown(donationsData.donors)
        setIndustryData(breakdown)
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

  const partyClass = (party) => {
    if (!party) return 'party-tag-ind'
    const p = party.toLowerCase()
    if (p.startsWith('d') || p.includes('democrat')) return 'party-tag-dem'
    if (p.startsWith('r') || p.includes('republican')) return 'party-tag-rep'
    return 'party-tag-ind'
  }

  const partyShort = (party) => {
    if (!party) return ''
    const p = party.toLowerCase()
    if (p.startsWith('d') || p.includes('democrat')) return 'Dem'
    if (p.startsWith('r') || p.includes('republican')) return 'Rep'
    return 'Ind'
  }

  const getCurrentTerm = (terms) => {
    const termsArray = getTermsArray(terms)
    if (termsArray.length === 0) return null
    return [...termsArray].sort((a, b) => (b.startYear || 0) - (a.startYear || 0))[0]
  }

  const splitName = (full) => {
    if (!full) return { first: '', rest: '' }
    const parts = full.trim().split(' ')
    return { first: parts[0], rest: parts.slice(1).join(' ') }
  }

  const yearFromDate = (value) => {
    if (!value) return null
    const match = String(value).match(/^(\d{4})/)
    return match ? Number(match[1]) : null
  }

  const formatChamberName = (value) => {
    const chamberValue = String(value || '').toLowerCase()
    if (chamberValue.includes('senate')) return 'Senate'
    if (chamberValue.includes('house') || chamberValue.includes('representative')) return 'House'
    return value || ''
  }

  const getTermCongress = (term) => {
    const explicitCongress = Number(term.congress)
    if (Number.isInteger(explicitCongress)) return explicitCongress
    return null
  }

  const formatTermYears = (term) => {
    const congress = getTermCongress(term)
    const startYear = yearFromDate(term.term_start)
      || term.startYear
      || (congress ? getCongressStartYear(congress) : null)
    const endYear = term.term_end
      ? yearFromDate(term.term_end)
      : term.endYear || (congress ? getCongressEndYear(congress) : 'present')
    if (!startYear) return 'Dates unavailable'
    return `${startYear}-${endYear || 'present'}`
  }

  if (loading) {
    return (
      <div className="pol-loading">
        <div className="loading-spinner"></div>
        <p>Loading politician profile...</p>
      </div>
    )
  }

  if (error || !member) {
    return (
      <div className="pol-error">
        <div className="error-message">{error || 'Politician not found'}</div>
        <button className="pol-back-button" onClick={() => navigate('/all')}>
          Back to All Politicians
        </button>
      </div>
    )
  }

  const imageUrl = resolveMemberImageUrl(bioguideId, member.depiction?.imageUrl)
    || `https://www.congress.gov/img/member/${bioguideId.toLowerCase()}.jpg`
  const memberTermsArray = getTermsArray(member.terms)
  const currentTerm = getCurrentTerm(member.terms)
  const displayName = member.directOrderName || member.invertedOrderName || `${member.firstName} ${member.lastName}`
  const party = member.partyHistory?.[0]?.partyName || member.party
  const rawState = member.state || currentTerm?.state
  const stateAbbr = normalizeState(rawState)
  const stateName = STATE_NAMES[stateAbbr] || rawState
  const district = currentTerm?.district
  const chamber = currentTerm?.chamber
  const termCount = memberTermsArray.length
  const firstTermYear = memberTermsArray.length > 0 ? Math.min(...memberTermsArray.map(t => t.startYear || Infinity)) : null

  // Title (Senator vs Representative)
  const title = chamber?.toLowerCase().includes('senate') ? 'U.S. Senator' : 'U.S. Representative'

  const { first: firstName, rest: restName } = splitName(displayName)

  // Build factual standfirst from real data
  const buildStandfirst = () => {
    const pieces = []
    if (firstTermYear && firstTermYear !== Infinity) {
      const yrs = new Date().getFullYear() - firstTermYear
      pieces.push(`Serving since ${firstTermYear}${yrs > 0 ? ` — ${yrs} year${yrs !== 1 ? 's' : ''} in Congress` : ''}.`)
    }
    if (chamber?.toLowerCase().includes('senate')) {
      pieces.push(`Represents ${stateName} in the U.S. Senate.`)
    } else if (stateName && district) {
      pieces.push(`Represents ${stateName}'s ${ordinal(district)} congressional district.`)
    } else if (stateName) {
      pieces.push(`Represents ${stateName} in the U.S. House.`)
    }
    return pieces.join(' ')
  }

  // Build tenure timeline from per-Congress history when available, with the
  // Congress.gov member terms as a fallback for local/offline data.
  const buildTenureTimeline = () => {
    const sourceTerms = careerTerms.length > 0 ? careerTerms : memberTermsArray
    if (!sourceTerms || sourceTerms.length === 0) return []

    const normalized = sourceTerms.map((term) => {
      const congress = getTermCongress(term)
      const startYear = yearFromDate(term.term_start) || term.startYear || (congress ? null : 0)
      const endYear = term.term_end
        ? yearFromDate(term.term_end)
        : term.endYear || (congress ? getCongressEndYear(congress) : null)
      const chamberName = formatChamberName(term.chamber)
      const party = (term.caucus || term.party || '').toUpperCase()
      const districtLabel = term.district != null ? `${term.state}-${term.district}` : term.state
      const note = [chamberName, party, districtLabel].filter(Boolean).join(' · ')

      return {
        years: formatTermYears(term),
        congress,
        congressLabel: congress ? formatCongressLabel(congress) : '',
        chamber: chamberName,
        note,
        startYear: startYear || 0,
        termStart: term.term_start || `${term.startYear || ''}`,
        isCurrent: !term.term_end && !term.endYear && (!congress || congress === CONGRESS_MAX),
        endYear,
      }
    })
      .filter((term) => {
        if (term.congress) return term.congress >= BILL_CONGRESS_MIN
        return !term.endYear || term.endYear >= 2001
      })
      .sort((a, b) => {
        if (a.congress !== b.congress) return (a.congress || 0) - (b.congress || 0)
        return String(a.termStart).localeCompare(String(b.termStart))
      })

    return normalized.map((term, i, arr) => ({
      ...term,
      isLast: term.isCurrent || i === arr.length - 1,
    }))
  }

  const standfirst = buildStandfirst()
  const tenureItems = buildTenureTimeline()

  return (
    <div className="pol">
      <SEO
        title={`${displayName} — Voting Record`}
        description={`View ${displayName}'s congressional voting record, sponsored legislation, and campaign finance data.`}
        path={`/politician/${bioguideId}`}
        schema={{
          '@type': 'Person',
          name: displayName,
          jobTitle: title,
          affiliation: {
            '@type': 'GovernmentOrganization',
            name: 'United States Congress'
          },
          memberOf: { '@type': 'Organization', name: party },
          ...(member.depiction?.imageUrl && { image: member.depiction.imageUrl })
        }}
      />

      {/* CRUMB */}
      <nav className="pol-crumb">
        <Link to="/">BallotWatch</Link>
        <span className="pol-crumb-sep">/</span>
        <Link to="/all">Representatives</Link>
        <span className="pol-crumb-sep">/</span>
        <span>{stateAbbr}{district ? `-${district}` : ''}</span>
      </nav>

      {/* MASTHEAD */}
      <header className="pol-masthead">
        <div className="pol-photo-wrap">
          {!imageError ? (
            <img
              src={imageUrl}
              alt={displayName}
              className="pol-photo"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="pol-photo-placeholder">
              <span>{displayName.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
            </div>
          )}
        </div>
        <div className="pol-lede">
          <div className="pol-kicker">{title} · {currentTerm?.congress ? `${currentTerm.congress}th Congress` : ''}</div>
          <h1 className="pol-name">
            <span className="pol-name-first">{firstName}</span>
            {restName && ' '}
            {restName}
            {party && <span className={`pol-party-tag ${partyClass(party)}`}>{partyShort(party)}</span>}
          </h1>
          {standfirst && <p className="pol-standfirst">{standfirst}</p>}
          {SHOW_SPONSOR_FILTER && bioguideId && (
            <SponsorActivityBadge bioguideId={bioguideId} congress={currentTerm?.congress || CONGRESS_MAX} />
          )}
          <dl className="pol-meta-grid">
            {chamber && (
              <>
                <dt>Chamber</dt>
                <dd>{chamber}</dd>
              </>
            )}
            <dt>State</dt>
            <dd>{stateName}{stateAbbr ? <> <span className="pol-meta-mono">{stateAbbr}{district ? `-${district}` : ''}</span></> : null}</dd>
            {firstTermYear && firstTermYear !== Infinity && (
              <>
                <dt>In office</dt>
                <dd>Since <span className="pol-meta-mono">{firstTermYear}</span> · {termCount} term{termCount !== 1 ? 's' : ''}</dd>
              </>
            )}
            {member.birthYear && (
              <>
                <dt>Born</dt>
                <dd><span className="pol-meta-mono">{member.birthYear}</span></dd>
              </>
            )}
            {member.addressInformation?.officeAddress && (
              <>
                <dt>Office</dt>
                <dd>{member.addressInformation.officeAddress}</dd>
              </>
            )}
            {member.addressInformation?.phoneNumber && (
              <>
                <dt>Phone</dt>
                <dd>
                  <a href={`tel:${member.addressInformation.phoneNumber}`} className="pol-meta-link">
                    <span className="pol-meta-mono">{member.addressInformation.phoneNumber}</span>
                  </a>
                </dd>
              </>
            )}
          </dl>
          <div className="pol-actions">
            {member.officialWebsiteUrl && (
              <a href={member.officialWebsiteUrl} target="_blank" rel="noopener noreferrer" className="pol-action-btn primary">
                Official website ↗
              </a>
            )}
            {member.url && (
              <a href={member.url} target="_blank" rel="noopener noreferrer" className="pol-action-btn">
                Congress.gov ↗
              </a>
            )}
          </div>
        </div>
      </header>

      {/* TENURE TIMELINE */}
      {tenureItems.length > 0 && (
        <section className="pol-editorial">
          <div className="pol-section-label">Congress history · since 2001</div>
          <h2 className="pol-section-title">
            <em>{tenureItems.length}</em> record{tenureItems.length !== 1 ? 's' : ''} of service
          </h2>
          <div className="pol-tenure-grid">
            {tenureItems.map((t, i) => (
              <div key={`${t.congress || t.years}-${i}`} className={`pol-tenure-item ${t.isLast ? '' : 'pol-tenure-past'}`}>
                <div className="pol-tenure-year">{t.years}</div>
                <div className="pol-tenure-title">{t.congressLabel || t.chamber}</div>
                <div className="pol-tenure-note">{t.isCurrent ? 'Current term' : t.note || t.chamber}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* VOTES */}
      <section className="pol-editorial">
        <div className="pol-section-label">Voting record</div>
        <h2 className="pol-section-title">How <em>they voted</em></h2>
        <VoteDashboard bioguideId={bioguideId} />
      </section>

      {/* CAMPAIGN FINANCE */}
      <section className="pol-editorial">
        <div className="pol-section-label">Campaign finance · most recent cycle</div>
        <h2 className="pol-section-title">
          <InfoTip text="Money raised and spent for election campaigns, reported to the Federal Election Commission (FEC). Includes donations from individuals, PACs, and organizations.">Where the <em>money</em> comes from</InfoTip>
        </h2>
        {donationsLoading ? (
          <div className="pol-section-loading">
            <div className="loading-spinner"></div>
            <p>Loading campaign finance data...</p>
          </div>
        ) : donations ? (
          <div className="pol-money-grid">
            <div className="pol-money-summary">
              <div className="pol-money-big-number">{formatCurrency(donations.totalRaised)}</div>
              <div className="pol-money-big-label">Total raised</div>
              <div className="pol-money-splits">
                {donations.individualTotal > 0 && (
                  <div className="pol-money-split">
                    <div className="pol-money-split-v">{formatCurrency(donations.individualTotal)}</div>
                    <div className="pol-money-split-l">From individuals</div>
                  </div>
                )}
                {donations.pacTotal > 0 && (
                  <div className="pol-money-split">
                    <div className="pol-money-split-v">{formatCurrency(donations.pacTotal)}</div>
                    <div className="pol-money-split-l">From PACs</div>
                  </div>
                )}
              </div>
            </div>
            {industryData.length > 0 && (
              <div className="pol-industry-list">
                <h3 className="pol-rail-h3">By industry</h3>
                {industryData.slice(0, 8).map((sector, i) => {
                  const max = industryData[0]?.totalAmount || 1
                  const widthPct = Math.max((sector.totalAmount / max) * 100, 2)
                  return (
                    <div key={i} className="pol-ind-row">
                      <div className="pol-ind-label">{sector.industry}</div>
                      <div className="pol-ind-bar"><div className="pol-ind-fill" style={{ width: `${widthPct}%` }}></div></div>
                      <div className="pol-ind-amount">{formatCompact(sector.totalAmount)}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <p className="pol-no-data">Campaign finance data not available for this politician.</p>
        )}

        {/* MONEY-VOTES CORRELATION */}
        {correlationData.length > 0 && (
          <div className="pol-correlation-block">
            <h3 className="pol-correlation-h3">
              <InfoTip text="How often this politician votes 'Yea' on bills related to the industries that fund them. Based on FEC donation data matched to Congress.gov bill policy areas.">Money &amp; votes correlation</InfoTip>
            </h3>
            <div className="pol-correlation-grid">
              {correlationData.map((corr, i) => (
                <div key={i} className="pol-correlation-card">
                  <div className="pol-correlation-industry">{corr.industry}</div>
                  <div className="pol-correlation-stats">
                    <span className="pol-correlation-donated">{formatCompact(corr.donationAmount)} donated</span>
                    <span className="pol-correlation-votes">
                      Voted Yea {corr.yeaPercent}% on {corr.billsVotedOn} related bill{corr.billsVotedOn !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="pol-correlation-bar"><div className="pol-correlation-fill" style={{ width: `${corr.yeaPercent}%` }}></div></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TOP DONORS */}
        {donations?.donors && donations.donors.length > 0 && (
          <div className="pol-donors-block">
            <h3 className="pol-correlation-h3">Top donors</h3>
            <div className="pol-donors-list">
              {donations.donors.slice(0, 10).map((donor, i) => (
                <div key={i} className="pol-donor-row">
                  <div className="pol-donor-info">
                    <span className="pol-donor-name">{donor.name}</span>
                    {donor.entityType && donor.entityType !== 'IND' && (
                      <span className={`pol-donor-entity entity-${donor.entityType.toLowerCase()}`}>
                        {donor.entityType === 'COM' ? 'PAC' : 'ORG'}
                      </span>
                    )}
                    {donor.employer && <span className="pol-donor-employer">{donor.employer}</span>}
                  </div>
                  <span className="pol-donor-amount">{formatCurrency(donor.totalAmount)}</span>
                </div>
              ))}
            </div>
            {donations.candidate?.id && (
              <a href={`https://www.fec.gov/data/candidate/${donations.candidate.id}/`} target="_blank" rel="noopener noreferrer" className="pol-fec-link">
                View full FEC records ↗
              </a>
            )}
          </div>
        )}
      </section>

      {/* VOTING PATTERN ANALYSIS */}
      <section className="pol-editorial">
        <VotingPatternAnalysis member={{ ...member, bioguideId, state: stateAbbr, district, party }} />
      </section>

      {member.depiction?.attribution && (
        <div className="pol-photo-attribution">
          Photo: {member.depiction.attribution}
        </div>
      )}
    </div>
  )
}

function ordinal(n) {
  const i = parseInt(n, 10)
  if (isNaN(i)) return n
  if (i === 0) return 'at-large'
  const s = ['th', 'st', 'nd', 'rd']
  const v = i % 100
  return i + (s[(v - 20) % 10] || s[v] || s[0])
}

export default PoliticianDetail
