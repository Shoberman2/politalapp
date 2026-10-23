import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { glossaryEntry } from '../../shared/glossary.js'
import '../styles/Term.css'

// A word the reader may not know, followed by a small ⓘ button. Tapping,
// clicking, or focusing and pressing Enter opens a plain-English definition;
// Escape, a second tap, or a tap elsewhere closes it. Hovering opens it on
// devices with a mouse.
//
//   <Term id="cloture">cloture</Term>   word + ⓘ, definition from shared/glossary.js
//   <Term id="cloture" />               the glossary's own name for it + ⓘ
//   <Term def="...">FY2027</Term>       a one-off definition not in the glossary
//   <InfoDot id="rollCall" />           the ⓘ alone, next to text you already have
//
// Never put one inside a link: a button inside an <a> is invalid and the tap
// would follow the link. Put it beside the link instead.

const GUTTER = 12
const GAP = 8

export function InfoDot({ id, def, label, glossaryLink = true }) {
  const entry = id ? glossaryEntry(id) : null
  const text = def || entry?.def
  const name = label || entry?.term || 'this term'
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const popRef = useRef(null)
  const hoverTimer = useRef(null)
  const popId = useId()

  const place = useCallback(() => {
    const btn = btnRef.current
    const pop = popRef.current
    if (!btn || !pop) return
    const b = btn.getBoundingClientRect()
    const w = Math.min(300, window.innerWidth - GUTTER * 2)
    const h = pop.offsetHeight
    let left = b.left + b.width / 2 - w / 2
    left = Math.max(GUTTER, Math.min(left, window.innerWidth - GUTTER - w))
    const below = b.bottom + GAP
    const fitsBelow = below + h <= window.innerHeight - GUTTER
    const top = fitsBelow || b.top - GAP - h < GUTTER ? below : b.top - GAP - h
    setPos({ top, left, width: w, arrow: b.left + b.width / 2 - left, above: top < b.top })
  }, [])

  useLayoutEffect(() => { if (open) place() }, [open, place])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() }
    }
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  useEffect(() => () => clearTimeout(hoverTimer.current), [])

  if (!text) return null

  // Hover only for a real mouse; touch taps go through onClick.
  const hoverIn = (e) => {
    if (e.pointerType !== 'mouse') return
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setOpen(true), 120)
  }
  const hoverOut = (e) => {
    if (e.pointerType !== 'mouse') return
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setOpen(false), 160)
  }

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className={`term-dot${open ? ' is-open' : ''}`}
        aria-label={`What does “${name}” mean?`}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o) }}
        onPointerEnter={hoverIn}
        onPointerLeave={hoverOut}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="4.9" r="1" fill="currentColor" />
          <path d="M8 7.2v4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open && createPortal(
        <span
          ref={popRef}
          id={popId}
          role="tooltip"
          className={`term-pop${pos?.above ? ' is-above' : ''}`}
          style={pos ? { top: pos.top, left: pos.left, width: pos.width, '--arrow-x': `${pos.arrow}px` } : { visibility: 'hidden', top: 0, left: 0 }}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') clearTimeout(hoverTimer.current) }}
          onPointerLeave={hoverOut}
        >
          <span className="term-pop-name">{name}</span>
          <span className="term-pop-def">{text}</span>
          {id && glossaryLink && (
            <Link className="term-pop-more" to={`/glossary#${id}`} onClick={() => setOpen(false)}>
              All terms, explained
            </Link>
          )}
        </span>,
        document.body,
      )}
    </>
  )
}

export default function Term({ id, def, children, label }) {
  const entry = id ? glossaryEntry(id) : null
  const word = children ?? entry?.term ?? label
  return (
    <span className="term">
      {word}
      <InfoDot id={id} def={def} label={label || entry?.term || (typeof children === 'string' ? children : undefined)} />
    </span>
  )
}
