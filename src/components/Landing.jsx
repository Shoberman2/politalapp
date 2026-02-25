import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/Landing.css'

function Landing() {
  const navigate = useNavigate()
  const hasSeenIntro = sessionStorage.getItem('hasSeenIntro')
  const [introComplete, setIntroComplete] = useState(!!hasSeenIntro)
  const [introExiting, setIntroExiting] = useState(!!hasSeenIntro)

  useEffect(() => {
    if (hasSeenIntro) return

    const exitTimer = setTimeout(() => {
      setIntroExiting(true)
    }, 4000)

    const completeTimer = setTimeout(() => {
      setIntroComplete(true)
      sessionStorage.setItem('hasSeenIntro', 'true')
    }, 5000)

    return () => {
      clearTimeout(exitTimer)
      clearTimeout(completeTimer)
    }
  }, [])

  return (
    <div className="landing">
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
        <div className="nav-logo">BallotWatch</div>
        <div className="nav-links">
          <a href="#about">Representatives</a>
          <a href="#features">Bills</a>
          <a href="#how-it-works">Tracker</a>
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
          <p className="hero-note">Premium congressional intelligence — powered by official government data.</p>
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
            <span className="trust-number">$2</span>
            <span className="trust-label">Per Month</span>
          </div>
        </div>
      </section>

      {/* Explore Congress Collection Cards */}
      <section className="value-prop" id="about">
        <div className="section-container">
          <div className="section-header section-header-center">
            <span className="section-label">Explore Congress</span>
            <h2 className="section-title">Congressional voting records made accessible</h2>
            <p className="section-description">
              Every vote your senators and representatives cast affects your life. Track congressional voting history,
              browse legislation, and hold your elected officials accountable — all in one place.
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

      {/* How It Works */}
      <section className="how-it-works" id="how-it-works">
        <div className="section-container">
          <div className="section-header section-header-center">
            <span className="section-label">How It Works</span>
            <h2 className="section-title">Look up your representatives in three steps</h2>
          </div>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">01</div>
              <h3>Enter Your Address</h3>
              <p>Type your home address and we'll identify your U.S. senators and congressional district representative automatically.</p>
            </div>
            <div className="step-card">
              <div className="step-number">02</div>
              <h3>Review Voting Records</h3>
              <p>See every congressional vote they cast, bills they sponsor, committee assignments, and positions on key legislation.</p>
            </div>
            <div className="step-card">
              <div className="step-number">03</div>
              <h3>Hold Congress Accountable</h3>
              <p>Track how your elected officials vote on issues that matter to you — from healthcare and defense to taxes and spending bills.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Premium Database */}
      <section className="premium-db" id="database">
        <div className="section-container">
          <div className="premium-db-layout">
            <div className="premium-db-content">
              <span className="section-label">Premium Database</span>
              <h2 className="section-title">Congressional data you won't find anywhere else</h2>
              <p className="section-description">
                BallotWatch aggregates data from Congress.gov, the U.S. Census Bureau, the FEC, and more into
                one searchable platform. Every vote, every bill, every dollar — organized and updated continuously.
              </p>
              <ul className="premium-db-list">
                <li>
                  <span className="premium-db-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  </span>
                  <div>
                    <strong>10,000+ Bills Indexed</strong>
                    <span>Every piece of legislation from the 119th Congress, searchable and explained in plain English by AI.</span>
                  </div>
                </li>
                <li>
                  <span className="premium-db-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  </span>
                  <div>
                    <strong>Complete Roll Call Records</strong>
                    <span>Every yea, nay, and abstention for all 535 members — with party-line analysis and voting trends.</span>
                  </div>
                </li>
                <li>
                  <span className="premium-db-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  </span>
                  <div>
                    <strong>Campaign Finance Data</strong>
                    <span>FEC donation records linked to each representative so you can follow the money behind every vote.</span>
                  </div>
                </li>
                <li>
                  <span className="premium-db-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  </span>
                  <div>
                    <strong>Real-Time Updates</strong>
                    <span>Data sourced directly from official government APIs and refreshed continuously throughout the day.</span>
                  </div>
                </li>
              </ul>
              <button onClick={() => navigate('/my-representative')} className="btn-primary">
                Explore the Database
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

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-container">
          <div className="footer-top">
            <div className="footer-brand">
              <span className="footer-logo">BallotWatch</span>
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
