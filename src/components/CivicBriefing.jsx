import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SEO from './SEO'
import {
  disconnectGmail,
  generateBriefingPreview,
  getBriefingSettings,
  saveBriefingPreference,
  sendBriefingNow,
  startConsumerCheckout,
  startGmailConnect,
} from '../services/civicBriefing'
import '../styles/CivicBriefing.css'

const CHECKOUT_FALLBACK = 'https://buy.stripe.com/5kQ3cwgEsglY8GXccmcjS08'

const ArrowRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

const MailIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M4 6h16v12H4z" />
    <path d="m4 7 8 6 8-6" />
  </svg>
)

const SAMPLE_BRIEFING = {
  generatedAt: new Date().toISOString(),
  tone: 'Neutral, source-based',
  target: {
    name: 'Sample District Briefing',
    party: 'Public records',
    profileUrl: 'https://www.congress.gov/',
  },
  summary: [
    'This sample shows the format subscribers receive after connecting Gmail.',
    'Live briefings resolve the entered district or member, then summarize official votes, sponsored bills, and source-backed position notes.',
    'The language is intentionally neutral and limits claims to what public records support.',
  ],
  votes: [
    {
      position: 'Yea',
      billNumber: 'H.R. 1',
      title: 'Recorded vote on final passage of a sample bill',
      chamber: 'House',
      result: 'Passed',
      sourceUrl: 'https://clerk.house.gov/Votes',
    },
    {
      position: 'Nay',
      billNumber: 'S. 10',
      title: 'Recorded vote on a sample amendment',
      chamber: 'Senate',
      result: 'Rejected',
      sourceUrl: 'https://www.senate.gov/legislative/votes_new.htm',
    },
  ],
  bills: [
    {
      number: 'H.R. 214',
      title: 'Sample sponsored legislation with the latest official action attached',
      latestAction: 'Introduced and referred to committee',
      sourceUrl: 'https://www.congress.gov/',
    },
  ],
  positions: [
    {
      statement: 'The member was recorded as "Yea" on final passage of the sample bill.',
      sourceUrl: 'https://www.congress.gov/',
    },
  ],
  sources: [
    { label: 'Congress.gov', url: 'https://www.congress.gov/' },
    { label: 'House Clerk', url: 'https://clerk.house.gov/Votes' },
    { label: 'Senate roll calls', url: 'https://www.senate.gov/legislative/votes_new.htm' },
  ],
}

