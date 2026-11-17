import { Link } from 'react-router-dom'
import { BRAND } from '../config/brand'
import { SHOW_BILL_ALERTS } from '../config/features'

// The one site-wide footer, rendered once by App after <Routes>. It wraps
// itself in `.bw` so the .bw-scoped footer styles in broadsheet.css apply on
// pages that don't use the broadsheet root.

const GITHUB_URL = 'https://github.com/Shoberman2/politalapp'

// `href` entries are static files or hash anchors that react-router's <Link>
// won't serve or scroll to; everything else is a client-side route.
const COLUMNS = [
  {
    title: 'Explore',
    links: [
      { label: 'My representatives', to: '/my-representative' },
      { label: 'Bills', to: '/bills' },
      { label: 'This week', to: '/this-week' },
      SHOW_BILL_ALERTS && { label: 'Bill alerts', to: '/alerts' },
      { label: 'Sign in', to: '/auth' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { label: 'How it works', to: '/how-it-works' },
      { label: 'Glossary', to: '/glossary' },
      { label: 'How the government works', to: '/government' },
      { label: 'Data sources', to: '/data-sources' },
      { label: 'Methodology', to: '/methodology' },
      { label: 'AI explanations', to: '/methodology/ai-explanations' },
      { label: 'Corrections', to: '/methodology/corrections' },
    ],
  },
  {
    title: 'Build',
    links: [
      { label: 'For developers', to: '/developers' },
      { label: 'API docs', to: '/developers/docs' },
      { label: 'Open data', to: '/open' },
      { label: 'llms.txt', href: '/llms.txt' },
      { label: 'MCP', href: '/developers#mcp' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Contact', to: '/contact' },
      { label: 'Privacy', to: '/privacy' },
      { label: 'Terms', to: '/terms' },
      { label: 'GitHub', href: GITHUB_URL, external: true },
    ],
  },
]

function FooterLink({ link }) {
  if (link.to) return <Link to={link.to}>{link.label}</Link>
  if (link.external) {
    return <a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
  }
  return <a href={link.href}>{link.label}</a>
}

function Footer() {
  return (
    <div className="bw bw-footer">
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-main">
            {/* The mark and the name, as in the masthead. No button here: the
                closing band above the footer carries the one primary action
                (founder, 2026-11-17). */}
            <div className="footer-brand">
              <Link className="footer-home" to="/" aria-label={`${BRAND.name} home`}>
                <span className="brand-mark"><img src="/capitol-logo.svg" alt="" /></span>
                <span className="footer-wordmark">{BRAND.name}</span>
              </Link>
              <p className="footer-tag">How Congress voted, in plain English, linked to the official record.</p>
              <p className="footer-free">Free, nonpartisan and open source.</p>
            </div>
            <div className="footer-cols">
            {COLUMNS.map((col) => (
              <nav className="footer-col" key={col.title} aria-label={col.title}>
                <h4>{col.title}</h4>
                <ul>
                  {col.links.filter(Boolean).map((link) => (
                    <li key={link.label}><FooterLink link={link} /></li>
                  ))}
                </ul>
              </nav>
            ))}
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; {new Date().getFullYear()} {BRAND.name}. Code MIT licensed. Source data terms vary by provider.</p>
            <p>Not affiliated with the U.S. Congress.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Footer
