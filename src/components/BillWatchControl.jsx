import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getBillFollow, startBillFollow, stopBillFollow, updateBillFollow } from '../services/billAlerts'

function optionsFrom(follow) {
  return {
    committeeAlerts: follow?.committee_alerts ?? true,
    floorAlerts: follow?.floor_alerts ?? true,
    voteAlerts: follow?.vote_alerts ?? true,
    emailEnabled: follow?.email_enabled ?? true,
    paused: Boolean(follow?.paused_at),
  }
}

export default function BillWatchControl({ billId }) {
  const { user, loading: authLoading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [follow, setFollow] = useState(null)
  const [options, setOptions] = useState(optionsFrom(null))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    setError('')
    if (!user) {
      setFollow(null)
      return () => { cancelled = true }
    }
    setLoading(true)
    getBillFollow(billId)
      .then((value) => {
        if (cancelled) return
        setFollow(value)
        setOptions(optionsFrom(value))
      })
      .catch(() => { if (!cancelled) setError('Alert settings could not be loaded.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [billId, user])

  const run = async (action) => {
    setLoading(true)
    setError('')
    setSaved(false)
    try {
      const value = await action()
      if (value) {
        setFollow(value)
        setOptions(optionsFrom(value))
      }
      setSaved(true)
    } catch (err) {
      setError(err?.message || 'Your alert settings could not be saved.')
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) return null

  if (!user) {
    return (
      <div className="bill-rail-card bill-watch-card">
        <div className="bill-watch-kicker">Bill alerts</div>
        <h3>Get the next update</h3>
        <p>Sign in to receive an email when this bill reaches committee, the floor, or a recorded vote.</p>
        <button
          type="button"
          className="bill-watch-primary"
          onClick={() => navigate(`/auth?next=${encodeURIComponent(location.pathname)}`)}
        >
          Sign in to watch
        </button>
      </div>
    )
  }

  if (!follow) {
    return (
      <div className="bill-rail-card bill-watch-card">
        <div className="bill-watch-kicker">Bill alerts</div>
        <h3>Watch this bill</h3>
        <p>We’ll email your confirmed account address for committee, floor, and recorded-vote updates.</p>
        <button
          type="button"
          className="bill-watch-primary"
          disabled={loading}
          onClick={() => run(() => startBillFollow(billId))}
        >
          {loading ? 'Saving…' : 'Watch this bill'}
        </button>
        {error && <p className="bill-watch-error" role="alert">{error}</p>}
      </div>
    )
  }

  const toggle = (key) => setOptions((current) => ({ ...current, [key]: !current[key] }))
  const hasEventType = options.committeeAlerts || options.floorAlerts || options.voteAlerts

  return (
    <div className="bill-rail-card bill-watch-card bill-watch-card--active">
      <div className="bill-watch-status"><span /> Watching this bill</div>
      <p>Choose which official updates should trigger email.</p>
      <div className="bill-watch-options">
        <label><input type="checkbox" checked={options.committeeAlerts} onChange={() => toggle('committeeAlerts')} /> Committee activity</label>
        <label><input type="checkbox" checked={options.floorAlerts} onChange={() => toggle('floorAlerts')} /> Floor schedule</label>
        <label><input type="checkbox" checked={options.voteAlerts} onChange={() => toggle('voteAlerts')} /> Recorded votes</label>
      </div>
      {!hasEventType && <p className="bill-watch-error" role="alert">Keep at least one update type selected.</p>}
      {error && <p className="bill-watch-error" role="alert">{error}</p>}
      {saved && !error && <p className="bill-watch-saved" role="status">Settings saved.</p>}
      <div className="bill-watch-actions">
        <button
          type="button"
          className="bill-watch-primary"
          disabled={loading || !hasEventType}
          onClick={() => run(() => updateBillFollow(billId, options))}
        >Save</button>
        <button
          type="button"
          className="bill-watch-secondary"
          disabled={loading}
          onClick={() => run(() => updateBillFollow(billId, { ...options, paused: !options.paused }))}
        >{options.paused ? 'Resume' : 'Pause'}</button>
      </div>
      <div className="bill-watch-footer">
        <Link to="/alerts">Manage all alerts</Link>
        <button type="button" disabled={loading} onClick={() => run(async () => {
          await stopBillFollow(billId)
          setFollow(null)
          return null
        })}>Stop watching</button>
      </div>
    </div>
  )
}
