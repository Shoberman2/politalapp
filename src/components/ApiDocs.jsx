import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/ApiDocs.css'

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/v1/members',
    description: 'List all members of Congress with optional filters.',
    params: [
      { name: 'state', type: 'string', description: 'Two-letter state code (e.g., CA, NY)' },
      { name: 'chamber', type: 'string', description: '"house" or "senate"' },
      { name: 'party', type: 'string', description: 'Party name filter (e.g., Democrat, Republican)' },
      { name: 'offset', type: 'integer', description: 'Pagination offset (default: 0)' },
      { name: 'limit', type: 'integer', description: 'Results per page, max 100 (default: 20)' },
    ],
    example: '/api/v1/members?state=CA&chamber=house&limit=10',
    response: `{
  "data": [
    {
      "id": "G000559",
      "name": "John Garamendi",
      "chamber": "house",
      "state": "CA",
      "district": "8",
      "party": "Democrat",
      "photo_url": "..."
    }
  ],
  "pagination": { "offset": 0, "limit": 10, "total": 52 },
  "meta": { "api_version": "v1", "data_updated_at": "2026-04-13T11:00:00Z" }
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/members/:bioguideId',
    description: 'Get details for a single member by BioGuide ID.',
    params: [],
    example: '/api/v1/members/P000197',
    response: `{
  "data": {
    "id": "P000197",
    "name": "Nancy Pelosi",
    "chamber": "house",
    "state": "CA",
    "district": "11",
    "party": "Democrat"
  },
  "meta": { "api_version": "v1" }
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/members/:bioguideId/votes',
    description: 'Get voting history for a member, joined with bill metadata.',
    params: [
      { name: 'offset', type: 'integer', description: 'Pagination offset' },
      { name: 'limit', type: 'integer', description: 'Results per page, max 100' },
    ],
    example: '/api/v1/members/P000197/votes?limit=5',
    response: `{
  "data": [
    {
      "id": 12345,
      "position": "Yea",
      "voted_at": "2026-04-10",
      "roll_call_id": "house-119-1-123",
      "bill": {
        "id": "119-hr-1234",
        "title": "Affordable Insulin Act",
        "crs_summary": "...",
        "policy_area": "Health"
      }
    }
  ],
  "pagination": { "offset": 0, "limit": 5, "total": 142 }
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/members/:bioguideId/stats',
    description: 'Get pre-computed voting statistics for a member.',
    params: [],
    example: '/api/v1/members/P000197/stats',
    response: `{
  "data": {
    "member": { "id": "P000197", "name": "Nancy Pelosi", ... },
    "stats": [
      {
        "congress": 119,
        "total_votes": 142,
        "yea_count": 98,
        "nay_count": 34,
        "party_loyalty_pct": 94
      }
    ]
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/bills',
    description: 'List bills with filters for policy area, date range, and keyword search.',
    params: [
      { name: 'policy_area', type: 'string', description: 'Filter by policy area (e.g., Health, Defense)' },
      { name: 'search', type: 'string', description: 'Keyword search in bill titles' },
      { name: 'date_from', type: 'date', description: 'Filter by introduction date (YYYY-MM-DD)' },
      { name: 'date_to', type: 'date', description: 'Filter by introduction date (YYYY-MM-DD)' },
      { name: 'offset', type: 'integer', description: 'Pagination offset' },
      { name: 'limit', type: 'integer', description: 'Results per page, max 100' },
    ],
    example: '/api/v1/bills?policy_area=Health&limit=5',
  },
  {
    method: 'GET',
    path: '/api/v1/bills/:id',
    description: 'Get a single bill with full details, CRS summary, AI summary, and related articles.',
    params: [],
    example: '/api/v1/bills/119-hr-1234',
  },
  {
    method: 'GET',
    path: '/api/v1/votes',
    description: 'List roll call votes with enriched member and bill data.',
    params: [
      { name: 'chamber', type: 'string', description: '"house" or "senate"' },
      { name: 'date_from', type: 'date', description: 'Filter by vote date' },
      { name: 'date_to', type: 'date', description: 'Filter by vote date' },
      { name: 'offset', type: 'integer', description: 'Pagination offset' },
      { name: 'limit', type: 'integer', description: 'Results per page, max 100' },
    ],
    example: '/api/v1/votes?chamber=senate&limit=10',
  },
  {
    method: 'GET',
    path: '/api/v1/votes/:rollCallId',
    description: 'Get a full roll call: every member\'s vote, party breakdown, and bill info.',
    params: [],
    example: '/api/v1/votes/house-119-1-123',
  },
  {
    method: 'GET',
    path: '/api/v1/stats',
    description: 'Aggregate statistics and rankings.',
    params: [
      { name: 'type', type: 'string', description: '"party_loyalty", "attendance", or "bills_by_area"' },
      { name: 'chamber', type: 'string', description: '"house" or "senate" (for party_loyalty)' },
      { name: 'limit', type: 'integer', description: 'Number of results (default: 20)' },
    ],
    example: '/api/v1/stats?type=party_loyalty&chamber=senate&limit=10',
  },
  {
    method: 'GET',
    path: '/api/v1/search',
    description: 'Cross-table search for members and bills.',
    params: [
      { name: 'q', type: 'string', required: true, description: 'Search query' },
      { name: 'type', type: 'string', description: '"members", "bills", or omit for both' },
      { name: 'limit', type: 'integer', description: 'Results per type (default: 10)' },
    ],
    example: '/api/v1/search?q=pelosi&type=members',
  },
]

function ApiDocs() {
  const [activeEndpoint, setActiveEndpoint] = useState(0)
  const navigate = useNavigate()

  const endpoint = ENDPOINTS[activeEndpoint]

  return (
    <div className="api-docs">
      <div className="api-docs-header">
        <h1>API Reference</h1>
        <p>Base URL: <code>https://www.ballotwatch.io</code></p>
        <p>Authentication: <code>Authorization: Bearer bw_live_xxx</code></p>
      </div>

      <div className="api-docs-layout">
        {/* Sidebar */}
        <nav className="api-docs-nav">
          <h3>Endpoints</h3>
          {ENDPOINTS.map((ep, i) => (
            <button
              key={i}
              className={`api-docs-nav-item ${i === activeEndpoint ? 'active' : ''}`}
              onClick={() => setActiveEndpoint(i)}
            >
              <span className="api-docs-method">{ep.method}</span>
              <span className="api-docs-path">{ep.path}</span>
            </button>
          ))}
          <div className="api-docs-nav-divider" />
          <button className="api-docs-nav-cta" onClick={() => navigate('/developers/keys')}>
            Get API Key
          </button>
        </nav>

        {/* Content */}
        <div className="api-docs-content">
          <div className="api-docs-endpoint">
            <div className="api-docs-endpoint-header">
              <span className="api-docs-method-badge">{endpoint.method}</span>
              <code className="api-docs-endpoint-path">{endpoint.path}</code>
            </div>
            <p className="api-docs-endpoint-desc">{endpoint.description}</p>

            {/* Parameters */}
            {endpoint.params.length > 0 && (
              <div className="api-docs-section">
                <h3>Parameters</h3>
                <table className="api-docs-params-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {endpoint.params.map(p => (
                      <tr key={p.name}>
                        <td><code>{p.name}</code>{p.required && <span className="api-docs-required">required</span>}</td>
                        <td>{p.type}</td>
                        <td>{p.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Example */}
            {endpoint.example && (
              <div className="api-docs-section">
                <h3>Example Request</h3>
                <pre className="api-docs-code">
{`curl -H "Authorization: Bearer bw_live_your_key_here" \\
  "https://www.ballotwatch.io${endpoint.example}"`}
                </pre>
              </div>
            )}

            {/* Response */}
            {endpoint.response && (
              <div className="api-docs-section">
                <h3>Example Response</h3>
                <pre className="api-docs-code">{endpoint.response}</pre>
              </div>
            )}
          </div>

          {/* Auth section */}
          <div className="api-docs-auth-section">
            <h3>Authentication</h3>
            <p>All API requests require a valid API key in the Authorization header:</p>
            <pre className="api-docs-code">Authorization: Bearer bw_live_your_key_here</pre>
            <p>Get your API key at <a href="/developers/keys">/developers/keys</a>.</p>

            <h3>Rate Limits</h3>
            <table className="api-docs-params-table">
              <thead>
                <tr><th>Plan</th><th>Monthly Limit</th><th>Price</th></tr>
              </thead>
              <tbody>
                <tr><td>Starter</td><td>10,000 requests</td><td>$50/mo</td></tr>
                <tr><td>Pro</td><td>100,000 requests</td><td>$200/mo</td></tr>
                <tr><td>Enterprise</td><td>Unlimited</td><td>$500/mo</td></tr>
              </tbody>
            </table>
            <p>When you exceed your limit, the API returns <code>429 Too Many Requests</code> with a <code>Retry-After</code> header.</p>

            <h3>Error Codes</h3>
            <table className="api-docs-params-table">
              <thead>
                <tr><th>Status</th><th>Code</th><th>Description</th></tr>
              </thead>
              <tbody>
                <tr><td>401</td><td>UNAUTHORIZED</td><td>Missing or invalid API key</td></tr>
                <tr><td>403</td><td>KEY_REVOKED</td><td>API key has been revoked</td></tr>
                <tr><td>403</td><td>SUBSCRIPTION_INACTIVE</td><td>No active subscription</td></tr>
                <tr><td>404</td><td>NOT_FOUND</td><td>Resource not found</td></tr>
                <tr><td>429</td><td>RATE_LIMIT_EXCEEDED</td><td>Monthly request limit reached</td></tr>
                <tr><td>503</td><td>SERVICE_UNAVAILABLE</td><td>Temporary outage, retry later</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ApiDocs
