import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import SEO from './SEO'
import { InfoDot } from './Term'
import SenateChamberMap from './SenateChamberMap'
import ChamberScrubber from './ChamberScrubber'
import DeskLineagePanel from './DeskLineagePanel'
import HouseCompositionMap from './HouseCompositionMap'
import HistoricMomentOverlay from './HistoricMomentOverlay'
import {
  CONGRESS_MIN,
  CONGRESS_MAX,
  getCurrentCongress,
  parseCongressParam,
  formatCongressLabel,
  InvalidCongressError,
} from '../utils/congressUtil'
import { getChamberForCongress } from '../services/senateDesks'
import { getMembersByCongress } from '../services/memberTerms'
import { partyLetter } from '../utils/partyLetter'
import {
  getAllCongressMetadata,
  getCongressMetadata,
} from '../services/congressMetadata'
import { getFidelityInfo } from '../../shared/fidelity'
import { historicMoments } from '../data/historicMoments'
import '../styles/Chamber.css'

/**
 * ChamberPage: root component for /chamber routes.
 *
 * Hosts both the Senate hemicycle and the House composition view, controlled
 * by a chamber toggle at the top. Default view is Senate (the eureka feature).
 *
 * Routes:
 *   /chamber                      : current Congress, Senate view
 *   /chamber/:congress            : specific Congress, Senate view
 *   /chamber/:congress/house      : House composition for Congress
 *   /chamber/desk/:deskId         : Senate view with lineage panel open
 *   /chamber/moment/:slug         : Senate view with moment overlay active
 *
 * Responsive: switches to mobile compact-hemicycle layout below 768px
 * (handled by SenateChamberMap via isMobile prop).
 */

const MOBILE_BREAKPOINT_PX = 768

// Fewer assigned desks than this and the Senate view shows composition, not desks.
const MIN_ASSIGNED_DESKS = 50

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.innerWidth < MOBILE_BREAKPOINT_PX
  )
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT_PX)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

