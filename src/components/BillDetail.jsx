import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getBillDetails, getBillText, getBillActions, getBillCosponsors, getBillCommittees, getVoteTalliesFromActions, explainBillWithAI } from '../services/congress'
import { InfoTip } from './Tooltip'
import SEO from './SEO'
import '../styles/BillDetail.css'

function BillDetail() {
  const { congress, billType, number } = useParams()
  const navigate = useNavigate()

  const [bill, setBill] = useState(null)
  const [textVersions, setTextVersions] = useState([])
  const [actions, setActions] = useState([])
  const [cosponsors, setCosponsors] = useState([])
  const [committees, setCommittees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [voteTallies, setVoteTallies] = useState([])
  const [talliesLoading, setTalliesLoading] = useState(false)
  const [showAllCosponsors, setShowAllCosponsors] = useState(false)

  const [aiExplanation, setAiExplanation] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    fetchBillData()
  }, [congress, billType, number])

  useEffect(() => {
    if (!bill?.title) return
    let cancelled = false
    setAiLoading(true)
    setAiExplanation(null)
    const summary = bill.summaries?.[0]?.text?.replace(/<[^>]+>/g, '') || ''
    explainBillWithAI({ congress, billType, number, title: bill.title, summary })
      .then(result => {
        if (!cancelled) setAiExplanation(result)
      })
      .finally(() => {
        if (!cancelled) setAiLoading(false)
      })
    return () => { cancelled = true }
  }, [bill?.title, congress, billType, number])

  const fetchBillData = async () => {
    try {
      setLoading(true)

      const [billData, textData, actionsData, cosponsorsData, committeesData] = await Promise.all([
        getBillDetails(congress, billType, number),
        getBillText(congress, billType, number),
        getBillActions(congress, billType, number),
        getBillCosponsors(congress, billType, number),
        getBillCommittees(congress, billType, number)
      ])

      setBill(billData)
      setTextVersions(textData)
      setActions(actionsData)
      setCosponsors(cosponsorsData)
      setCommittees(committeesData)
      setError(null)

      setTalliesLoading(true)
      getVoteTalliesFromActions(actionsData)
        .then(tallies => setVoteTallies(tallies))
        .catch(err => console.error('Error loading vote tallies:', err))
        .finally(() => setTalliesLoading(false))
    } catch (err) {
      setError('Failed to load bill details. Please try again.')
      console.error('Error loading bill:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return ''
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getStatusInfo = () => {
    if (!bill) return { label: 'Loading', cls: 'status-progress' }
    const text = bill.latestAction?.text?.toLowerCase() || ''
    if (text.includes('became public law') || text.includes('signed by president')) {
      return { label: 'Became Law', cls: 'status-enacted' }
    }
    if (text.includes('passed house') && text.includes('passed senate')) {
      return { label: 'Passed Both Chambers · Awaiting Signature', cls: 'status-passed-both' }
    }
    if (text.includes('passed house')) return { label: 'Passed House · Awaiting Senate', cls: 'status-passed' }
    if (text.includes('passed senate')) return { label: 'Passed Senate · Awaiting House', cls: 'status-passed' }
    if (text.includes('committee')) return { label: 'In Committee', cls: 'status-committee' }
    if (text.includes('introduced')) return { label: 'Introduced', cls: 'status-introduced' }
    return { label: 'In Progress', cls: 'status-progress' }
  }

  const partyClass = (party) => {
    if (!party) return 'party-tag-ind'
    const p = party.toLowerCase()
    if (p.startsWith('d')) return 'party-tag-dem'
    if (p.startsWith('r')) return 'party-tag-rep'
    return 'party-tag-ind'
  }

  const partyAbbrev = (party) => {
    if (!party) return ''
    const p = party.toLowerCase()
    if (p.startsWith('d')) return 'D'
    if (p.startsWith('r')) return 'R'
    return 'I'
  }

  if (loading) {
    return (
      <div className="bill-detail-loading">
        <div className="loading-spinner"></div>
        <p>Loading bill details...</p>
      </div>
    )
  }

  if (error || !bill) {
    return (
      <div className="bill-detail-error">
        <div className="error-message">{error || 'Bill not found'}</div>
        <button className="bill-back-button" onClick={() => navigate('/bills')}>Back to Bills</button>
      </div>
    )
  }

  const sponsor = bill.sponsors?.[0]
  const status = getStatusInfo()

  const cosponsorByParty = cosponsors.reduce((acc, c) => {
    const p = c.party?.toLowerCase()?.charAt(0) || 'i'
    const k = p === 'd' ? 'dem' : p === 'r' ? 'rep' : 'ind'
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, { dem: 0, rep: 0, ind: 0 })

  return (
    <div className="bill-detail">
      <SEO
        title={bill.title || 'Bill Details'}
        description={`${bill.title || 'Bill'} — ${bill.latestAction?.text || 'View bill details, sponsors, and voting history.'}`}
        path={`/bill/${congress}/${billType}/${number}`}
        schema={{
          '@type': 'Legislation',
          name: bill.title,
          description: bill.summaries?.[0]?.text?.replace(/<[^>]+>/g, '').slice(0, 300) || bill.title,
          legislationIdentifier: `${billType.toUpperCase()}.${number}`,
          datePublished: bill.introducedDate,
          ...(sponsor && {
            sponsor: {
              '@type': 'Person',
              name: sponsor.fullName || `${sponsor.firstName} ${sponsor.lastName}`
            }
          }),
          ...(bill.latestAction?.text?.toLowerCase().includes('became public law') && {
            legislationPassedBy: 'United States Congress'
          })
        }}
      />

      {/* CRUMB */}
      <nav className="bill-crumb">
        <Link to="/">BallotWatch</Link>
        <span className="bill-crumb-sep">/</span>
        <Link to="/bills">Bills</Link>
        <span className="bill-crumb-sep">/</span>
        <span>{billType.toUpperCase()}. {number}</span>
      </nav>

      {/* MASTHEAD */}
      <header className="bill-masthead">
        <div className="bill-id-row">
          <span className="bill-masthead-id">{billType.toUpperCase()}. {number}</span>
          <span className="bill-masthead-congress">{congress}th Congress</span>
          <span className={`bill-status-pill ${status.cls}`}>
            <span className="bill-status-pill-dot"></span>{status.label}
          </span>
        </div>
        <h1 className="bill-masthead-title">{bill.title}</h1>
        <p className="bill-masthead-byline">
          {sponsor && (
            <>
              Sponsored by <Link className="bill-byline-sponsor" to={`/politician/${sponsor.bioguideId}`}>
                {sponsor.fullName || `${sponsor.firstName} ${sponsor.lastName}`}
              </Link>
              <span className={`bill-byline-party ${partyClass(sponsor.party)}`}>
                {partyAbbrev(sponsor.party)}{sponsor.state ? `-${sponsor.state}` : ''}
              </span>
              {' '}·{' '}
            </>
          )}
          {bill.introducedDate && <>introduced <span className="bill-byline-mono">{formatDate(bill.introducedDate)}</span></>}
          {cosponsors.length > 0 && <> · with <strong>{cosponsors.length}</strong> cosponsor{cosponsors.length !== 1 ? 's' : ''}</>}
          {bill.policyArea?.name && <> · policy area <em>{bill.policyArea.name}</em></>}
        </p>
        <div className="bill-masthead-actions">
          {textVersions[0]?.formats?.[0]?.url && (
            <a href={textVersions[0].formats[0].url} target="_blank" rel="noopener noreferrer" className="bill-action-btn">Read full text ↗</a>
          )}
          {bill.url && (
            <a href={bill.url} target="_blank" rel="noopener noreferrer" className="bill-action-btn">Congress.gov ↗</a>
          )}
        </div>
      </header>

      {/* TWO-COLUMN LAYOUT */}
      <div className="bill-layout">
        <div className="bill-main">

          {/* AI EXPLANATION — primary content */}
          <article className="bill-ai-card">
            <div className="bill-ai-label">
              <span className="bill-ai-pulse"></span>
              <InfoTip text="An AI assistant generates this plain-English explanation, grounded in the bill's official summary and title. It's meant to make the legalese accessible.">The bill, in plain English</InfoTip>
            </div>
            <div className="bill-ai-byline">Generated by gpt-4o-mini · grounded in the official summary · regenerated when the bill changes</div>
            <h2 className="bill-ai-headline">What this bill <em>actually does</em></h2>
            {aiLoading && (
              <div className="bill-ai-loading">
                <span className="loading-spinner-small"></span>
                <span>Generating explanation...</span>
              </div>
            )}
            {!aiLoading && aiExplanation && (
              <div className="bill-ai-prose">
                {aiExplanation.paragraphs?.length
                  ? aiExplanation.paragraphs.map((p, i) => <p key={i}>{p}</p>)
                  : <p>{aiExplanation.explanation}</p>}
              </div>
            )}
          </article>

          {/* OFFICIAL SUMMARY — collapsed */}
          {bill.summaries && bill.summaries.length > 0 && (
            <details className="bill-summary-block">
              <summary>Show official Congress.gov summary</summary>
              <div className="bill-summary-body" dangerouslySetInnerHTML={{ __html: bill.summaries[0].text }} />
            </details>
          )}

          {/* VOTE TALLIES */}
          {voteTallies.length > 0 && (
            <section className="bill-editorial-section">
              <div className="bill-section-label">Floor votes</div>
              <h2 className="bill-section-title">How the chambers <em>voted</em></h2>
              <div className="bill-tally-grid">
                {voteTallies.map((tally, index) => {
                  const total = (tally.totalYea || 0) + (tally.totalNay || 0) + (tally.totalNotVoting || 0) + (tally.totalPresent || 0)
                  const yeaFlex = tally.totalYea || 0
                  const nayFlex = tally.totalNay || 0
                  const otherFlex = (tally.totalNotVoting || 0) + (tally.totalPresent || 0)
                  const passed = tally.result?.toLowerCase().includes('passed') || tally.result?.toLowerCase().includes('agreed')
                  return (
                    <div key={index} className="bill-tally-card">
                      <div className="bill-tally-chamber">{tally.chamber || 'Congress'}</div>
                      {tally.date && <div className="bill-tally-date">{formatDate(tally.date)}</div>}
                      <div className={`bill-tally-result ${passed ? 'passed' : 'failed'}`}>{tally.result || 'N/A'}</div>
                      <div className="bill-tally-bar">
                        <div className="bill-tally-bar-yea" style={{ flex: yeaFlex }}></div>
                        <div className="bill-tally-bar-nay" style={{ flex: nayFlex }}></div>
                        {otherFlex > 0 && <div className="bill-tally-bar-other" style={{ flex: otherFlex }}></div>}
                      </div>
                      <div className="bill-tally-counts">
                        <span>{tally.totalYea || 0} Yea</span>
                        <span>{tally.totalNay || 0} Nay</span>
                        {(tally.totalNotVoting > 0 || tally.totalPresent > 0) && (
                          <span>{(tally.totalNotVoting || 0) + (tally.totalPresent || 0)} Other</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {talliesLoading && voteTallies.length === 0 && (
            <section className="bill-editorial-section">
              <div className="bill-section-loading">
                <span className="loading-spinner-small"></span>
                <span>Loading vote results...</span>
              </div>
            </section>
          )}

          {/* TIMELINE OF ACTIONS */}
          {actions.length > 0 && (
            <section className="bill-editorial-section" id="actions-section">
              <div className="bill-section-label">Legislative timeline</div>
              <h2 className="bill-section-title">What's happened <em>so far</em></h2>
              <div className="bill-timeline">
                {actions.slice(0, 12).map((action, index) => {
                  const text = (action.text || '').toLowerCase()
                  let kind = 'default'
                  if (text.includes('signed by president') || text.includes('became public law')) kind = 'enacted'
                  else if (text.includes('passed') || text.includes('agreed to')) kind = 'passed'
                  else if (text.includes('committee')) kind = 'committee'
                  else if (text.includes('introduced')) kind = 'introduced'

                  return (
                    <div key={index} className={`bill-tl-item ${index === 0 ? 'recent' : ''}`}>
                      <div className="bill-tl-date">{formatDate(action.actionDate)}</div>
                      <div className="bill-tl-text">
                        {action.text}
                        {action.actionCode && <span className="bill-tl-code">{action.actionCode}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        {/* RIGHT RAIL */}
        <aside className="bill-rail">
          {sponsor && (
            <div className="bill-rail-card bill-sponsor-card">
              <h3 className="bill-rail-h3">Sponsor</h3>
              <Link to={`/politician/${sponsor.bioguideId}`} className="bill-sp-name">
                {sponsor.fullName || `${sponsor.firstName} ${sponsor.lastName}`}
              </Link>
              <div className="bill-sp-meta">
                {sponsor.party} · {sponsor.state}{sponsor.district ? `-${sponsor.district}` : ''}
              </div>
            </div>
          )}

          {cosponsors.length > 0 && (
            <div className="bill-rail-card" id="sponsors-section">
              <h3 className="bill-rail-h3">Cosponsors ({cosponsors.length})</h3>
              <div className="bill-cosp-breakdown">
                {cosponsorByParty.dem > 0 && (
                  <div className="bill-cosp-row">
                    <span className="bill-cosp-party party-tag-dem">Democrats</span>
                    <span className="bill-cosp-count">{cosponsorByParty.dem}</span>
                  </div>
                )}
                {cosponsorByParty.rep > 0 && (
                  <div className="bill-cosp-row">
                    <span className="bill-cosp-party party-tag-rep">Republicans</span>
                    <span className="bill-cosp-count">{cosponsorByParty.rep}</span>
                  </div>
                )}
                {cosponsorByParty.ind > 0 && (
                  <div className="bill-cosp-row">
                    <span className="bill-cosp-party party-tag-ind">Independents</span>
                    <span className="bill-cosp-count">{cosponsorByParty.ind}</span>
                  </div>
                )}
              </div>
              <button
                className="bill-cosp-toggle"
                onClick={() => setShowAllCosponsors(!showAllCosponsors)}
              >
                {showAllCosponsors ? 'Hide list' : `View all ${cosponsors.length} →`}
              </button>
              {showAllCosponsors && (
                <div className="bill-cosp-list">
                  {cosponsors.map((c) => (
                    <Link key={c.bioguideId} to={`/politician/${c.bioguideId}`} className="bill-cosp-item">
                      {c.fullName || `${c.firstName} ${c.lastName}`}
                      <span className={`bill-cosp-item-party ${partyClass(c.party)}`}>
                        {partyAbbrev(c.party)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {(committees.length > 0 || bill.committees?.count > 0) && (
            <div className="bill-rail-card" id="committees-section">
              <h3 className="bill-rail-h3">
                <InfoTip text="Committees are small groups of Congress members who specialize in specific topics. Bills are sent to relevant committees for detailed review before the full chamber votes.">Committees</InfoTip>
              </h3>
              {committees.length > 0 ? committees.map((c, i) => (
                <div key={i} className="bill-committee-item">
                  {c.chamber && <div className="bill-committee-chamber">{c.chamber}</div>}
                  <div className="bill-committee-name">{c.name}</div>
                </div>
              )) : (
                <div className="bill-committee-item">
                  <div className="bill-committee-name">{bill.committees.count} referred · see Congress.gov for details</div>
                </div>
              )}
            </div>
          )}

          {textVersions.length > 0 && (
            <div className="bill-rail-card">
              <h3 className="bill-rail-h3">Bill text</h3>
              {textVersions.slice(0, 3).map((v, i) => (
                <a key={i} href={v.formats?.[0]?.url || bill.url} target="_blank" rel="noopener noreferrer" className="bill-text-version">
                  <span className="bill-tv-type">{v.type || 'Full Text'}</span>
                  <span className="bill-tv-date">{formatDate(v.date)}</span>
                </a>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

export default BillDetail
