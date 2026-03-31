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

// State-level TopoJSON. District-level requires self-hosted data (future enhancement).
const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json'

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
  '56': 'WY',
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
  'WI': 'Wisconsin', 'WY': 'Wyoming',
}

function DistrictMap() {
  const navigate = useNavigate()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [hoveredState, setHoveredState] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [selectedState, setSelectedState] = useState(null)
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

  // Group members by state, compute majority party per state
  const stateData = useMemo(() => {
    const byState = {}
    members.forEach(m => {
      const st = m.state
      if (!st) return
      if (!byState[st]) byState[st] = { members: [], dem: 0, rep: 0, ind: 0 }
      byState[st].members.push(m)
      const party = (m.partyName || m.party || '').toLowerCase()
      if (party.includes('democrat') || party === 'd') byState[st].dem++
      else if (party.includes('republican') || party === 'r') byState[st].rep++
      else byState[st].ind++
    })
    return byState
  }, [members])

  const getStateColor = (stateAbbr) => {
    const data = stateData[stateAbbr]
    if (!data) return '#E8E6E1'
    if (data.dem > data.rep) return '#2563EB'
    if (data.rep > data.dem) return '#DC2626'
    return '#7C3AED' // tie or all independent
  }

  const getStateHoverColor = (stateAbbr) => {
    const data = stateData[stateAbbr]
    if (!data) return '#D4D2CD'
    if (data.dem > data.rep) return '#1D4ED8'
    if (data.rep > data.dem) return '#B91C1C'
    return '#6D28D9'
  }

  const handleStateClick = (geo) => {
    const fips = geo.id
    const stateAbbr = FIPS_TO_STATE[fips]
    if (stateAbbr && stateData[stateAbbr]) {
      setSelectedState(stateAbbr)
    }
  }

  const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.5, 8))
  const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.5, 1))
  const handleReset = () => { setZoom(1); setCenter([-96, 38]); setSelectedState(null) }

  const selectedMembers = selectedState ? (stateData[selectedState]?.members || []) : []

  return (
    <div className="district-map-page">
      <SEO
        title="Congressional Map"
        description="Interactive map of the United States showing congressional representation by party. Click any state to see its representatives."
        path="/map"
      />

      <div className="map-header">
        <h1 className="map-title">Congressional Map</h1>
        <p className="map-subtitle">
          Click any state to view its representatives
        </p>
      </div>

      <div className="map-legend">
        <span className="legend-item">
          <span className="legend-dot legend-dem"></span>
          Democrat majority
        </span>
        <span className="legend-item">
          <span className="legend-dot legend-rep"></span>
          Republican majority
        </span>
        <span className="legend-item">
          <span className="legend-dot legend-ind"></span>
          Split / Independent
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
                    const fips = geo.id
                    const stateAbbr = FIPS_TO_STATE[fips]
                    const isHovered = hoveredState === fips
                    const isSelected = selectedState === stateAbbr

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={isHovered || isSelected
                          ? getStateHoverColor(stateAbbr)
                          : getStateColor(stateAbbr)}
                        stroke="#FFFFFF"
                        strokeWidth={isSelected ? 1.5 : 0.5}
                        onClick={() => handleStateClick(geo)}
                        onMouseEnter={(e) => {
                          setHoveredState(fips)
                          setTooltipPos({ x: e.clientX, y: e.clientY })
                        }}
                        onMouseMove={(e) => {
                          setTooltipPos({ x: e.clientX, y: e.clientY })
                        }}
                        onMouseLeave={() => setHoveredState(null)}
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
          {hoveredState && !selectedState && (() => {
            const stateAbbr = FIPS_TO_STATE[hoveredState]
            const data = stateData[stateAbbr]
            return (
              <div
                className="map-tooltip"
                style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 40 }}
              >
                <span className="tooltip-state">{STATE_NAMES[stateAbbr] || stateAbbr}</span>
                {data ? (
                  <span className="tooltip-counts">
                    {data.dem > 0 && <span className="tooltip-dem">{data.dem}D</span>}
                    {data.rep > 0 && <span className="tooltip-rep"> {data.rep}R</span>}
                    {data.ind > 0 && <span className="tooltip-ind"> {data.ind}I</span>}
                  </span>
                ) : (
                  <span className="tooltip-counts">No data</span>
                )}
              </div>
            )
          })()}
        </div>

        {/* Side panel: representatives for selected state */}
        {selectedState && (
          <div className="map-panel">
            <div className="panel-header">
              <h2 className="panel-title">{STATE_NAMES[selectedState]}</h2>
              <button className="panel-close" onClick={() => setSelectedState(null)} aria-label="Close panel">
                Close
              </button>
            </div>

            <div className="panel-counts">
              {stateData[selectedState]?.dem > 0 && (
                <span className="panel-count panel-count-dem">{stateData[selectedState].dem} Democrat</span>
              )}
              {stateData[selectedState]?.rep > 0 && (
                <span className="panel-count panel-count-rep">{stateData[selectedState].rep} Republican</span>
              )}
              {stateData[selectedState]?.ind > 0 && (
                <span className="panel-count panel-count-ind">{stateData[selectedState].ind} Independent</span>
              )}
            </div>

            <div className="panel-members">
              {selectedMembers.map((m, i) => {
                const party = (m.partyName || m.party || '').toLowerCase()
                const partyClass = party.includes('democrat') ? 'member-dem'
                  : party.includes('republican') ? 'member-rep'
                  : 'member-ind'

                return (
                  <button
                    key={m.bioguideId || i}
                    className={`panel-member ${partyClass}`}
                    onClick={() => m.bioguideId && navigate(`/politician/${m.bioguideId}`)}
                  >
                    <div className="member-info">
                      <span className="member-name">{m.name}</span>
                      <span className="member-role">
                        {m.chamber === 'Senate' ? 'Senator' : `District ${m.district || 'At-Large'}`}
                      </span>
                    </div>
                    <span className="member-party-badge">{m.partyName || m.party}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DistrictMap
