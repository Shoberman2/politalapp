import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import '../styles/ApiKeyManager.css'

function ApiKeyManager() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [org, setOrg] = useState(null)
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [newKeyName, setNewKeyName] = useState('')
  const [showNewKey, setShowNewKey] = useState(null) // full key shown once
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  const loadData = useCallback(async () => {
    if (!user) return

    // Load or create org
    let { data: existingOrg } = await supabase
      .from('organizations')
      .select('*')
      .eq('owner_id', user.id)
      .single()

    if (!existingOrg) {
      const { data: newOrg, error: orgError } = await supabase
        .from('organizations')
        .insert({ name: `${user.email}'s Organization`, owner_id: user.id })
        .select()
        .single()

      if (orgError) {
        setError('Failed to create organization')
        setLoading(false)
        return
      }
      existingOrg = newOrg
    }

    setOrg(existingOrg)

    // Load keys
    const { data: orgKeys } = await supabase
      .from('api_keys')
      .select('*')
      .eq('org_id', existingOrg.id)
      .order('created_at', { ascending: false })

    setKeys(orgKeys || [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (!user) {
      navigate('/auth')
      return
    }
    loadData()
  }, [user, navigate, loadData])

  async function createKey() {
    if (!org || creating) return
    if (keys.filter(k => k.active).length >= 5) {
      setError('Maximum 5 active API keys per organization')
      return
    }

    setCreating(true)
    setError(null)

    try {
      // Generate key: bw_live_ + 32 hex chars
      const randomBytes = new Uint8Array(16)
      crypto.getRandomValues(randomBytes)
      const hexString = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')
      const rawKey = `bw_live_${hexString}`
      const prefix = rawKey.slice(0, 12)

      // Hash with SHA-256
      const encoder = new TextEncoder()
      const data = encoder.encode(rawKey)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      const { error: insertError } = await supabase
        .from('api_keys')
        .insert({
          org_id: org.id,
          key_hash: hashHex,
          key_prefix: prefix,
          name: newKeyName.trim() || 'Default',
        })

      if (insertError) {
        setError('Failed to create API key')
        return
      }

      setShowNewKey(rawKey)
      setNewKeyName('')
      await loadData()
    } catch (err) {
      setError('Failed to create API key')
    } finally {
      setCreating(false)
    }
  }

  async function revokeKey(keyId) {
    if (!confirm('Revoke this API key? Any integrations using it will immediately stop working.')) return

    const { error: updateError } = await supabase
      .from('api_keys')
      .update({ active: false })
      .eq('id', keyId)

    if (!updateError) {
      await loadData()
    }
  }

  function copyKey() {
    if (showNewKey) {
      navigator.clipboard.writeText(showNewKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (!user) return null

  if (loading) {
    return (
      <div className="api-keys-page">
        <div className="api-keys-loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="api-keys-page">
      <div className="api-keys-header">
        <div>
          <h1>API Keys</h1>
          <p className="api-keys-subtitle">
            Manage your BallotWatch API keys.{' '}
            {org?.subscription_status === 'active'
              ? <span className="api-keys-plan-badge">{org.plan} plan</span>
              : <span className="api-keys-plan-inactive">No active subscription</span>
            }
          </p>
        </div>
        <button className="btn-tertiary" onClick={() => navigate('/developers/usage')}>
          View Usage
        </button>
      </div>

      {/* New key modal */}
      {showNewKey && (
        <div className="api-keys-modal-overlay" onClick={() => setShowNewKey(null)}>
          <div className="api-keys-modal" onClick={e => e.stopPropagation()}>
            <h3>Your new API key</h3>
            <p className="api-keys-modal-warning">
              Copy this key now. You won't be able to see it again.
            </p>
            <div className="api-keys-modal-key">
              <code>{showNewKey}</code>
              <button onClick={copyKey} className="btn-copy">
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="api-keys-modal-usage">
              Use it in your requests:<br />
              <code>Authorization: Bearer {showNewKey}</code>
            </p>
            <button className="btn-primary" onClick={() => setShowNewKey(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {error && <div className="api-keys-error">{error}</div>}

      {/* Create new key */}
      <div className="api-keys-create">
        <input
          type="text"
          placeholder="Key name (e.g., production, staging)"
          value={newKeyName}
          onChange={e => setNewKeyName(e.target.value)}
          maxLength={50}
        />
        <button
          className="btn-primary"
          onClick={createKey}
          disabled={creating || keys.filter(k => k.active).length >= 5}
        >
          {creating ? 'Creating...' : 'Create API Key'}
        </button>
      </div>

      {/* Key list */}
      <div className="api-keys-list">
        {keys.length === 0 ? (
          <p className="api-keys-empty">No API keys yet. Create one to get started.</p>
        ) : (
          keys.map(key => (
            <div key={key.id} className={`api-key-row ${!key.active ? 'api-key-revoked' : ''}`}>
              <div className="api-key-info">
                <div className="api-key-name">
                  {key.name}
                  {!key.active && <span className="api-key-revoked-badge">Revoked</span>}
                </div>
                <code className="api-key-prefix">{key.key_prefix}...</code>
                <div className="api-key-meta">
                  Created {new Date(key.created_at).toLocaleDateString()}
                  {key.last_used_at && ` · Last used ${new Date(key.last_used_at).toLocaleDateString()}`}
                  {key.active && ` · ${key.monthly_count || 0} requests this month`}
                </div>
              </div>
              {key.active && (
                <button className="btn-danger-sm" onClick={() => revokeKey(key.id)}>
                  Revoke
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {org?.subscription_status !== 'active' && (
        <div className="api-keys-subscribe-prompt">
          <h3>Subscribe to activate your API keys</h3>
          <p>API keys require an active subscription. Choose a plan to get started.</p>
          <button className="btn-primary" onClick={() => navigate('/developers#pricing')}>
            View Plans
          </button>
        </div>
      )}
    </div>
  )
}

export default ApiKeyManager
