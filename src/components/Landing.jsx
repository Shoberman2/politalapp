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
        title="Track Your Congress"
        description="Track how your senators and house representatives vote on congressional bills. Look up your elected officials by address, browse 10,000+ bills with AI-powered explanations, and monitor government shutdown status."
        path="/"
        schema={{
          '@graph': [
            {
              '@type': 'WebSite',
              name: 'BallotWatch',
              url: 'https://politicalapp.vercel.app',
              potentialAction: {
                '@type': 'SearchAction',
                target: 'https://politicalapp.vercel.app/bills?search={search_term_string}',
                'query-input': 'required name=search_term_string'
              }
            },
            {
              '@type': 'Organization',
              name: 'BallotWatch',
              url: 'https://politicalapp.vercel.app',
              logo: 'https://politicalapp.vercel.app/capitol-logo.svg'
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
          <a href="#about">Representatives</a>
          <a href="#features">Bills</a>
          <a href="#how-it-works">Tracker</a>
          <a href="#articles">Articles</a>
        </div>
        <div className="nav-cta">
          <button onClick={() => navigate('/my-representative')} className="nav-btn-primary">
            Explore Representatives &rsaquo;
          </button>
        </div>
      </nav>

      {/* Hero Section with Congress.jpg Background */}
      <section className={`hero ${introComplete ? 'hero-visible' : ''}`}>
        <div className="hero-background">
          <img src="/congress.jpg" alt="United States Capitol Building — Congressional voting records and bill tracker" />
          <div className="hero-overlay"></div>
        </div>
        <div className="hero-content">
          <h1 className="hero-title">
            <span className="hero-line-1">Track Your</span>
            <span className="hero-line-2">Congress</span>
          </h1>
          <p className="hero-subtitle">
            Look up your senators and house representatives, track their congressional voting records,
            and understand every bill with AI-powered explanations.
          </p>
          <div className="hero-cta">
            <button onClick={() => navigate('/my-representative')} className="btn-primary">
              Find My Representative
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
          <p className="hero-note">Powered by Congress.gov, the Census Bureau, and the FEC.</p>
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
            <span className="trust-label">Members Tracked</span>
          </div>
          <div className="trust-divider"></div>
          <div className="trust-item">
            <span className="trust-number">10K+</span>
            <span className="trust-label">Bills Indexed</span>
          </div>
          <div className="trust-divider"></div>
          <div className="trust-item">
            <span className="trust-number">100%</span>
            <span className="trust-label">Official Sources</span>
          </div>
          <div className="trust-divider"></div>
          <div className="trust-item">
            <span className="trust-number">Free</span>
            <span className="trust-label">No Account Required</span>
          </div>
        </div>
      </section>

      {/* Explore Congress Collection Cards */}
      <section className="value-prop" id="about">
        <div className="section-container">
          <div className="section-header">
            <h2 className="section-title">What you can do here</h2>
            <p className="section-description">
              Track how your senators and representatives vote. Browse legislation.
              Follow the money.
            </p>
          </div>
          <div className="value-grid">
            <div className="value-card" onClick={() => navigate('/my-representative')}>
              <div className="value-card-number">01</div>
              <h3>Find Your Representative</h3>
              <p>Enter your address to find out who represents you in the U.S. Senate and House of Representatives.</p>
              <span className="value-card-link">Look Up &rsaquo;</span>
            </div>
            <div className="value-card" onClick={() => navigate('/bills')}>
              <div className="value-card-number">02</div>
              <h3>Congressional Bill Tracker</h3>
              <p>Search and track 10,000+ congressional bills from introduction to law with AI-powered plain-English explanations.</p>
              <span className="value-card-link">Browse Bills &rsaquo;</span>
            </div>
            <div className="value-card" onClick={() => navigate('/all')}>
              <div className="value-card-number">03</div>
              <h3>Voting Records & History</h3>
              <p>See how every senator and house member votes on legislation — with full roll call breakdowns and party alignment.</p>
              <span className="value-card-link">View Votes &rsaquo;</span>
            </div>
            <div className="value-card" onClick={() => navigate('/shutdown-tracker')}>
              <div className="value-card-number">04</div>
              <h3>Government Shutdown Tracker</h3>
              <p>Monitor government shutdown risk with live funding deadlines, appropriations progress, and historical shutdown data.</p>
              <span className="value-card-link">Check Status &rsaquo;</span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works — editorial style, not numbered steps */}
      <section className="how-it-works" id="how-it-works">
        <div className="section-container">
          <div className="section-header">
            <h2 className="section-title">Your address. Your representatives. Their votes.</h2>
            <p className="section-description">
              Enter your address and BallotWatch identifies your senators and house representative.
              From there, you can see every vote they've cast, every bill they've sponsored, and
              how they compare to their party.
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
                BallotWatch pulls from four official sources. No middlemen, no editorializing.
              </p>
              <ul className="premium-db-list">
                <li>
                  <div>
                    <strong>Congress.gov</strong>
                    <span>10,000+ bills, every roll call vote, committee assignments, and bill status from the official legislative database.</span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>U.S. Census Bureau</strong>
                    <span>Address-to-district mapping so you can find your exact representative, not just your state's senators.</span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>Federal Election Commission</strong>
                    <span>Campaign donations, committee fundraising, and individual contributor data linked to each member.</span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>Updated daily</strong>
                    <span>An automated pipeline runs every morning at 6 AM ET, pulling new votes and bill updates.</span>
                  </div>
                </li>
              </ul>
              <button onClick={() => navigate('/bills')} className="btn-primary">
                Browse Bills
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
            <h2 className="section-title">Your complete congressional tracking toolkit</h2>
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
                <h3>Congressional Bill Tracking</h3>
              </div>
              <p>Search and filter 10,000+ congressional bills and resolutions. Track legislation from introduction through committee to final vote.</p>
              <ul className="feature-list">
                <li>Full-text bill search</li>
                <li>Filter by Senate, House, status</li>
                <li>Bill sponsor and cosponsor details</li>
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
                <h3>Senator & Representative Profiles</h3>
              </div>
              <p>Detailed profiles for all 535 members of Congress — senators and house representatives — with their full legislative record.</p>
              <ul className="feature-list">
                <li>Official contact information</li>
                <li>Committee assignments</li>
                <li>Congressional voting history</li>
              </ul>
            </div>
            <div className="feature-card">
              <div className="feature-header">
                <div className="feature-icon-wrap">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </div>
                <h3>AI-Powered Bill Explanations</h3>
              </div>
              <p>Complex legislation explained in plain English. Understand what Congress is voting on without reading hundreds of pages.</p>
              <ul className="feature-list">
                <li>Plain-English bill summaries</li>
                <li>Key provisions and impact analysis</li>
                <li>Related legislation links</li>
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
                <h3>Congressional Roll Call Votes</h3>
              </div>
              <p>See exactly how your senators and representatives vote on every roll call — with yea/nay breakdowns and party-line analysis.</p>
              <ul className="feature-list">
                <li>Complete voting history timeline</li>
                <li>Yea/Nay/Present breakdown</li>
                <li>Party alignment statistics</li>
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
                <h3>Government Shutdown Tracker</h3>
              </div>
              <p>Live government shutdown risk monitor with funding deadline countdowns, appropriations bill progress, and historical shutdown data.</p>
              <ul className="feature-list">
                <li>Real-time risk assessment</li>
                <li>Federal funding deadline countdown</li>
                <li>Historical government shutdown data</li>
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
              <p>Premium congressional intelligence — making democracy accessible to every American.</p>
            </div>
            <div className="footer-links">
              <div className="footer-column">
                <h4>Explore</h4>
                <button onClick={() => navigate('/my-representative')}>My Representatives</button>
                <button onClick={() => navigate('/all')}>All Politicians</button>
              </div>
              <div className="footer-column">
                <h4>Resources</h4>
                <button onClick={() => navigate('/bills')}>Bills</button>
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
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2026 BallotWatch. Data sourced from Congress.gov</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Landing
