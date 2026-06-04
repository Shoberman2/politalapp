import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import articles from '../data/articles'
import SEO from './SEO'
import '../styles/Landing.css'

function Landing() {
  const navigate = useNavigate()
  const hasSeenIntro = sessionStorage.getItem('hasSeenIntro')
  const [introComplete, setIntroComplete] = useState(!!hasSeenIntro)
  const [introExiting, setIntroExiting] = useState(!!hasSeenIntro)

  const playIntro = () => {
    setIntroComplete(false)
    setIntroExiting(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })

    const exitTimer = setTimeout(() => {
      setIntroExiting(true)
    }, 3000)

    const completeTimer = setTimeout(() => {
      setIntroComplete(true)
      sessionStorage.setItem('hasSeenIntro', 'true')
    }, 4000)

    return () => {
      clearTimeout(exitTimer)
      clearTimeout(completeTimer)
    }
  }

  useEffect(() => {
    if (hasSeenIntro) return
    return playIntro()
  }, [])

  return (
    <div className="landing">
      <SEO
        title="Open-Source Congressional Accountability"
        description="BallotWatch is an open-source congressional accountability platform for tracking representatives, bills, votes, methodology, and civic data."
        path="/"
        schema={{
          '@graph': [
            {
              '@type': 'WebSite',
              name: 'BallotWatch',
              url: 'https://www.ballotwatch.io',
              potentialAction: {
                '@type': 'SearchAction',
                target: 'https://www.ballotwatch.io/bills?search={search_term_string}',
                'query-input': 'required name=search_term_string'
              }
            },
            {
              '@type': 'Organization',
              name: 'BallotWatch',
              url: 'https://www.ballotwatch.io',
              logo: 'https://www.ballotwatch.io/capitol-logo.svg'
            }
          ]
        }}
      />
      {/* Intro Quote Screen */}
      {!introComplete && (
        <div className={`intro-screen ${introExiting ? 'intro-exiting' : ''}`}>
          <div className="intro-quote">
            <blockquote>
              "An informed citizenry is at the heart of a dynamic democracy."
            </blockquote>
            <cite>— Thomas Jefferson</cite>
          </div>
        </div>
      )}

      {/* Sticky Navigation Bar */}
      <nav className={`landing-nav ${introComplete ? 'nav-visible' : ''}`}>
        <div className="nav-logo" onClick={playIntro} style={{ cursor: 'pointer' }}>
          <img src="/capitol-logo.svg" alt="" className="landing-nav-logo-img" />
          BallotWatch
        </div>
        <div className="nav-links">
          <a href="#about">Workbench</a>
          <a href="#database">Sources</a>
          <a href="#features">Features</a>
          <a href="/open" onClick={(e) => { e.preventDefault(); navigate('/open') }}>Open Source</a>
          <a href="#articles">Articles</a>
        </div>
        <div className="nav-cta">
          <button onClick={() => navigate('/open')} className="nav-btn-primary">
            Open the Commons &rsaquo;
          </button>
        </div>
      </nav>

      {/* Hero Section with Congress.jpg Background */}
      <section className={`hero ${introComplete ? 'hero-visible' : ''}`}>
        <div className="hero-background">
          <img src="/congress.jpg" alt="United States Capitol Building - Congressional voting records and bill tracker" />
          <div className="hero-overlay"></div>
        </div>
        <div className="hero-content">
          <h1 className="hero-title">
            <span className="hero-line-1">BallotWatch</span>
            {' '}
            <span className="hero-line-2">Open Congress Data</span>
          </h1>
          <p className="hero-subtitle">
            Track representatives, bills, votes, methodology, and public civic data.
            Built open source so voters, journalists, researchers, and developers can
            inspect the work behind every number.
          </p>
          <div className="hero-cta">
            <button onClick={() => navigate('/my-representative')} className="btn-primary">
              Find My Representative
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
            <button onClick={() => navigate('/open')} className="hero-secondary">
              Open Source Commons
            </button>
          </div>
          <p className="hero-note">Source-backed. OpenAPI documented. Public methodology. Built from Congress.gov, Census, and FEC data.</p>
        </div>
        <button
          className="scroll-indicator"
          onClick={() => document.getElementById('explore-start')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <span>Scroll to explore</span>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12l7 7 7-7"/>
          </svg>
        </button>
      </section>

      {/* Trust Bar */}
      <section className="trust-bar" id="explore-start">
        <div className="trust-container">
          <div className="trust-item">
            <span className="trust-number">535</span>
            <span className="trust-label">Members</span>
          </div>
          <div className="trust-divider"></div>
          <div className="trust-item">
            <span className="trust-number">10K+</span>
            <span className="trust-label">Bills</span>
          </div>
          <div className="trust-divider"></div>
          <div className="trust-item">
            <span className="trust-number">MIT</span>
            <span className="trust-label">Code License</span>
          </div>
          <div className="trust-divider"></div>
          <div className="trust-item">
            <span className="trust-number">API</span>
            <span className="trust-label">OpenAPI Spec</span>
          </div>
        </div>
      </section>

      {/* Explore Congress Collection Cards */}
      <section className="value-prop" id="about">
        <div className="section-container">
          <div className="section-header">
            <h2 className="section-title">A public workbench for Congress</h2>
            <p className="section-description">
              Use the app, inspect the methodology, build with the data, or
              contribute source-backed fixes.
            </p>
          </div>
          <div className="value-grid">
            <div className="value-card" onClick={() => navigate('/my-representative')}>
              <div className="value-card-number">01</div>
              <h3>Use the App</h3>
              <p>Find your representatives, read their voting records, and follow bills without decoding congressional databases.</p>
              <span className="value-card-link">Find Reps &rsaquo;</span>
            </div>
            <div className="value-card" onClick={() => navigate('/methodology')}>
              <div className="value-card-number">02</div>
              <h3>Check the Work</h3>
              <p>Open methodology pages explain source, cadence, caveat, and code references for computed features.</p>
              <span className="value-card-link">Read Methodology &rsaquo;</span>
            </div>
            <div className="value-card" onClick={() => navigate('/developers')}>
              <div className="value-card-number">03</div>
              <h3>Build With Data</h3>
              <p>Use OpenAPI docs, schema samples, and hosted API access for newsroom, research, and civic projects.</p>
              <span className="value-card-link">Explore API &rsaquo;</span>
            </div>
            <div className="value-card" onClick={() => navigate('/open')}>
              <div className="value-card-number">04</div>
              <h3>Contribute Corrections</h3>
              <p>Report source-backed data issues, improve docs, add examples, test edge cases, or help make features clearer.</p>
              <span className="value-card-link">Open Commons &rsaquo;</span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works — editorial style, not numbered steps */}
      <section className="how-it-works" id="how-it-works">
        <div className="section-container">
          <div className="section-header">
            <h2 className="section-title">Every feature should be readable at a glance.</h2>
            <p className="section-description">
              BallotWatch explains what question a feature answers, what source
              backs it, how often it updates, what caveat matters, and what you
              can do next.
            </p>
          </div>
        </div>
      </section>

      {/* Data Sources — editorial, no icons-in-circles */}
      <section className="premium-db" id="database">
        <div className="section-container">
          <div className="premium-db-layout">
            <div className="premium-db-content">
              <h2 className="section-title">Where the data comes from</h2>
              <p className="section-description">
                BallotWatch separates source facts, deterministic calculations,
                and AI-assisted explanations so readers can audit the difference.
              </p>
              <ul className="premium-db-list">
                <li>
                  <div>
                    <strong>Congress.gov</strong>
                    <span>Bills, roll calls, actions, sponsors, committees, and official legislative records.</span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>U.S. Census Bureau</strong>
                    <span>Address-to-district matching for representative lookup.</span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>Federal Election Commission</strong>
                    <span>Campaign finance context linked to members and policy areas with visible caveats.</span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>Open methodology</strong>
                    <span>Public pages explain data sources, AI explanations, committee survival, sponsor activity, finance matching, and corrections.</span>
                  </div>
                </li>
              </ul>
              <button onClick={() => navigate('/methodology')} className="btn-primary">
                Read Methodology
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Deep Dive */}
      <section className="features" id="features">
        <div className="section-container">
          <div className="section-header section-header-center">
            <span className="section-label">Features</span>
            <h2 className="section-title">Readable by citizens. Useful to builders.</h2>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-header">
                <div className="feature-icon-wrap">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>
                <h3>Source-Backed Bill Tracking</h3>
              </div>
              <p>Search bills and see the source record, current status, plain-English explanation, and methodology caveat together.</p>
              <ul className="feature-list">
                <li>Question: what is moving?</li>
                <li>Source: Congress.gov</li>
                <li>Action: search and cite</li>
              </ul>
            </div>
            <div className="feature-card">
              <div className="feature-header">
                <div className="feature-icon-wrap">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <h3>Representative Accountability Pages</h3>
              </div>
              <p>Profiles organize a member's votes, sponsorship, party alignment, finance context, and source links in one place.</p>
              <ul className="feature-list">
                <li>Question: who represents me?</li>
                <li>Source: member records</li>
                <li>Action: inspect votes</li>
              </ul>
            </div>
            <div className="feature-card">
              <div className="feature-header">
                <div className="feature-icon-wrap">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </div>
                <h3>Auditable AI Explanations</h3>
              </div>
              <p>AI helps translate dense records, but source facts stay separate and methodology explains the guardrails.</p>
              <ul className="feature-list">
                <li>Question: what does it mean?</li>
                <li>Source: structured inputs</li>
                <li>Action: read caveats</li>
              </ul>
            </div>
            <div className="feature-card">
              <div className="feature-header">
                <div className="feature-icon-wrap">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="9 11 12 14 22 4"/>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                  </svg>
                </div>
                <h3>Open Roll Call Records</h3>
              </div>
              <p>Every vote surface should tell you how a member voted, what the chamber voted on, and where the record came from.</p>
              <ul className="feature-list">
                <li>Question: how did they vote?</li>
                <li>Source: roll calls</li>
                <li>Action: filter records</li>
              </ul>
            </div>
            <div className="feature-card">
              <div className="feature-header">
                <div className="feature-icon-wrap">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
                <h3>Open Data and API</h3>
              </div>
              <p>Developers can start from sample data and OpenAPI docs, then move to hosted API access when they need freshness and volume.</p>
              <ul className="feature-list">
                <li>Question: can I build with it?</li>
                <li>Source: API contract</li>
                <li>Action: download samples</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="social-proof">
        <div className="section-container">
          <div className="proof-content">
            <div className="proof-quote">
              <div className="proof-gold-line"></div>
              <blockquote>
                "An informed citizenry is at the heart of a dynamic democracy."
              </blockquote>
              <cite>— Thomas Jefferson</cite>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="final-cta">
        <div className="section-container">
          <div className="cta-content">
            <h2>Start Tracking Your Congress Today</h2>
            <p>Find your elected officials, review their voting records, and stay informed on the legislation that shapes your life.</p>
            <div className="cta-buttons">
              <button onClick={() => navigate('/my-representative')} className="btn-primary btn-gold btn-large">
                Find My Representative
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
              <button onClick={() => navigate('/bills')} className="btn-tertiary">
                Browse Congressional Bills
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Articles */}
      <section className="landing-articles" id="articles">
        <div className="section-container">
          <div className="section-header section-header-center">
            <span className="section-label">From the Blog</span>
            <h2 className="section-title">Understand how Congress really works</h2>
            <p className="section-description">
              Nonpartisan explainers on legislation, voting records, campaign finance, and the procedures that shape American law.
            </p>
          </div>
          <div className="articles-grid">
            {articles.slice(0, 6).map(article => (
              <div
                key={article.slug}
                className="article-preview-card"
                onClick={() => navigate(`/blog/${article.slug}`)}
              >
                <div className="article-preview-tags">
                  {article.tags.map(tag => (
                    <span key={tag} className="article-preview-tag">{tag}</span>
                  ))}
                </div>
                <h3>{article.title}</h3>
                <p>{article.excerpt}</p>
                <span className="article-preview-link">Read Article &rsaquo;</span>
              </div>
            ))}
          </div>
          <div className="articles-cta">
            <button onClick={() => navigate('/blog')} className="btn-tertiary">
              View All Articles
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-container">
          <div className="footer-top">
            <div className="footer-brand">
              <span className="footer-logo">
                <img src="/capitol-logo.svg" alt="" className="footer-logo-img" />
                BallotWatch
              </span>
              <p>Open-source congressional accountability, built from public sources and readable methodology.</p>
            </div>
            <div className="footer-links">
              <div className="footer-column">
                <h4>Explore</h4>
                <button onClick={() => navigate('/my-representative')}>My Representatives</button>
                <button onClick={() => navigate('/all')}>All Politicians</button>
                <button onClick={() => navigate('/bills')}>Bills</button>
              </div>
              <div className="footer-column">
                <h4>Open</h4>
                <button onClick={() => navigate('/open')}>Open Source</button>
                <button onClick={() => navigate('/methodology')}>Methodology</button>
                <button onClick={() => navigate('/developers')}>API</button>
              </div>
              <div className="footer-column">
                <h4>Resources</h4>
                <button onClick={() => navigate('/shutdown-tracker')}>Shutdown Tracker</button>
                <button onClick={() => navigate('/blog')}>Blog</button>
              </div>
              <div className="footer-column">
                <h4>Articles</h4>
                {articles.slice(0, 3).map(article => (
                  <button key={article.slug} onClick={() => navigate(`/blog/${article.slug}`)}>{article.title}</button>
                ))}
              </div>
              <div className="footer-column">
                <h4>Data</h4>
                <span className="footer-text">Congress.gov</span>
                <span className="footer-text">US Census Bureau</span>
                <span className="footer-text">Federal Election Commission</span>
                <span className="footer-text">OpenAPI + sample datasets</span>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2026 BallotWatch. Code MIT licensed. Source data terms vary by upstream provider.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Landing
