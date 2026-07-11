import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import SEO from './SEO'
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
import { getMembersByCongress, getPartyComposition } from '../services/memberTerms'
import {
  getAllCongressMetadata,
  getCongressMetadata,
} from '../services/congressMetadata'
import { getFidelityInfo, fidelityDotColor } from '../../shared/fidelity'
import { historicMoments } from '../data/historicMoments'
import '../styles/Chamber.css'

/**
 * ChamberPage — root component for /chamber routes.
 *
 * Hosts both the Senate hemicycle and the House composition view, controlled
 * by a chamber toggle at the top. Default view is Senate (the eureka feature).
 *
 * Routes:
 *   /chamber                       — current Congress, Senate view
 *   /chamber/:congress             — specific Congress, Senate view
 *   /chamber/:congress/house       — House composition for Congress
 *   /chamber/desk/:deskId          — Senate view with lineage panel open
 *   /chamber/moment/:slug          — Senate view with moment overlay active
 *
 * Responsive: switches to mobile compact-hemicycle layout below 768px
 * (handled by SenateChamberMap via isMobile prop).
 */

const MOBILE_BREAKPOINT_PX = 768

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
  }, [params.congress])

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
  const [congressMeta, setCongressMeta] = useState(null)
  const [metadataByCongress, setMetadataByCongress] = useState(new Map())
  const [houseComposition, setHouseComposition] = useState({
    D: 0, R: 0, I: 0, other: 0, total: 0,
  })
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
          const chamberRows = await getChamberForCongress(congress)
          if (cancelled) return
          setDesks(chamberRows)
        } else {
          const members = await getMembersByCongress(congress, 'house')
          const composition = await getPartyComposition(congress, 'house')
          if (cancelled) return
          setHouseMembers(members)
          setHouseComposition(composition)
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
    if (!Number.isInteger(deskId) || desks.length === 0) return
    const linkedDesk = desks.find((desk) => desk.desk_id === deskId)
    if (!linkedDesk) return
    setSelectedDesk((current) =>
      current?.desk_id === linkedDesk.desk_id ? current : linkedDesk
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
  const fidelityTier = congressMeta?.fidelity_tier ?? 'composition_only'
  const fidelityInfo = getFidelityInfo(fidelityTier)
  const congressLabel = formatCongressLabel(congress)

  const seoTitle = `The ${chamberView === 'house' ? 'House' : 'Senate'} Chamber · ${congressLabel} · BallotWatch`
  const seoDescription = `Interactive ${chamberView === 'house' ? 'House' : 'Senate'} chamber for the ${congressLabel}. ${chamberView === 'senate' ? 'Click any desk to see its history.' : 'Party composition view — House seating is open.'}`

  return (
    <div className="chamber-page">
      <SEO title={seoTitle} description={seoDescription} />

      <header className="chamber-header">
        <div className="chamber-eyebrow">BALLOTWATCH</div>
        <h1 className="chamber-title">
          <em>The {chamberView === 'house' ? 'House' : 'Senate'} Chamber</em>
        </h1>
        <div className="chamber-subtitle">{congressLabel}</div>

        {chamberView === 'senate' && (
          <div className="chamber-caption">
            100 desks · {congressMeta?.majority_party_senate
              ? `${congressMeta.majority_party_senate}-majority`
              : 'composition coming as data loads'}
          </div>
        )}
        {chamberView === 'house' && houseComposition.total > 0 && (
          <div className="chamber-caption">
            {houseComposition.total} representatives · {houseComposition.R} R · {houseComposition.D} D
            {houseComposition.I > 0 ? ` · ${houseComposition.I} I` : ''}
          </div>
        )}

        <div className="chamber-header-aside">
          <span
            className="chamber-fidelity-dot-inline"
            style={{ backgroundColor: fidelityDotColor(fidelityTier) }}
            aria-hidden="true"
          />
          <span className="chamber-fidelity-label">{fidelityInfo.label}</span>
        </div>
      </header>

      <hr className="chamber-rule" />

      {/* Chamber toggle */}
      <nav className="chamber-toggle" role="tablist" aria-label="Chamber selector">
        <button
          type="button"
          role="tab"
          aria-selected={chamberView === 'senate'}
          className={`chamber-toggle-btn ${chamberView === 'senate' ? 'is-active' : ''}`}
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
          className={`chamber-toggle-btn ${chamberView === 'house' ? 'is-active' : ''}`}
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

        {/* Mobile tap-to-reveal label per D5 decision */}
        {isMobile && hoveredDesk && hoveredDesk.politician && (
          <div className="chamber-mobile-reveal" aria-live="polite">
            <strong>{hoveredDesk.politician.name}</strong>{' '}
            <span className="chamber-mobile-reveal-meta">
              ({hoveredDesk.politician.party}-{hoveredDesk.politician.state}) · Desk {hoveredDesk.desk_id}
            </span>
          </div>
        )}
      </section>

      <hr className="chamber-rule" />

      {/* Scrubber */}
      <ChamberScrubber
        congress={congress}
        onCongressChange={handleCongressChange}
        metadataByCongress={metadataByCongress}
        isMobile={isMobile}
      />

      <hr className="chamber-rule" />

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

      <hr className="chamber-rule" />

      <footer className="chamber-footer">
        <div className="chamber-footer-caption">
          <em>Click any desk to read its history. Hover to see the senator who currently holds it.</em>
        </div>
        <div className="chamber-footer-link">
          <a href="/chamber/methodology">Methodology and data sources</a>
        </div>
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
  // Order of preference: explicit :congress param → default to current.
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
