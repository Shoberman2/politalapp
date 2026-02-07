import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/Landing.css'

function Landing() {
  const navigate = useNavigate()
  const [introComplete, setIntroComplete] = useState(false)
  const [introExiting, setIntroExiting] = useState(false)

  useEffect(() => {
    // Start exit animation after 4 seconds
    const exitTimer = setTimeout(() => {
      setIntroExiting(true)
    }, 4000)

    // Complete intro after exit animation (1s)
    const completeTimer = setTimeout(() => {
      setIntroComplete(true)
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
        <div className="nav-logo">VoteTrack</div>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#about">About</a>
        </div>
        <div className="nav-cta">
          <button onClick={() => navigate('/login')} className="nav-btn-secondary">Sign In</button>
          <button onClick={() => navigate('/signup')} className="nav-btn-primary">Get Started</button>
        </div>
      </nav>

      {/* Hero Section with Congress.jpg Background */}
      <section className={`hero ${introComplete ? 'hero-visible' : ''}`}>
        <div className="hero-background">
          <img src="/congress.jpg" alt="United States Capitol Building" />
          <div className="hero-overlay"></div>
        </div>
        <div className="hero-content">
          <h1 className="hero-title">
            <span className="hero-line-1">Take Control</span>
            <span className="hero-line-2">Stay in the Know</span>
          </h1>
          <p className="hero-subtitle">
            Track how your representatives vote, understand complex legislation,
            and hold your elected officials accountable.
          </p>
          <div className="hero-cta">
            <button onClick={() => navigate('/signup')} className="btn-primary">
              Get Started Free
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
            <button onClick={() => navigate('/login')} className="btn-secondary">
              Sign In
            </button>
          </div>
          <p className="hero-note">No credit card required. Free forever.</p>
        </div>
        <div className="scroll-indicator">
          <span>Scroll to explore</span>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12l7 7 7-7"/>
          </svg>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="trust-bar">
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
            <span className="trust-label">Always & Forever</span>
          </div>
        </div>
      </section>

      {/* Value Proposition / About */}
      <section className="value-prop" id="about">
        <div className="section-container">
          <div className="section-header">
            <span className="section-label">Why VoteTrack</span>
            <h2 className="section-title">Democracy demands transparency</h2>
            <p className="section-description">
              Every vote your representatives cast affects your life. We make that information
              accessible, understandable, and actionable.
            </p>
          </div>
          <div className="value-grid">
            <div className="value-card">
              <div className="value-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <h3>Real-Time Updates</h3>
              <p>Get instant notifications when your representatives vote. Never miss an important decision.</p>
            </div>
            <div className="value-card">
              <div className="value-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
              </div>
              <h3>Plain English</h3>
              <p>AI-powered explanations translate complex legislation into language anyone can understand.</p>
            </div>
            <div className="value-card">
              <div className="value-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h3>Official Data</h3>
              <p>Direct from Congress.gov and official government sources. No spin, no bias—just facts.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="how-it-works" id="how-it-works">
        <div className="section-container">
          <div className="section-header">
            <span className="section-label">How It Works</span>
            <h2 className="section-title">Three steps to informed citizenship</h2>
          </div>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">01</div>
              <h3>Find Your Representatives</h3>
              <p>Enter your address and we'll identify your senators and house representative automatically.</p>
            </div>
            <div className="step-connector">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
            <div className="step-card">
              <div className="step-number">02</div>
              <h3>Track Their Votes</h3>
              <p>See every vote they cast, bills they sponsor, and positions they take on key issues.</p>
            </div>
            <div className="step-connector">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
            <div className="step-card">
              <div className="step-number">03</div>
              <h3>Stay Informed</h3>
              <p>Get updates on legislation that matters to you and hold them accountable at the ballot box.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Deep Dive */}
      <section className="features" id="features">
        <div className="section-container">
          <div className="section-header">
            <span className="section-label">Features</span>
            <h2 className="section-title">Everything you need to stay informed</h2>
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
                <h3>Bill Tracking</h3>
              </div>
              <p>Search and filter thousands of congressional bills. Track progress from introduction to law.</p>
              <ul className="feature-list">
                <li>Full text search</li>
                <li>Filter by chamber, type, status</li>
                <li>Sponsor information</li>
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
                <h3>Politician Profiles</h3>
              </div>
              <p>Comprehensive profiles for every member of Congress with their complete legislative history.</p>
              <ul className="feature-list">
                <li>Contact information</li>
                <li>Committee assignments</li>
                <li>Voting record analysis</li>
              </ul>
            </div>
            <div className="feature-card">
              <div className="feature-header">
                <div className="feature-icon-wrap">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </div>
                <h3>AI Explanations</h3>
              </div>
              <p>Complex legislation translated into plain English. Understand what's really being proposed.</p>
              <ul className="feature-list">
                <li>Key points summary</li>
                <li>Impact analysis</li>
                <li>Related legislation</li>
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
                <h3>Vote Tracking</h3>
              </div>
              <p>See exactly how your representatives vote on every issue with detailed voting records.</p>
              <ul className="feature-list">
                <li>Vote history timeline</li>
                <li>Yea/Nay breakdown</li>
                <li>Party alignment stats</li>
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
              <svg className="quote-icon" width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11 7H7a4 4 0 0 0-4 4v8h10v-8a4 4 0 0 0-4-4H7zm12 0h-4a4 4 0 0 0-4 4v8h10v-8a4 4 0 0 0-4-4h-2z" opacity="0.2"/>
              </svg>
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
            <h2>Ready to take control?</h2>
            <p>Join citizens across America who are staying informed and holding their representatives accountable.</p>
            <div className="cta-buttons">
              <button onClick={() => navigate('/signup')} className="btn-primary btn-large">
                Create Free Account
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
              <button onClick={() => navigate('/bills')} className="btn-tertiary">
                Browse Bills First
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-container">
          <div className="footer-brand">
            <span className="footer-logo">VoteTrack</span>
            <p>Making democracy accessible.</p>
          </div>
          <div className="footer-links">
            <div className="footer-column">
              <h4>Product</h4>
              <button onClick={() => navigate('/bills')}>Bills</button>
              <button onClick={() => navigate('/politicians')}>Politicians</button>
              <button onClick={() => navigate('/my-politician')}>My Representatives</button>
            </div>
            <div className="footer-column">
              <h4>Account</h4>
              <button onClick={() => navigate('/signup')}>Sign Up</button>
              <button onClick={() => navigate('/login')}>Sign In</button>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2024 VoteTrack. Data sourced from Congress.gov</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Landing
