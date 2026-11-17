import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { GOV_LADDER, GOV_FILM } from '../data/government'
import '../styles/Government.css'

// Who is at the top of the executive branch and who is at the bottom, told
// beside one short film of a scale model: it opens on the White House and
// pulls back to show the departments and the offices under them. Each rung of
// the ladder lights up as the camera reaches its tier.
//
// The film plays once when it scrolls into view and rests on its last frame.
// Under prefers-reduced-motion it never plays: the last frame is the picture.

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  ))
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

// The rung the camera has reached at `time` seconds into the film.
export function rungAt(time, ladder = GOV_LADDER) {
  let reached = 0
  ladder.forEach((rung, i) => { if (time >= rung.at) reached = i })
  return reached
}

function GovernmentLadder({ linkTo = '/government', linkLabel = 'Meet the 15 departments', headingLevel = 'h2' }) {
  const reducedMotion = usePrefersReducedMotion()
  const videoRef = useRef(null)
  const [played, setPlayed] = useState(false)
  const [ended, setEnded] = useState(false)
  // Before the film runs (and when it never will) every rung reads at full strength.
  const [reached, setReached] = useState(GOV_LADDER.length - 1)
  const Heading = headingLevel

  // Start the film the first time most of it is on screen.
  useEffect(() => {
    const video = videoRef.current
    if (!video || reducedMotion || played) return undefined
    if (typeof IntersectionObserver !== 'function') return undefined
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      setPlayed(true)
      setReached(0)
      const start = video.play?.()
      // Autoplay refused: leave the poster, with every rung readable.
      if (start && typeof start.catch === 'function') start.catch(() => setReached(GOV_LADDER.length - 1))
    }, { threshold: 0.6 })
    io.observe(video)
    return () => io.disconnect()
  }, [reducedMotion, played])

  const replay = () => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = 0
    setEnded(false)
    setReached(0)
    video.play?.()?.catch?.(() => setReached(GOV_LADDER.length - 1))
  }

  return (
    <section className="gov-ladder" aria-labelledby="gov-ladder-title">
      <div className="gov-ladder-inner">
        <Heading id="gov-ladder-title" className="gov-ladder-title">Who Runs The Government</Heading>
        <p className="gov-ladder-lede">
          Congress writes the laws. The executive branch carries them out, from one person at the top to
          millions of workers at the bottom.
        </p>

        <div className="gov-ladder-stage">
          <div className="gov-film">
            {reducedMotion ? (
              <img src={GOV_FILM.poster} alt={GOV_FILM.alt} width="1280" height="720" loading="lazy" decoding="async" />
            ) : (
              <video
                ref={videoRef}
                src={GOV_FILM.src}
                poster={GOV_FILM.poster}
                width="1280"
                height="720"
                muted
                playsInline
                preload="none"
                aria-label={GOV_FILM.alt}
                onTimeUpdate={(e) => setReached(rungAt(e.currentTarget.currentTime))}
                onEnded={() => { setReached(GOV_LADDER.length - 1); setEnded(true) }}
              />
            )}
            {ended && !reducedMotion && (
              <button type="button" className="btn-outline btn-sm gov-film-replay" onClick={replay}>Replay</button>
            )}
          </div>

          <ol className="gov-rungs">
            {GOV_LADDER.map((rung, i) => (
              <li key={rung.id} className={i <= reached ? 'is-reached' : undefined}>
                <h3>{rung.title}</h3>
                <p>
                  {rung.body}
                  {rung.source && <> <a href={rung.source} target="_blank" rel="noopener noreferrer">{rung.sourceLabel}</a></>}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <p className="gov-film-note">{GOV_FILM.note}</p>
        {linkTo && <Link className="btn-text gov-ladder-link" to={linkTo}>{linkLabel}</Link>}
      </div>
    </section>
  )
}

export default GovernmentLadder
