import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Footer from './Footer'
import SEO from './SEO'
import { getAllCurrentMembers } from '../services/congress'
import { filterMembersByName } from '../utils/searchFilter'
import { getLeadershipTitle, isLeadership } from '../data/leadership'
import { toStateAbbr, toStateName } from '../utils/states'
import '../styles/AllPoliticians.css'

const HOUSE_SEATS = 435
const SENATE_SEATS = 100
const PAGE_SIZE = 24

function partyLetter(party) {
  const p = String(party || '').toLowerCase()
  if (p.startsWith('d')) return 'D'
  if (p.startsWith('r')) return 'R'
  if (p.startsWith('i')) return 'I'
  return party ? String(party).charAt(0).toUpperCase() : '?'
}

// Congress.gov returns names as "Last, First [Suffix]"; flip to reading order.
function displayName(member) {
  const raw = member.name || `${member.firstName || ''} ${member.lastName || ''}`.trim()
  if (raw.includes(',')) {
    const [last, rest] = raw.split(',')
    return `${rest.trim()} ${last.trim()}`.trim()
  }
  return raw
}

function initialsOf(name) {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function locationOf(member) {
  if (member.chamber === 'senate') return toStateName(member.state)
  const abbr = toStateAbbr(member.state)
  return member.district ? `${abbr}-${member.district}` : abbr
}

// One composition bar (House or Senate). Segments are derived from the members
// actually loaded; vacant seats are inferred from the chamber's fixed size.
function CompositionBlock({ name, total, majority, counts }) {
  const segs = [
    { cls: 'r', label: 'Republican', n: counts.R },
    { cls: 'd', label: 'Democrat', n: counts.D },
    { cls: 'i', label: 'Independent', n: counts.I },
    { cls: 'v', label: 'Vacant', n: counts.vacant },
  ].filter((s) => s.n > 0)

  return (
    <div className="comp-block">
      <div className="comp-head">
        <span className="ch-name">{name}</span>
        <span className="ch-total">{total} seats / majority {majority}</span>
      </div>
      <div className="comp-bar">
        {segs.map((s) => (
          <div key={s.cls} className={`comp-seg ${s.cls}`} style={{ flex: s.n }} title={`${s.label}: ${s.n}`}>
            {s.cls === 'v' ? '' : `${s.n} ${s.cls.toUpperCase()}`}
          </div>
        ))}
      </div>
      <div className="comp-legend">
        {segs.map((s) => (
          <span key={s.cls}><i className={`lg-${s.cls}`}></i>{s.label} {s.n}</span>
        ))}
      </div>
    </div>
  )
}

function MemberCard({ member, onClick }) {
  const [imgFailed, setImgFailed] = useState(false)
  const name = displayName(member)
  const letter = partyLetter(member.party || member.partyName)
  const bioguideId = member.bioguideId || member.bioguide_id
  const imageUrl = !imgFailed
    ? (member.imageUrl || (bioguideId ? `https://www.congress.gov/img/member/${bioguideId.toLowerCase()}.jpg` : null))
    : null
  const role = member.chamber === 'senate' ? 'Senator' : 'Representative'
  const leaderTitle = getLeadershipTitle(bioguideId)

  return (
    <button type="button" className={`member-card ${letter.toLowerCase()}`} onClick={onClick}>
      <div className="mc-photo">
        {imageUrl && <img src={imageUrl} alt="" onError={() => setImgFailed(true)} />}
        <div className="mc-monogram">{initialsOf(name)}</div>
      </div>
      <div className="mc-body">
        <div className="mc-role">{role}</div>
        <div className="mc-name">{name}</div>
        {leaderTitle && <div className="mc-leader">{leaderTitle}</div>}
        <div className="mc-foot">
          <span className="mc-loc">{locationOf(member)}</span>
          <span className={`ptag ${letter.toLowerCase()}`}>{letter}</span>
        </div>
      </div>
    </button>
  )
}

function AllPoliticians() {
  const navigate = useNavigate()
  const [allMembers, setAllMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [chamberFilter, setChamberFilter] = useState('all')
  const [partyFilter, setPartyFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState('all')
  const [chip, setChip] = useState('all') // all | leadership | house | senate
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        setLoading(true)
        await getAllCurrentMembers((batchMembers) => {
          setAllMembers(batchMembers)
          setLoading(false)
        })
      } catch (err) {
        console.error('[AllPoliticians] Error loading politicians:', err)
        let errorMessage
        if (err.response?.status === 401 || err.response?.status === 403) {
          errorMessage = 'Congress.gov API key is invalid or expired. Get a free key at: https://api.congress.gov/sign-up/'
        } else if (err.response?.status === 429) {
          errorMessage = 'API rate limit exceeded. Please wait a moment and try again.'
        } else if (err.response?.status >= 500) {
          errorMessage = 'Congress.gov API server error. Please try again later.'
        } else if (err.code === 'NETWORK_ERROR' || err.message?.includes('Network')) {
          errorMessage = 'Network error. Please check your internet connection.'
        } else {
          errorMessage = `Failed to load politicians: ${err.message || 'Unknown error'}`
        }
        setError(errorMessage)
      } finally {
        setLoading(false)
      }
    }
    fetchMembers()
  }, [])

  // Chamber party composition derived from the members actually loaded.
  const composition = useMemo(() => {
    const blank = () => ({ R: 0, D: 0, I: 0 })
    const house = blank()
    const senate = blank()
    for (const m of allMembers) {
      const bucket = m.chamber === 'senate' ? senate : house
      const l = partyLetter(m.party || m.partyName)
      if (l === 'R' || l === 'D' || l === 'I') bucket[l] += 1
    }
    const houseTotal = house.R + house.D + house.I
    const senateTotal = senate.R + senate.D + senate.I
    return {
      house: { ...house, vacant: Math.max(0, HOUSE_SEATS - houseTotal) },
      senate: { ...senate, vacant: Math.max(0, SENATE_SEATS - senateTotal) },
    }
  }, [allMembers])

  const filteredMembers = useMemo(() => {
    let filtered = [...allMembers]
    if (searchTerm) filtered = filterMembersByName(filtered, searchTerm)
    if (chamberFilter !== 'all') filtered = filtered.filter((m) => m.chamber?.toLowerCase() === chamberFilter)
    if (partyFilter !== 'all') filtered = filtered.filter((m) => partyLetter(m.party || m.partyName) === partyFilter)
    if (stateFilter !== 'all') filtered = filtered.filter((m) => m.state === stateFilter)

    // Quick-filter chips layer on top of the select filters.
    if (chip === 'house') filtered = filtered.filter((m) => m.chamber !== 'senate')
    else if (chip === 'senate') filtered = filtered.filter((m) => m.chamber === 'senate')
    else if (chip === 'leadership') filtered = filtered.filter((m) => isLeadership(m.bioguideId || m.bioguide_id))

    filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    return filtered
  }, [allMembers, searchTerm, chamberFilter, partyFilter, stateFilter, chip])

  // Reset paging whenever the result set changes.
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [searchTerm, chamberFilter, partyFilter, stateFilter, chip])

  const uniqueStates = useMemo(
    () => [...new Set(allMembers.map((m) => m.state).filter(Boolean))].sort(),
    [allMembers]
  )

  const visibleMembers = filteredMembers.slice(0, visibleCount)
  const hasMore = visibleCount < filteredMembers.length

  if (loading) {
    return (
      <div className="all-politicians-loading">
        <div className="loading-spinner"></div>
        <p>Loading members...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="all-politicians-error">
        <div className="error-message">{error}</div>
        <p className="error-help">Need help? Check the API_GUIDE.md file in the project for setup instructions.</p>
      </div>
    )
  }

  const CHIPS = [
    { key: 'all', label: 'All' },
    { key: 'leadership', label: 'Leadership' },
    { key: 'house', label: 'House' },
    { key: 'senate', label: 'Senate' },
  ]

  return (
    <div className="bw members-register">
      <SEO
        title="All Members of Congress"
        description="Browse all 535 members of the U.S. Congress. Filter by chamber, party, and state. View voting records and profiles."
        path="/all"
      />

      <header className="page-masthead">
        <div className="pm-inner">
          <span className="pm-kicker kicker">Who Represents America / 119th Congress</span>
          <h1 className="pm-title">The Members <em>Register</em></h1>
          <p className="pm-deck">All 535 voting members of the U.S. House and Senate. Search by name, filter by chamber, party or state, then open any profile to read the full voting record.</p>
          <div className="composition">
            <CompositionBlock name="House" total={HOUSE_SEATS} majority={218} counts={composition.house} />
            <CompositionBlock name="Senate" total={SENATE_SEATS} majority={51} counts={composition.senate} />
          </div>
        </div>
      </header>

      <div className="search-shell">
        <div className="ss-inner">
          <label className="search-field">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input
              type="text"
              placeholder="Search members by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </label>
          <select className="filter-pill" aria-label="Chamber" value={chamberFilter} onChange={(e) => setChamberFilter(e.target.value)}>
            <option value="all">All chambers</option>
            <option value="house">House of Representatives</option>
            <option value="senate">Senate</option>
          </select>
          <select className="filter-pill" aria-label="Party" value={partyFilter} onChange={(e) => setPartyFilter(e.target.value)}>
            <option value="all">All parties</option>
            <option value="D">Democrat</option>
            <option value="R">Republican</option>
            <option value="I">Independent</option>
          </select>
          <select className="filter-pill" aria-label="State" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="all">All states</option>
            {uniqueStates.map((state) => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="members-toolbar">
        <div className="mt-bar">
          <div className="mt-count">Showing <b>{visibleMembers.length}</b> of <b>{filteredMembers.length}</b> members / sorted by surname</div>
          <div className="mt-chips">
            {CHIPS.map((c) => (
              <button key={c.key} className={`mt-chip ${chip === c.key ? 'active' : ''}`} onClick={() => setChip(c.key)}>{c.label}</button>
            ))}
          </div>
        </div>
      </div>

      {visibleMembers.length > 0 ? (
        <>
          <main className="members-grid">
            {visibleMembers.map((member) => (
              <MemberCard
                key={member.bioguideId || member.id}
                member={member}
                onClick={() => {
                  const id = member.bioguideId || member.bioguide_id
                  if (id) navigate(`/politician/${id}`)
                }}
              />
            ))}
          </main>
          {hasMore && (
            <div className="members-foot">
              <button className="btn btn-ghost" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>Load more members</button>
            </div>
          )}
        </>
      ) : (
        <div className="members-empty">No members found matching your criteria</div>
      )}

      <Footer />
    </div>
  )
}

export default AllPoliticians
