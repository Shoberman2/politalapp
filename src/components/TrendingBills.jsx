import { useState, useEffect } from 'react'
import TrendingBillCard from './TrendingBillCard'
import { getTrendingBills } from '../services/congress'
import '../styles/TrendingBills.css'

function TrendingBills({ bills: billsProp }) {
  const [bills, setBills] = useState(billsProp || [])
  const [loading, setLoading] = useState(!billsProp)

  useEffect(() => {
    if (billsProp) {
      setBills(billsProp)
      setLoading(false)
      return
    }
    const fetchTrending = async () => {
      try {
        const results = await getTrendingBills()
        setBills(results)
      } catch (err) {
        console.error('[TrendingBills] Error fetching trending bills:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchTrending()
  }, [billsProp])

  if (loading) {
    return (
      <div className="trending-bills-section">
        <h2 className="trending-bills-title">In the News</h2>
        <div className="trending-bills-loading">
          <div className="loading-spinner"></div>
          <p>Loading notable bills...</p>
        </div>
      </div>
    )
  }

  if (bills.length === 0) return null

  return (
    <div className="trending-bills-section">
      <h2 className="trending-bills-title">In the News</h2>
      <p className="trending-bills-subtitle">Bills with significant press coverage and public interest</p>
      <div className="trending-bills-scroll">
        {bills.map((bill) => (
          <TrendingBillCard
            key={`${bill.congress}-${bill.type}-${bill.number}`}
            bill={bill}
          />
        ))}
      </div>
    </div>
  )
}

export default TrendingBills