function ChamberPage() {
  const navigate = useNavigate()
  const params = useParams()
  const location = useLocation()
  const isMobile = useIsMobile()

  // ---- 1. Resolve the Congress from URL or default ----
  const [congress, setCongress] = useState(() => resolveCongress(params))
  useEffect(() => {
    const next = resolveCongress(params)
    if (next !== congress) setCongress(next)
  }, [params.congress, params.momentSlug])

  // ---- 2. Chamber toggle: 'senate' (default) or 'house' ----
  // /chamber/:congress/house uses a literal 'house' path segment, not a route
  // param, so we resolve via pathname. Stays in sync as the user toggles.
  const isHousePath = location.pathname.endsWith('/house')
  const [chamberView, setChamberView] = useState(isHousePath ? 'house' : 'senate')
  useEffect(() => {
    setChamberView(isHousePath ? 'house' : 'senate')
  }, [isHousePath])

  // ---- 3. Selected desk for lineage drawer ----
  const [selectedDesk, setSelectedDesk] = useState(null)

  // ---- 4. Active historic moment ----
  const [activeMomentSlug, setActiveMomentSlug] = useState(
    params.momentSlug ?? null
  )

  // ---- 5. Hover state for tooltip / mobile reveal ----
  const [hoveredDesk, setHoveredDesk] = useState(null)

  // ---- 6. Data loading state ----
  const [desks, setDesks] = useState([])
  const [houseMembers, setHouseMembers] = useState([])
  const [senateMembers, setSenateMembers] = useState([])
  const [congressMeta, setCongressMeta] = useState(null)
  const [metadataByCongress, setMetadataByCongress] = useState(new Map())
  const [loading, setLoading] = useState(true)

  // Load all-congresses metadata once (for scrubber fidelity row).
  useEffect(() => {
    let cancelled = false
    getAllCongressMetadata().then((rows) => {
      if (cancelled) return
      const m = new Map()
      for (const r of rows) m.set(r.congress, r)
      setMetadataByCongress(m)
    })
    return () => { cancelled = true }
  }, [])

  // Load chamber data when congress / view changes.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const meta = await getCongressMetadata(congress)
        if (cancelled) return
        setCongressMeta(meta)

        if (chamberView === 'senate') {
          const [chamberRows, senators] = await Promise.all([
            getChamberForCongress(congress),
            getMembersByCongress(congress, 'senate'),
          ])
          if (cancelled) return
          setDesks(chamberRows)
          setSenateMembers(senators)
        } else {
          const members = await getMembersByCongress(congress, 'house')
          if (cancelled) return
          setHouseMembers(members)
        }
      } catch (err) {
        console.error('[ChamberPage] load failed', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [congress, chamberView])

  // Restore a desk drawer from a deep link once the chamber data is ready.
  useEffect(() => {
    const deskId = Number(params.deskId)
    if (!params.deskId || !Number.isInteger(deskId) || desks.length === 0) {
      setSelectedDesk(null)
      return
    }
    const linkedDesk = desks.find((desk) => desk.desk_id === deskId)
    if (!linkedDesk) {
      setSelectedDesk(null)
      return
    }
    setSelectedDesk((current) =>
      current === linkedDesk ? current : linkedDesk
    )
  }, [params.deskId, desks])

  // ---- 7. Active moment shape for SenateChamberMap ----
  // For v1, votes-by-bioguide come from the historic moment's pre-loaded
  // votesByBioguide map. P5 backfill of historical votes will eventually
  // hydrate this from the DB.
  const activeMoment = useMemo(() => {
    if (!activeMomentSlug) return null
    const moment = historicMoments.find((m) => m.slug === activeMomentSlug)
    if (!moment) return null
    return {
      ...moment,
      votesByBioguide: new Map(Object.entries(moment.votes ?? {})),
    }
  }, [activeMomentSlug])

  // ---- 8. Handlers ----
  const handleCongressChange = useCallback(
    (next) => {
      setCongress(next)
      navigate(chamberView === 'house'
        ? `/chamber/${next}/house`
        : `/chamber/${next}`,
        { replace: true })
    },
    [chamberView, navigate]
  )

  const handleDeskClick = useCallback((desk) => {
    setSelectedDesk(desk)
    navigate(`/chamber/${congress}/desk/${desk.desk_id}`)
  }, [congress, navigate])

  const handleDrawerClose = useCallback(() => {
    setSelectedDesk(null)
    if (params.deskId) navigate(`/chamber/${congress}`, { replace: true })
  }, [congress, navigate, params.deskId])

  const handleMomentChange = useCallback((slug) => {
    setActiveMomentSlug(slug)
  }, [])

  const handleMomentCongressMismatch = useCallback((momentCongress) => {
    // Auto-scrub to the moment's Congress.
    handleCongressChange(momentCongress)
  }, [handleCongressChange])

  // ---- 9. Render ----
  // A desk chart needs desk assignments. When fewer than half the desks have
  // a senator on record, a chart of empty desks says nothing: show party
  // composition from the members who served instead, and say so.
  const assignedDesks = desks.filter((d) => d.assignment?.bioguide_id).length
  const recordedTier = congressMeta?.fidelity_tier ?? 'composition_only'
  const fidelityTier = chamberView === 'senate' && recordedTier !== 'composition_only' && assignedDesks < MIN_ASSIGNED_DESKS
    ? 'composition_only'
    : recordedTier
  const fidelityInfo = getFidelityInfo(fidelityTier)
  const congressLabel = formatCongressLabel(congress)

  const seoTitle = `The ${chamberView === 'house' ? 'House' : 'Senate'} Chamber · ${congressLabel} · BallotWatch`
  const seoDescription = `Interactive ${chamberView === 'house' ? 'House' : 'Senate'} chamber for the ${congressLabel}. ${chamberView === 'senate' ? 'Click any desk to see its history.' : 'Party composition view. House seating is open.'}`

  return (
    <div className="chamber-page">
      <SEO title={seoTitle} description={seoDescription} />

      <header className="chamber-header">
        <h1 className="chamber-title">
          The {chamberView === 'house' ? 'House' : 'Senate'} Chamber
          <InfoDot id={chamberView === 'house' ? 'house' : 'senate'} />
        </h1>
        <div className="chamber-subtitle">{congressLabel}</div>

        <div className="chamber-meta">
          {chamberView === 'senate' && (
            <span className="chamber-caption">
              {fidelityInfo.hasDeskData ? '100 desks' : '100 seats'}{congressMeta?.majority_party_senate
                ? ` · ${congressMeta.majority_party_senate} majority`
                : ''}
            </span>
          )}
          <span className="chamber-header-aside">
            <span
              className={`chamber-fidelity-dot-inline is-tier-${fidelityTier}`}
              aria-hidden="true"
            />
            <span className="chamber-fidelity-label">{fidelityInfo.label}</span>
          </span>
        </div>
      </header>

      {/* Chamber toggle */}
      <nav className="chamber-toggle" role="tablist" aria-label="Chamber selector">
        <button
          type="button"
          role="tab"
          aria-selected={chamberView === 'senate'}
          className={`chamber-toggle-btn btn-toggle ${chamberView === 'senate' ? 'is-active' : ''}`}
          onClick={() => {
            setChamberView('senate')
            navigate(`/chamber/${congress}`, { replace: true })
          }}
        >
          Senate
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={chamberView === 'house'}
          className={`chamber-toggle-btn btn-toggle ${chamberView === 'house' ? 'is-active' : ''}`}
          onClick={() => {
            setChamberView('house')
            navigate(`/chamber/${congress}/house`, { replace: true })
          }}
        >
          House
        </button>
      </nav>

      {/* The chamber visualization */}
      <section className="chamber-visual">
        {loading && (
          <div className="chamber-loading" role="status">
            Loading the chamber for the {congressLabel}…
          </div>
        )}
        {!loading && chamberView === 'senate' && (
          <SenateChamberMap
            desks={desks}
            members={senateMembers}
            fidelityTier={fidelityTier}
            onDeskClick={handleDeskClick}
            onDeskHover={setHoveredDesk}
            moment={activeMoment}
            isMobile={isMobile}
          />
        )}
        {!loading && chamberView === 'house' && (
          <HouseCompositionMap members={houseMembers} isMobile={isMobile} />
        )}

        {/* Desk readout: the hovered, focused or tapped desk in readable type */}
        {!loading && chamberView === 'senate' && fidelityInfo.hasDeskData && (
          <p className="chamber-readout" aria-live="polite">
            {hoveredDesk?.politician ? (
              <>
                <strong>{hoveredDesk.politician.name}</strong>{' '}
                <span className="chamber-readout-meta">
                  ({partyLetter(hoveredDesk.politician.party) || hoveredDesk.politician.party}-{hoveredDesk.politician.state}) · Desk {hoveredDesk.desk_id}
                </span>
              </>
            ) : hoveredDesk ? (
              <span className="chamber-readout-meta">Desk {hoveredDesk.desk_id} · unassigned</span>
            ) : (
              isMobile
                ? 'Tap any desk to read its history.'
                : 'Click any desk to read its history. Hover to see the senator who currently holds it.'
            )}
          </p>
        )}
      </section>

      {/* Scrubber */}
      <ChamberScrubber
        congress={congress}
        onCongressChange={handleCongressChange}
        metadataByCongress={metadataByCongress}
        isMobile={isMobile}
      />

      {/* Moments overlay (Senate view only) */}
      {chamberView === 'senate' && (
        <section className="chamber-moments">
          <HistoricMomentOverlay
            activeMomentSlug={activeMomentSlug}
            onMomentChange={handleMomentChange}
            congress={congress}
            onMomentCongressMismatch={handleMomentCongressMismatch}
          />
        </section>
      )}

      <footer className="chamber-footer">
        <Link to="/chamber/methodology" className="btn-text">Methodology and data sources</Link>
      </footer>

      {/* Slide-in drawer (desktop) / modal (mobile) for desk lineage */}
      {selectedDesk && (
        <DeskLineagePanel
          desk={selectedDesk}
          politician={selectedDesk.politician}
          onClose={handleDrawerClose}
          isMobile={isMobile}
        />
      )}
    </div>
  )
}

function resolveCongress(params) {
  // Order of preference: explicit :congress param, then the Congress of a
  // linked historic moment, then the current Congress.
  if (!params.congress && params.momentSlug) {
    const moment = historicMoments.find((m) => m.slug === params.momentSlug)
    if (moment?.congress) return moment.congress
  }
  if (params.congress) {
    try {
      return parseCongressParam(params.congress)
    } catch (e) {
      if (e instanceof InvalidCongressError) {
        return getCurrentCongress()
      }
      throw e
    }
  }
  return getCurrentCongress()
}

export default ChamberPage
