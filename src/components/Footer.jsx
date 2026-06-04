import { Link } from 'react-router-dom'
import articles from '../data/articles'

// Shared broadsheet footer. Renders inside a `.bw` page root so the
// .bw-scoped footer styles in broadsheet.css apply.
function Footer() {
  const deskArticles = articles.slice(0, 3)

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-masthead">
          <span className="footer-wordmark">BallotWatch</span>
          <span className="footer-tag">Open-source congressional accountability, built from public sources and readable methodology.</span>
        </div>
        <div className="footer-cols">
          <div className="footer-col">
            <h4>Explore</h4>
            <Link to="/my-representative">My Representatives</Link>
            <Link to="/all">All Members</Link>
            <Link to="/bills">Bills</Link>
          </div>
          <div className="footer-col">
            <h4>Open</h4>
            <Link to="/open">Open Source</Link>
            <Link to="/methodology">Methodology</Link>
            <Link to="/developers">API</Link>
          </div>
          <div className="footer-col">
            <h4>Resources</h4>
            <Link to="/shutdown-tracker">Shutdown Tracker</Link>
            <Link to="/blog">Blog</Link>
            <Link to="/map">District Map</Link>
          </div>
          <div className="footer-col">
            <h4>From the Desk</h4>
            {deskArticles.map((article) => (
              <Link key={article.slug} to={`/blog/${article.slug}`}>{article.title}</Link>
            ))}
          </div>
          <div className="footer-col">
            <h4>Data</h4>
            <span>Congress.gov</span>
            <span>U.S. Census Bureau</span>
            <span>Federal Election Commission</span>
            <span>OpenAPI + samples</span>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2026 BallotWatch. Code MIT licensed. Source data terms vary by upstream provider.</p>
          <p>Not affiliated with the U.S. government.</p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
