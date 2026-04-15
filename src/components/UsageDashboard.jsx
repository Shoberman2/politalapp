import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import '../styles/UsageDashboard.css'

function UsageDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [org, setOrg] = useState(null)
  const [usage, setUsage] = useState([])
  const [dailyUsage, setDailyUsage] = useState([])
  const [endpointUsage, setEndpointUsage] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month') // 'week' or 'month'

  useEffect(() => {
    if (!user) {
      navigate('/auth')
      return
    }
    loadUsage()
  }, [user, period])

  async function loadUsage() {
    setLoading(true)

    // Get org
    const { data: existingOrg } = await supabase
      .from('organizations')
      .select('*')
      .eq('owner_id', user.id)
      .single()

    if (!existingOrg) {
      setLoading(false)
      return
    }
    setOrg(existingOrg)

    // Get all keys for this org
    const { data: keys } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix, monthly_count, active')
      .eq('org_id', existingOrg.id)

    if (!keys || keys.length === 0) {
      setLoading(false)
      return
    }

    const keyIds = keys.map(k => k.id)

    // Date range
    const now = new Date()
    const startDate = period === 'week'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
      : new Date(now.getFullYear(), now.getMonth(), 1)

    // Get usage data
    const { data: usageData } = await supabase
      .from('api_usage')
      .select('endpoint, created_at, status_code, response_ms')
      .in('key_id', keyIds)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(1000)

    setUsage(usageData || [])

    // Aggregate by day
    const byDay = {}
    for (const row of usageData || []) {
      const day = new Date(row.created_at).toLocaleDateString()
      byDay[day] = (byDay[day] || 0) + 1
    }
    setDailyUsage(
      Object.entries(byDay)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => new Date(a.date) - new Date(b.date))
    )

    // Aggregate by endpoint
    const byEndpoint = {}
    for (const row of usageData || []) {
      byEndpoint[row.endpoint] = (byEndpoint[row.endpoint] || 0) + 1
    }
    setEndpointUsage(
      Object.entries(byEndpoint)
        .map(([endpoint, count]) => ({ endpoint, count }))
        .sort((a, b) => b.count - a.count)
    )

    setLoading(false)
  }

  if (!user) return null

  const totalThisMonth = org ? (
    usage.length
  ) : 0

  const avgResponseMs = usage.length > 0
    ? Math.round(usage.reduce((sum, r) => sum + (r.response_ms || 0), 0) / usage.length)
    : 0

  const errorCount = usage.filter(r => r.status_code >= 400).length

  return (
    <div className="usage-page">
      <div className="usage-header">
        <div>
          <h1>API Usage</h1>
          <p className="usage-subtitle">
            {org?.plan ? `${org.plan} plan` : 'No plan'} ·{' '}
            {org?.monthly_limit > 0
              ? `${totalThisMonth.toLocaleString()} / ${org.monthly_limit.toLocaleString()} requests`
              : `${totalThisMonth.toLocaleString()} requests`
            }
          </p>
        </div>
        <div className="usage-actions">
          <select value={period} onChange={e => setPeriod(e.target.value)} className="usage-period-select">
            <option value="week">Last 7 days</option>
            <option value="month">This month</option>
          </select>
          <button className="btn-tertiary" onClick={() => navigate('/developers/keys')}>
            Manage Keys
          </button>
        </div>
      </div>

      {loading ? (
        <div className="usage-loading">Loading usage data...</div>
      ) : (
        <>
          {/* Stats row */}
          <div className="usage-stats">
            <div className="usage-stat">
              <span className="usage-stat-value">{totalThisMonth.toLocaleString()}</span>
              <span className="usage-stat-label">Total Requests</span>
            </div>
            <div className="usage-stat">
              <span className="usage-stat-value">{avgResponseMs}ms</span>
              <span className="usage-stat-label">Avg Response</span>
            </div>
            <div className="usage-stat">
              <span className="usage-stat-value">{errorCount}</span>
              <span className="usage-stat-label">Errors</span>
            </div>
            {org?.monthly_limit > 0 && (
              <div className="usage-stat">
                <span className="usage-stat-value">
                  {Math.round((totalThisMonth / org.monthly_limit) * 100)}%
                </span>
                <span className="usage-stat-label">Quota Used</span>
              </div>
            )}
          </div>

          {/* Usage by day (simple bar chart) */}
          {dailyUsage.length > 0 && (
            <div className="usage-chart-section">
              <h3>Requests by day</h3>
              <div className="usage-bar-chart">
                {dailyUsage.map(day => {
                  const maxCount = Math.max(...dailyUsage.map(d => d.count))
                  const pct = maxCount > 0 ? (day.count / maxCount) * 100 : 0
                  return (
                    <div key={day.date} className="usage-bar-item">
                      <div className="usage-bar-fill" style={{ height: `${pct}%` }} />
                      <span className="usage-bar-label">{day.date.split('/').slice(0, 2).join('/')}</span>
                      <span className="usage-bar-count">{day.count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Usage by endpoint */}
          {endpointUsage.length > 0 && (
            <div className="usage-chart-section">
              <h3>Requests by endpoint</h3>
              <div className="usage-endpoint-list">
                {endpointUsage.map(ep => (
                  <div key={ep.endpoint} className="usage-endpoint-row">
                    <code>{ep.endpoint}</code>
                    <span className="usage-endpoint-count">{ep.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {usage.length === 0 && (
            <div className="usage-empty">
              <h3>No API requests yet</h3>
              <p>Make your first API call to see usage data here.</p>
              <button className="btn-primary" onClick={() => navigate('/developers/docs')}>
                Read the Docs
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default UsageDashboard
