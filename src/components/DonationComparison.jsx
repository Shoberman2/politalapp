import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import SEO from './SEO'
import { getDonationsByPoliticianName } from '../services/donations'
import { getIndustryBreakdown, formatCurrency } from '../data/industryMap'
import '../styles/DonationComparison.css'

function DonationComparison() {
  const navigate = useNavigate()
  const [nameA, setNameA] = useState('')
  const [nameB, setNameB] = useState('')
  const [dataA, setDataA] = useState(null)
  const [dataB, setDataB] = useState(null)
  const [industryA, setIndustryA] = useState([])
  const [industryB, setIndustryB] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleCompare = async () => {
    if (!nameA.trim() || !nameB.trim()) return

    setLoading(true)
    setError(null)

    try {
      const [resultA, resultB] = await Promise.all([
        getDonationsByPoliticianName(nameA.trim()),
        getDonationsByPoliticianName(nameB.trim()),
      ])

      setDataA(resultA)
      setDataB(resultB)

      if (resultA?.donors) setIndustryA(getIndustryBreakdown(resultA.donors))
      else setIndustryA([])

      if (resultB?.donors) setIndustryB(getIndustryBreakdown(resultB.donors))
      else setIndustryB([])

      if (!resultA && !resultB) {
        setError('No campaign finance data found for either politician.')
      }
    } catch (err) {
      setError('Failed to load comparison data. Please try again.')
      console.error('[DonationComparison] Error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Get all unique industries across both politicians
  const allIndustries = [...new Set([
    ...industryA.map(s => s.industry),
    ...industryB.map(s => s.industry),
  ])].filter(i => !['Retired', 'Self-Employed', 'Not Disclosed'].includes(i))

  const getAmount = (breakdown, industry) => {
    const sector = breakdown.find(s => s.industry === industry)
    return sector?.totalAmount || 0
  }

  const maxAmount = Math.max(
    ...allIndustries.map(i => Math.max(getAmount(industryA, i), getAmount(industryB, i))),
    1
  )

  return (
    <div className="donation-comparison">
      <SEO
        title="Compare Campaign Funding"
        description="Compare campaign finance data between two politicians. See which industries fund each."
        path="/compare"
      />

      <h1>Compare Campaign Funding</h1>
      <p className="comparison-subtitle">
        See which industries fund each politician. Enter two names to compare.
      </p>

      <div className="comparison-inputs">
        <div className="comparison-input-group">
          <label>Politician A</label>
          <input
            type="text"
            value={nameA}
            onChange={e => setNameA(e.target.value)}
            placeholder="e.g., Nancy Pelosi"
            onKeyDown={e => e.key === 'Enter' && handleCompare()}
          />
        </div>
        <span className="comparison-vs">vs</span>
        <div className="comparison-input-group">
          <label>Politician B</label>
          <input
            type="text"
            value={nameB}
            onChange={e => setNameB(e.target.value)}
            placeholder="e.g., Mitch McConnell"
            onKeyDown={e => e.key === 'Enter' && handleCompare()}
          />
        </div>
        <button
          className="btn-primary"
          onClick={handleCompare}
          disabled={loading || !nameA.trim() || !nameB.trim()}
        >
          {loading ? 'Comparing...' : 'Compare'}
        </button>
      </div>

      {error && <p className="comparison-error">{error}</p>}

      {(dataA || dataB) && !loading && (
        <div className="comparison-results">
          <div className="comparison-header-row">
            <div className="comparison-col-label" />
            <div className="comparison-col">
              <h3>{dataA?.candidate?.name || nameA}</h3>
              {dataA && <span className="comparison-total">{formatCurrency(dataA.totalRaised)} raised</span>}
              {!dataA && <span className="comparison-no-data">No data</span>}
            </div>
            <div className="comparison-col">
              <h3>{dataB?.candidate?.name || nameB}</h3>
              {dataB && <span className="comparison-total">{formatCurrency(dataB.totalRaised)} raised</span>}
              {!dataB && <span className="comparison-no-data">No data</span>}
            </div>
          </div>

          {allIndustries.map(industry => {
            const amtA = getAmount(industryA, industry)
            const amtB = getAmount(industryB, industry)

            return (
              <div key={industry} className="comparison-row">
                <div className="comparison-col-label">{industry}</div>
                <div className="comparison-col">
                  <div className="comparison-bar-track">
                    <div
                      className="comparison-bar-fill a"
                      style={{ width: `${(amtA / maxAmount) * 100}%` }}
                    />
                  </div>
                  <span className="comparison-amount">{amtA > 0 ? formatCurrency(amtA) : '-'}</span>
                </div>
                <div className="comparison-col">
                  <div className="comparison-bar-track">
                    <div
                      className="comparison-bar-fill b"
                      style={{ width: `${(amtB / maxAmount) * 100}%` }}
                    />
                  </div>
                  <span className="comparison-amount">{amtB > 0 ? formatCurrency(amtB) : '-'}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default DonationComparison
