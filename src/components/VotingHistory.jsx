import { useState, useEffect, useRef } from 'react'
import { getMemberSponsorship, explainBillWithAI } from '../services/congress'
import '../styles/VotingHistory.css'

const GLOSSARY = {
  'introduced': 'The bill was formally submitted to Congress for the first time. This is the first step in the legislative process — it doesn\'t mean it\'s been debated or voted on yet.',
  'referred to': 'The bill was sent to a specific congressional committee for review. Committees study bills in detail before deciding whether to send them to the full chamber for a vote.',
  'committee': 'A small group of members of Congress assigned to focus on a specific topic (like finance, defense, or education). Most bills are reviewed by a committee before the full House or Senate votes.',
  'passed house': 'The bill received a majority vote in the House of Representatives (at least 218 of 435 members). It still needs to pass the Senate and be signed by the President to become law.',
  'passed senate': 'The bill received a majority vote in the Senate (at least 51 of 100 senators). It still needs to pass the House (if it hasn\'t) and be signed by the President.',
  'enrolled': 'The final, official copy of the bill that passed both the House and Senate. This version is sent to the President for signature.',
  'signed by president': 'The President approved the bill by signing it. It is now law.',
  'became public law': 'The bill has completed the entire legislative process and is now an official law of the United States.',
  'vetoed': 'The President rejected the bill. Congress can override a veto with a two-thirds vote in both chambers, but this is rare.',
  'cloture': 'A Senate procedure to end debate (filibuster) on a bill. It requires 60 out of 100 senators to agree. Without cloture, a single senator can block a vote indefinitely.',
  'engrossed': 'The official version of a bill as passed by one chamber (House or Senate). It\'s prepared in final form before being sent to the other chamber.',
  'markup': 'When a committee meets to debate, amend, and rewrite a bill before sending it to the full chamber. This is where major changes often happen.',
  'cosponsor': 'A member of Congress who formally supports a bill introduced by someone else. Having many cosponsors signals broad support.',
  'sponsor': 'The member of Congress who originally wrote and introduced the bill. Each bill has one primary sponsor.',
  'resolution': 'A formal statement by one or both chambers of Congress. Some resolutions have the force of law (joint resolutions), while others just express opinions.',
  'amendment': 'A proposed change to a bill. Amendments are debated and voted on during the legislative process.',
  'appropriations': 'Bills that authorize the government to spend money. These are essential for funding federal programs and agencies.',
  'tabled': 'The bill was set aside and is unlikely to be voted on. This is often a way to quietly kill a bill without a direct vote.',
  'discharged': 'A bill was forced out of committee and brought to the full chamber for a vote, bypassing the normal committee process. This is rare and usually signals strong support.',
  'conference': 'When the House and Senate pass different versions of the same bill, a conference committee of members from both chambers works out a compromise version.'
}

