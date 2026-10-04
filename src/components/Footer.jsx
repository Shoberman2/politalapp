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
      { label: 'Members', to: '/all' },
      { label: 'Bills', to: '/bills' },
      { label: 'This week', to: '/this-week' },
      SHOW_BILL_ALERTS && { label: 'Bill alerts', to: '/alerts' },
    ],
  },
  {
    title: 'How it works',
    links: [
      { label: 'How it works', to: '/how-it-works' },
      { label: 'Methodology', to: '/methodology' },
      { label: 'AI explanations', to: '/methodology/ai-explanations' },
      { label: 'Corrections', to: '/methodology/corrections' },
    ],
  },
  {
    title: 'Build',
    links: [
      { label: 'API', to: '/developers' },
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
      { label: 'For offices', to: '/offices' },
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
          <div className="footer-cols">
            <div className="footer-brand">
              <span className="footer-wordmark">{BRAND.name}</span>
              <p className="footer-tag">
                The congressional record, source-linked, and a direct line to the people who represent you.
              </p>
            </div>
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
          <div className="footer-bottom">
            <p>&copy; 2026 {BRAND.name}. Code MIT licensed; source data terms vary by provider.</p>
            <p>Not affiliated with the U.S. Congress.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Footer
