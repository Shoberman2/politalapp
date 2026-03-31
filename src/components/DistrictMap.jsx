import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps'
import { getAllCurrentMembers } from '../services/congress'
import SEO from './SEO'
import '../styles/DistrictMap.css'

// Self-hosted 119th Congress district boundaries (from Census Bureau cb_2024_us_cd119_500k)
const GEO_URL = '/cd119.json'

const FIPS_TO_STATE = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY', '72': 'PR', '78': 'VI', '66': 'GU', '69': 'MP', '60': 'AS',
}

const STATE_NAMES = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
  'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
  'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
  'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
  'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
  'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
  'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
  'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
  'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
  'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
  'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia',
}

function DistrictMap() {
  const navigate = useNavigate()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [hoveredDistrict, setHoveredDistrict] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [selectedDistrict, setSelectedDistrict] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [center, setCenter] = useState([-96, 38])

  useEffect(() => {
    loadMembers()
  }, [])

  const loadMembers = async () => {
    try {
      const allMembers = await getAllCurrentMembers()
      setMembers(allMembers || [])
    } catch (err) {
      console.error('[DistrictMap] Failed to load members:', err)
    } finally {
      setLoading(false)
    }
  }

  // Build lookup: "STATE-DISTRICT" -> member
  const memberLookup = useMemo(() => {
    const lookup = {}
    members.forEach(m => {
      if (!m.state || m.chamber === 'senate') return
      const dist = m.district != null ? String(m.district) : '0'
      lookup[`${m.state}-${dist}`] = m
    })
    // Also store senators by state for the panel
    members.forEach(m => {
      if (m.chamber === 'senate') {
        const key = `sen-${m.state}`
        if (!lookup[key]) lookup[key] = []
        if (Array.isArray(lookup[key])) lookup[key].push(m)
      }
    })
    return lookup
  }, [members])

  const getDistrictMember = (geo) => {
    const props = geo.properties || {}
    const stateFips = props.STATEFP
    const districtNum = props.CD119FP
    const stateAbbr = FIPS_TO_STATE[stateFips]
    if (!stateAbbr) return { stateAbbr: '', district: '', member: null }
    // At-large districts show as "00" or "98"
    const dist = (!districtNum || districtNum === '00' || districtNum === '98') ? '0' : String(parseInt(districtNum, 10))
    const member = memberLookup[`${stateAbbr}-${dist}`]
    return { stateAbbr, district: dist, member }
  }

  const getPartyColor = (member) => {
    if (!member) return '#E8E6E1'
    const party = (member.partyName || member.party || '').toLowerCase()
    if (party.includes('democrat') || party === 'd') return '#2563EB'
    if (party.includes('republican') || party === 'r') return '#DC2626'
    return '#7C3AED'
  }

  const getPartyHoverColor = (member) => {
    if (!member) return '#D4D2CD'
    const party = (member.partyName || member.party || '').toLowerCase()
    if (party.includes('democrat') || party === 'd') return '#1D4ED8'
    if (party.includes('republican') || party === 'r') return '#B91C1C'
    return '#6D28D9'
  }

  const handleDistrictClick = (geo) => {
    const { stateAbbr, district, member } = getDistrictMember(geo)
    setSelectedDistrict({ stateAbbr, district, member, geo })
  }

  const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.5, 12))
  const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.5, 1))
  const handleReset = () => { setZoom(1); setCenter([-96, 38]); setSelectedDistrict(null) }

  // Get senators for selected state
  const selectedSenators = selectedDistrict
    ? (memberLookup[`sen-${selectedDistrict.stateAbbr}`] || [])
    : []

  return (
    <div className="district-map-page">
      <SEO
        title="Congressional District Map"
        description="Interactive map of all 435 congressional districts, color-coded by party. Click any district to see your representative."
        path="/map"
      />

      <div className="map-header">
        <h1 className="map-title">Congressional District Map</h1>
        <p className="map-subtitle">
          All 435 House districts, colored by party. Click any district to see who represents it.
        </p>
      </div>

      <div className="map-legend">
        <span className="legend-item">
          <span className="legend-dot legend-dem"></span>
          Democrat
        </span>
        <span className="legend-item">
          <span className="legend-dot legend-rep"></span>
          Republican
        </span>
        <span className="legend-item">
          <span className="legend-dot legend-ind"></span>
          Independent
        </span>
      </div>

      <div className="map-and-panel">
        <div className="map-container">
          {loading && (
            <div className="map-loading">
              <div className="loading-spinner"></div>
              <p>Loading member data...</p>
            </div>
          )}

          <div className="map-controls">
            <button onClick={handleZoomIn} className="map-control-btn" aria-label="Zoom in">+</button>
            <button onClick={handleZoomOut} className="map-control-btn" aria-label="Zoom out">-</button>
            <button onClick={handleReset} className="map-control-btn map-control-reset" aria-label="Reset view">Reset</button>
          </div>

          <ComposableMap
            projection="geoAlbersUsa"
            projectionConfig={{ scale: 1000 }}
            className="map-svg"
          >
            <ZoomableGroup
              zoom={zoom}
              center={center}
              onMoveEnd={({ coordinates, zoom: z }) => {
                setCenter(coordinates)
                setZoom(z)
              }}
            >
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const { member } = getDistrictMember(geo)
                    const geoId = geo.properties?.GEOID || geo.rsmKey
                    const isHovered = hoveredDistrict === geoId
                    const isSelected = selectedDistrict?.geo?.rsmKey === geo.rsmKey

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={isHovered || isSelected
                          ? getPartyHoverColor(member)
                          : getPartyColor(member)}
                        stroke="#FFFFFF"
                        strokeWidth={isSelected ? 1.2 : 0.2}
                        onClick={() => handleDistrictClick(geo)}
                        onMouseEnter={(e) => {
                          setHoveredDistrict(geoId)
                          setTooltipPos({ x: e.clientX, y: e.clientY })
                        }}
                        onMouseMove={(e) => {
                          setTooltipPos({ x: e.clientX, y: e.clientY })
                        }}
                        onMouseLeave={() => setHoveredDistrict(null)}
                        style={{
                          default: { outline: 'none', cursor: 'pointer' },
                          hover: { outline: 'none', cursor: 'pointer' },
                          pressed: { outline: 'none' },
                        }}
                      />
                    )
                  })
                }
              </Geographies>
            </ZoomableGroup>
          </ComposableMap>

          {/* Tooltip */}
          {hoveredDistrict && !selectedDistrict && (() => {
            // Find the hovered geography's data from the DOM isn't possible,
            // but we stored enough in hoveredDistrict. Parse GEOID: "SSDD"
            const stateFips = hoveredDistrict.substring(0, 2)
            const distNum = parseInt(hoveredDistrict.substring(2), 10)
            const stateAbbr = FIPS_TO_STATE[stateFips] || ''
            const dist = (distNum === 0 || distNum === 98) ? '0' : String(distNum)
            const member = memberLookup[`${stateAbbr}-${dist}`]

            return (
              <div
                className="map-tooltip"
                style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 40 }}
              >
                <span className="tooltip-district">
                  {stateAbbr}{distNum === 0 || distNum === 98 ? ' At-Large' : `-${distNum}`}
                </span>
                {member ? (
                  <>
                    <span className="tooltip-name">{member.name}</span>
                    <span className={`tooltip-party ${
                      (member.partyName || '').toLowerCase().includes('democrat') ? 'tooltip-dem' :
                      (member.partyName || '').toLowerCase().includes('republican') ? 'tooltip-rep' :
                      'tooltip-ind'
                    }`}>
                      {member.partyName || member.party}
                    </span>
                  </>
                ) : (
                  <span className="tooltip-name">No data</span>
                )}
              </div>
            )
          })()}
        </div>

        {/* Side panel */}
        {selectedDistrict && (
          <div className="map-panel">
            <div className="panel-header">
              <h2 className="panel-title">
                {STATE_NAMES[selectedDistrict.stateAbbr] || selectedDistrict.stateAbbr}
                {selectedDistrict.district !== '0'
                  ? `, District ${selectedDistrict.district}`
                  : ' (At-Large)'}
              </h2>
              <button className="panel-close" onClick={() => setSelectedDistrict(null)} aria-label="Close">
                Close
              </button>
            </div>

            {/* House Rep */}
            {selectedDistrict.member && (
              <div className="panel-section">
                <span className="panel-section-label">House Representative</span>
                <button
                  className={`panel-member ${
                    (selectedDistrict.member.partyName || '').toLowerCase().includes('democrat') ? 'member-dem' :
                    (selectedDistrict.member.partyName || '').toLowerCase().includes('republican') ? 'member-rep' :
                    'member-ind'
                  }`}
                  onClick={() => navigate(`/politician/${selectedDistrict.member.bioguideId}`)}
                >
                  <div className="member-info">
                    <span className="member-name">{selectedDistrict.member.name}</span>
                    <span className="member-role">{selectedDistrict.member.partyName || selectedDistrict.member.party}</span>
                  </div>
                  <span className="member-arrow">View Profile &rsaquo;</span>
                </button>
              </div>
            )}

            {/* Senators */}
            {selectedSenators.length > 0 && (
              <div className="panel-section">
                <span className="panel-section-label">Senators from {selectedDistrict.stateAbbr}</span>
                {selectedSenators.map((sen, i) => (
                  <button
                    key={sen.bioguideId || i}
                    className={`panel-member ${
                      (sen.partyName || '').toLowerCase().includes('democrat') ? 'member-dem' :
                      (sen.partyName || '').toLowerCase().includes('republican') ? 'member-rep' :
                      'member-ind'
                    }`}
                    onClick={() => navigate(`/politician/${sen.bioguideId}`)}
                  >
                    <div className="member-info">
                      <span className="member-name">{sen.name}</span>
                      <span className="member-role">{sen.partyName || sen.party}</span>
                    </div>
                    <span className="member-arrow">View Profile &rsaquo;</span>
                  </button>
                ))}
              </div>
            )}

            {!selectedDistrict.member && selectedSenators.length === 0 && (
              <p className="panel-empty">No representative data available for this district.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default DistrictMap