function VotingHistory({ bioguideId }) {
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedBill, setExpandedBill] = useState(null)
  const [billExplanations, setBillExplanations] = useState({})
  const [activeTooltip, setActiveTooltip] = useState(null)
  const tooltipRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target) && !e.target.closest('.glossary-term')) {
        setActiveTooltip(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const annotateText = (text) => {
    if (!text) return text
    let result = text
    const matches = []

    for (const [term, definition] of Object.entries(GLOSSARY)) {
      const regex = new RegExp(`(${term})`, 'gi')
      let match
      while ((match = regex.exec(text)) !== null) {
        matches.push({ start: match.index, end: match.index + match[0].length, term, original: match[0], definition })
      }
    }

    if (matches.length === 0) return text

    // Sort by position, take longest match when overlapping
    matches.sort((a, b) => a.start - b.start || b.end - a.end)
    const filtered = []
    let lastEnd = -1
    for (const m of matches) {
      if (m.start >= lastEnd) {
        filtered.push(m)
        lastEnd = m.end
      }
    }

    const parts = []
    let cursor = 0
    for (const m of filtered) {
      if (m.start > cursor) {
        parts.push(text.slice(cursor, m.start))
      }
      const key = `${m.term}-${m.start}`
      parts.push(
        <span
          key={key}
          className="glossary-term"
          onClick={(e) => {
            e.stopPropagation()
            setActiveTooltip(activeTooltip === key ? null : key)
          }}
        >
          {m.original}
          {activeTooltip === key && (
            <span className="glossary-tooltip" ref={tooltipRef}>
              <strong>{m.original}</strong>
              <span>{m.definition}</span>
            </span>
          )}
        </span>
      )
      cursor = m.end
    }
    if (cursor < text.length) {
      parts.push(text.slice(cursor))
    }

    return parts
  }

  useEffect(() => {
    const fetchBills = async () => {
      if (!bioguideId) return

      try {
        setLoading(true)
        setError(null)
        const sponsoredBills = await getMemberSponsorship(bioguideId)
        setBills(sponsoredBills.slice(0, 10))
      } catch (err) {
        setError('Failed to load legislative activity')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchBills()
  }, [bioguideId])

  const handleExpandBill = async (bill, index) => {
    if (expandedBill === index) {
      setExpandedBill(null)
    } else {
      setExpandedBill(index)

      if (!billExplanations[index]) {
        const explanation = await explainBillWithAI(
          bill.title,
          bill.latestAction?.text || ''
        )
        setBillExplanations(prev => ({
          ...prev,
          [index]: explanation
        }))
      }
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getBillTypeColor = (type) => {
    const types = {
      'hr': '#3b82f6',
      's': '#8b5cf6',
      'hjres': '#10b981',
      'sjres': '#f59e0b'
    }
    return types[type?.toLowerCase()] || '#6b7280'
  }

  if (loading) {
    return (
      <div className="voting-history">
        <h3>Legislative Activity</h3>
        <div className="voting-history-loading">
          <div className="skeleton-bill"></div>
          <div className="skeleton-bill"></div>
          <div className="skeleton-bill"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="voting-history">
        <h3>Legislative Activity</h3>
        <div className="voting-history-error">{error}</div>
      </div>
    )
  }

  if (!bills || bills.length === 0) {
    return (
      <div className="voting-history">
        <h3>Legislative Activity</h3>
        <div className="voting-history-empty">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM16 18H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" fill="#ccc"/>
          </svg>
          <p>No recent legislative activity available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="voting-history">
      <div className="history-header">
        <h3>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" fill="url(#gradient2)"/>
            <defs>
              <linearGradient id="gradient2" x1="4" y1="2" x2="20" y2="22">
                <stop offset="0%" stopColor="#667eea"/>
                <stop offset="100%" stopColor="#764ba2"/>
              </linearGradient>
            </defs>
          </svg>
          Legislative Activity
        </h3>
        <span className="bill-count">{bills.length} Bills</span>
      </div>

      <div className="bills-list">
        {bills.map((bill, index) => {
          const isExpanded = expandedBill === index
          const explanation = billExplanations[index]

          return (
            <div key={index} className="bill-item">
              <div className="bill-header" onClick={() => handleExpandBill(bill, index)}>
                <div className="bill-info">
                  <div className="bill-title-row">
                    <span
                      className="bill-type-badge"
                      style={{ backgroundColor: getBillTypeColor(bill.type) }}
                    >
                      {bill.number || 'Bill'}
                    </span>
                    <h4 className="bill-title">{bill.title}</h4>
                  </div>
                  {bill.latestAction && (
                    <p className="bill-action">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" fill="currentColor"/>
                      </svg>
                      <span className="action-text-annotated">
                        {annotateText(bill.latestAction.text)}
                      </span>
                      {bill.latestAction.actionDate && (
                        <span className="action-date"> • {formatDate(bill.latestAction.actionDate)}</span>
                      )}
                    </p>
                  )}
                </div>
                <button className={`expand-button ${isExpanded ? 'expanded' : ''}`}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" fill="currentColor"/>
                  </svg>
                </button>
              </div>

              {isExpanded && (
                <div className="bill-explanation">
                  <div className="ai-badge">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V9.99h7V2.99L19 7v2H5l7-4.01v7z" fill="currentColor"/>
                    </svg>
                    AI-Powered Explanation
                  </div>

                  {explanation ? (
                    <div className="explanation-content">
                      {explanation.paragraphs && explanation.paragraphs.length > 0 ? (
                        explanation.paragraphs.map((paragraph, i) => (
                          <p key={i} className="explanation-text">{paragraph}</p>
                        ))
                      ) : (
                        <p className="explanation-text">{explanation.explanation}</p>
                      )}
                    </div>
                  ) : (
                    <div className="explanation-loading">
                      <div className="loading-spinner-small"></div>
                      <span>Generating explanation...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default VotingHistory
