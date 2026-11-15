import { Link, useLocation } from 'react-router-dom'
import { CTA_HREF, CTA_LABEL } from '../config/cta'
import { isGatedPath } from '../config/access'

// Every public interior page ends on one statement and the primary action.
// Left out where it would be noise: the landing (it closes on its own ZIP
// lookup), sign-in, the legal pages, and the signed-in app.
const SKIP = [/^\/$/, /^\/auth(?:\/|$)/i, /^\/privacy\/?$/i, /^\/terms\/?$/i]

export function showsClosingCta(pathname) {
  return !SKIP.some((re) => re.test(pathname)) && !isGatedPath(pathname)
}

function ClosingCta() {
  const { pathname } = useLocation()
  if (!showsClosingCta(pathname)) return null
  return (
    <section className="closing-cta" aria-labelledby="closing-cta-title">
      <h2 id="closing-cta-title">See How Your Reps Voted</h2>
      <Link className="btn-primary" to={CTA_HREF}>{CTA_LABEL}</Link>
    </section>
  )
}

export default ClosingCta
