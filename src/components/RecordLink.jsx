import { Link } from 'react-router-dom'
import { recordPath } from '../../shared/memberRecord.js'

// A small text link to a member's "record in 60 seconds" card. The accessible
// name starts with the visible text and adds the member's name, so a page with
// several of these (a delegation, a grid) reads unambiguously to a screen
// reader. Clicks stop here so a link inside a clickable card does not also
// trigger the card.
export default function RecordLink({ bioguideId, name, className = '' }) {
  const id = String(bioguideId || '').toUpperCase()
  if (!/^[A-Z]\d{6}$/.test(id)) return null
  return (
    <Link
      className={`record-link${className ? ` ${className}` : ''}`}
      to={recordPath(id)}
      aria-label={name ? `Record in 60 seconds: ${name}` : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      Record in 60 seconds →
    </Link>
  )
}