function formatDate(value) {
  if (!value) return 'Not sent yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not sent yet'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatusPill({ tone = 'muted', children }) {
  return <span className={`briefing-pill ${tone}`}>{children}</span>
}

function BriefingPreview({ briefing }) {
  return (
    <article className="briefing-preview-sheet">
      <header className="briefing-preview-head">
        <span className="briefing-preview-kicker">BallotWatch Civic Briefing</span>
        <h2>{briefing.target.name}</h2>
        <p>{formatDate(briefing.generatedAt)} / {briefing.target.party} / Neutral, source-based</p>
      </header>

      <section className="briefing-preview-section">
        <h3>Summary</h3>
        {briefing.summary.map((line) => <p key={line}>{line}</p>)}
      </section>

      <section className="briefing-preview-section">
        <h3>Recent Votes</h3>
        <div className="briefing-record-list">
          {briefing.votes.length > 0 ? briefing.votes.map((vote) => (
            <a href={vote.sourceUrl} target="_blank" rel="noopener noreferrer" className="briefing-record" key={`${vote.billNumber}-${vote.title}`}>
              <span>{vote.position} / {vote.billNumber || 'Roll call'}</span>
              <strong>{vote.title}</strong>
              <small>{vote.chamber} / {vote.result || 'Recorded'}</small>
            </a>
          )) : <p className="briefing-empty">No recent recorded votes were found.</p>}
        </div>
      </section>

      <section className="briefing-preview-section">
        <h3>Bills And Activity</h3>
        <div className="briefing-record-list">
          {briefing.bills.length > 0 ? briefing.bills.map((bill) => (
            <a href={bill.sourceUrl} target="_blank" rel="noopener noreferrer" className="briefing-record" key={`${bill.number}-${bill.title}`}>
              <span>{bill.number}</span>
              <strong>{bill.title}</strong>
              <small>{bill.latestAction}</small>
            </a>
          )) : <p className="briefing-empty">No recently sponsored bills were returned.</p>}
        </div>
      </section>

      <footer className="briefing-preview-footer">
        {briefing.sources.map((source) => (
          <a href={source.url} key={source.label} target="_blank" rel="noopener noreferrer">{source.label}</a>
        ))}
      </footer>
    </article>
  )
}

function CivicBriefing() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, session, isSubscribed: authSubscribed, loading: authLoading } = useAuth()
  const [target, setTarget] = useState('CA-11')
  const [frequency, setFrequency] = useState('weekly')
  const [settings, setSettings] = useState(null)
  const [preferenceId, setPreferenceId] = useState(null)
  const [briefing, setBriefing] = useState(SAMPLE_BRIEFING)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const isSubscribed = settings?.isSubscribed ?? authSubscribed
  const gmail = settings?.gmail || { connected: false }
  const savedPreference = settings?.preferences?.[0] || null
  const canUseLive = !!user && !!session && isSubscribed

  const statusText = useMemo(() => {
    if (!user) return 'Sign in required'
    if (!isSubscribed) return 'Pro required'
    if (!gmail.connected) return 'Gmail not connected'
    return 'Ready for updates'
  }, [gmail.connected, isSubscribed, user])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('gmail') === 'connected') setNotice('Gmail is connected for Civic Briefings.')
    if (params.get('gmail') === 'error') setError(params.get('message') || 'Gmail connection failed.')
  }, [location.search])

  useEffect(() => {
    if (!session?.access_token) return
    let cancelled = false

    ;(async () => {
      try {
        const data = await getBriefingSettings(session)
        if (cancelled) return
        setSettings(data)
        const preference = data.preferences?.[0]
        if (preference) {
          setTarget(preference.target)
          setFrequency(preference.frequency)
          setPreferenceId(preference.id)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    })()

    return () => { cancelled = true }
  }, [session])

  const refreshSettings = async () => {
    if (!session?.access_token) return null
    const data = await getBriefingSettings(session)
    setSettings(data)
    return data
  }

  const handleCheckout = async () => {
    setError('')
    if (!user || !session) {
      navigate('/auth?next=/briefings')
      return
    }

    setBusy('checkout')
    try {
      const data = await startConsumerCheckout(session, `${window.location.origin}/briefings`)
      window.location.href = data.url
    } catch (err) {
      console.warn('[CivicBriefing] Checkout API failed, using hosted link:', err)
      window.location.href = CHECKOUT_FALLBACK
    }
  }

  const handleConnectGmail = async () => {
    setError('')
    if (!user || !session) {
      navigate('/auth?next=/briefings')
      return
    }
    if (!isSubscribed) {
      await handleCheckout()
      return
    }

    setBusy('gmail')
    try {
      const data = await startGmailConnect(session, `${window.location.origin}/briefings`)
      window.location.href = data.url
    } catch (err) {
      setError(err.message)
      setBusy('')
    }
  }

  const handleDisconnectGmail = async () => {
    if (!session) return
    setError('')
    setBusy('gmail')
    try {
      await disconnectGmail(session)
      setNotice('Gmail has been disconnected.')
      await refreshSettings()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const savePreference = async () => {
    if (!session || !canUseLive) {
      await handleCheckout()
      return null
    }
    const saved = await saveBriefingPreference(session, {
      target,
      frequency,
      emailEnabled: true,
    })
    setPreferenceId(saved.preference.id)
    await refreshSettings()
    return saved.preference
  }

  const handleSave = async () => {
    setError('')
    setNotice('')
    setBusy('save')
    try {
      const saved = await savePreference()
      if (saved) setNotice('Briefing saved. Email updates will use this target and cadence.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const handlePreview = async () => {
    setError('')
    setNotice('')
    if (!canUseLive) {
      setBriefing(SAMPLE_BRIEFING)
      setNotice('Sample shown. Subscribe to generate live source-linked briefings.')
      return
    }

    setBusy('preview')
    try {
      const data = await generateBriefingPreview(session, { target, preferenceId })
      setBriefing(data.briefing)
      setNotice('Live briefing generated from public sources.')
      await refreshSettings()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const handleSendNow = async () => {
    setError('')
    setNotice('')
    if (!canUseLive) {
      await handleCheckout()
      return
    }
    if (!gmail.connected) {
      await handleConnectGmail()
      return
    }

    setBusy('send')
    try {
      let activePreferenceId = preferenceId
      if (!activePreferenceId) {
        const saved = await savePreference()
        activePreferenceId = saved?.id
      }
      const data = await sendBriefingNow(session, { target, preferenceId: activePreferenceId })
      setBriefing(data.briefing)
      setNotice('Briefing sent through your connected Gmail account.')
      await refreshSettings()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="bw civic-briefing">
      <SEO
        title="Civic Briefing Agent"
        description="BallotWatch Pro Civic Briefings summarize recent votes, bills, and source-backed positions for a district or member of Congress."
        path="/briefings"
      />

      <section className="briefing-hero">
        <div className="briefing-wrap briefing-hero-grid">
          <div className="briefing-hero-copy">
            <span className="kicker">BallotWatch Pro</span>
            <h1>Civic Briefing Agent</h1>
            <p>Enter a district or member of Congress and receive a neutral, source-linked briefing on recent votes, bills, and observed positions.</p>
            <div className="briefing-hero-actions">
              <button className="btn btn-primary" onClick={handlePreview} disabled={busy === 'preview'}>
                {busy === 'preview' ? 'Generating...' : 'Generate briefing'} <ArrowRight />
              </button>
              <button className="btn btn-ghost" onClick={handleSendNow} disabled={busy === 'send'}>
                <MailIcon /> {busy === 'send' ? 'Sending...' : 'Send to Gmail'}
              </button>
            </div>
          </div>

          <div className="briefing-status-panel">
            <div>
              <span className="briefing-panel-label">Account</span>
              <strong>{statusText}</strong>
            </div>
            <div className="briefing-status-row">
              <StatusPill tone={user ? 'ok' : 'muted'}>{user ? 'Signed in' : 'No account'}</StatusPill>
              <StatusPill tone={isSubscribed ? 'ok' : 'locked'}>{isSubscribed ? 'Pro active' : 'Paid feature'}</StatusPill>
              <StatusPill tone={gmail.connected ? 'ok' : 'muted'}>{gmail.connected ? 'Gmail connected' : 'Gmail pending'}</StatusPill>
            </div>
            {gmail.email && <p className="briefing-status-note">Connected as {gmail.email}</p>}
          </div>
        </div>
      </section>

      <section className="briefing-workspace">
        <div className="briefing-wrap briefing-layout">
          <aside className="briefing-control-panel">
            <div className="briefing-panel-heading">
              <span className="briefing-panel-label">Briefing Setup</span>
              <h2>Delivery</h2>
            </div>

            <label className="briefing-field">
              <span>District or candidate</span>
              <input
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                placeholder="CA-11 or Nancy Pelosi"
              />
            </label>

            <label className="briefing-field">
              <span>Email cadence</span>
              <select value={frequency} onChange={(event) => setFrequency(event.target.value)}>
                <option value="weekly">Weekly</option>
                <option value="daily">Daily</option>
              </select>
            </label>

            <div className="briefing-control-actions">
              <button className="btn btn-primary" onClick={handleSave} disabled={busy === 'save' || authLoading}>
                {busy === 'save' ? 'Saving...' : 'Save briefing'}
              </button>
              {isSubscribed ? (
                gmail.connected ? (
                  <button className="btn btn-ghost" onClick={handleDisconnectGmail} disabled={busy === 'gmail'}>
                    Disconnect Gmail
                  </button>
                ) : (
                  <button className="btn btn-ghost" onClick={handleConnectGmail} disabled={busy === 'gmail'}>
                    Connect Gmail
                  </button>
                )
              ) : (
                <button className="btn btn-ghost" onClick={handleCheckout} disabled={busy === 'checkout'}>
                  Subscribe for $2/mo
                </button>
              )}
            </div>

            {(notice || error) && (
              <div className={`briefing-message ${error ? 'error' : 'success'}`} role="status">
                {error || notice}
              </div>
            )}

            <dl className="briefing-meta-list">
              <div>
                <dt>Saved target</dt>
                <dd>{savedPreference?.target || 'None yet'}</dd>
              </div>
              <div>
                <dt>Last sent</dt>
                <dd>{formatDate(savedPreference?.last_sent_at)}</dd>
              </div>
              <div>
                <dt>Gmail scope</dt>
                <dd>Send only</dd>
              </div>
            </dl>
          </aside>

          <div className="briefing-preview-column">
            <div className="briefing-preview-toolbar">
              <div>
                <span className="briefing-panel-label">Email Preview</span>
                <h2>Modern civic update</h2>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={handlePreview} disabled={busy === 'preview'}>
                Refresh
              </button>
            </div>
            <BriefingPreview briefing={briefing} />
          </div>
        </div>
      </section>
    </div>
  )
}

export default CivicBriefing
