import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SEO from './SEO'
import { useAuth } from '../context/AuthContext'
import {
  getBillAlertHistory,
  getBillAlertPreference,
  getBillFollows,
  setAllBillAlertEmailEnabled,
  stopBillFollow,
  updateBillFollow,
} from '../services/billAlerts'
import '../styles/BillAlerts.css'

function billPath(id) {
  const [congress, type, number] = id.split('-')
  return `/bill/${congress}/${type}/${number}`
}

function billLabel(id) {
  const [, type, number] = id.split('-')
  const labels = { hr: 'H.R.', s: 'S.', hjres: 'H.J.Res.', sjres: 'S.J.Res.', hconres: 'H.Con.Res.', sconres: 'S.Con.Res.', hres: 'H.Res.', sres: 'S.Res.' }
  return `${labels[type] || type.toUpperCase()} ${number}`
}

function eventLabel(type) {
  return type.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

export default function BillAlertsPage() {
  const { user } = useAuth()
  const [follows, setFollows] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [savingPreference, setSavingPreference] = useState(false)
  const [savingBillId, setSavingBillId] = useState('')
  const [drafts, setDrafts] = useState({})
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [followRows, historyRows, preference] = await Promise.all([
        getBillFollows(), getBillAlertHistory(), getBillAlertPreference(user.id),
      ])
      setFollows(followRows)
      setDrafts(Object.fromEntries(followRows.map((follow) => [follow.bill_id, {
        committeeAlerts: follow.committee_alerts,
        floorAlerts: follow.floor_alerts,
        voteAlerts: follow.vote_alerts,
        emailEnabled: follow.email_enabled,
        paused: Boolean(follow.paused_at),
      }])))
      setHistory(historyRows)
      setEmailEnabled(preference?.email_enabled !== false)
    } catch (err) {
      setError(err?.message || 'Your alert list could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [user.id])

  const toggleAllEmail = async () => {
    const next = !emailEnabled
    setEmailEnabled(next)
    setSavingPreference(true)
    setError('')
    try {
      await setAllBillAlertEmailEnabled(next)
    } catch (err) {
      setEmailEnabled(!next)
      setError(err?.message || 'Email preference could not be saved.')
    } finally {
      setSavingPreference(false)
    }
  }

  const stopWatching = async (billId) => {
    setError('')
    try {
      await stopBillFollow(billId)
      await load()
    } catch (err) {
      setError(err?.message || 'This bill could not be removed from your watchlist.')
    }
  }

  const saveFollow = async (billId, overrides = {}) => {
    const options = { ...drafts[billId], ...overrides }
    if (!options.committeeAlerts && !options.floorAlerts && !options.voteAlerts) {
      setError('Keep at least one update type selected.')
      return
    }
    setSavingBillId(billId)
    setError('')
    try {
      await updateBillFollow(billId, options)
      await load()
    } catch (err) {
      setError(err?.message || 'This alert could not be updated.')
    } finally {
      setSavingBillId('')
    }
  }

  const updateDraft = (billId, key) => {
    setDrafts((current) => ({
      ...current,
      [billId]: { ...current[billId], [key]: !current[billId]?.[key] },
    }))
  }

  return (
    <div className="alerts-page">
      <SEO title="Bill alerts" description="Manage the congressional bills BallotWatch is monitoring for you." path="/alerts" />
      <header className="alerts-header">
        <div className="alerts-kicker">Your watchlist</div>
        <h1>Bill <em>alerts</em></h1>
        <p>Follow official committee, floor, and vote activity without repeatedly checking Congress.gov.</p>
        <p className="alerts-provider-note">Email delivery is handled by Resend. Your address is used only to send the alerts you request.</p>
        <label className="alerts-email-toggle">
          <input type="checkbox" checked={emailEnabled} disabled={loading || savingPreference} onChange={toggleAllEmail} />
          Email alerts enabled
        </label>
      </header>

      {error && <div className="alerts-error" role="alert">{error}</div>}
      {loading ? (
        <div className="alerts-loading"><div className="loading-spinner" /><span>Loading your watchlist…</span></div>
      ) : (
        <>
          <section className="alerts-section">
            <div className="alerts-section-heading"><span>Watching</span><strong>{follows.length}</strong></div>
            {follows.length === 0 ? (
              <div className="alerts-empty"><h2>No bills watched yet</h2><p>Open any bill and choose “Watch this bill” to start.</p><Link to="/bills">Browse bills →</Link></div>
            ) : (
              <div className="alerts-follow-list">
                {follows.map((follow) => (
                  <article className="alerts-follow" key={follow.id}>
                    <div className="alerts-follow-content">
                      <Link className="alerts-bill-id" to={billPath(follow.bill_id)}>{billLabel(follow.bill_id)}</Link>
                      <h2>{follow.bills?.title || 'Congressional bill'}</h2>
                      <div className="alerts-follow-options" aria-label={`Alert types for ${billLabel(follow.bill_id)}`}>
                        <label><input type="checkbox" checked={drafts[follow.bill_id]?.committeeAlerts ?? false} onChange={() => updateDraft(follow.bill_id, 'committeeAlerts')} /> Committee</label>
                        <label><input type="checkbox" checked={drafts[follow.bill_id]?.floorAlerts ?? false} onChange={() => updateDraft(follow.bill_id, 'floorAlerts')} /> Floor</label>
                        <label><input type="checkbox" checked={drafts[follow.bill_id]?.voteAlerts ?? false} onChange={() => updateDraft(follow.bill_id, 'voteAlerts')} /> Votes</label>
                      </div>
                    </div>
                    <div className="alerts-follow-actions">
                      <button type="button" disabled={savingBillId === follow.bill_id} onClick={() => saveFollow(follow.bill_id)}>Save</button>
                      <button type="button" disabled={savingBillId === follow.bill_id} onClick={() => saveFollow(follow.bill_id, { paused: !drafts[follow.bill_id]?.paused })}>{drafts[follow.bill_id]?.paused ? 'Resume' : 'Pause'}</button>
                      <button className="alerts-stop" type="button" disabled={savingBillId === follow.bill_id} onClick={() => stopWatching(follow.bill_id)}>Stop</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="alerts-section">
            <div className="alerts-section-heading"><span>Recent activity</span><strong>30 days</strong></div>
            {history.length === 0 ? (
              <p className="alerts-muted">New official events for watched bills will appear here.</p>
            ) : (
              <div className="alerts-history">
                {history.map((event) => (
                  <article key={`${event.event_id}-${event.follow_id}`}>
                    <div className="alerts-history-date">{new Date(event.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                    <div><Link to={billPath(event.bill_id)}>{billLabel(event.bill_id)}</Link><h3>{event.headline}</h3><p>{eventLabel(event.event_type)} · {event.send_status || event.outbox_status}</p></div>
                    <a href={event.source_url} target="_blank" rel="noopener noreferrer">Source ↗</a>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
