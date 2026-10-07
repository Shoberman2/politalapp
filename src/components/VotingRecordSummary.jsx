import { useEffect, useState } from 'react'
import { getMemberDashboardData } from '../services/supabaseVotes'
import { computePartyCrossover } from '../services/votingPatterns'
import { getVotingIdeology } from '../services/voteviewIdeology'
import '../styles/VotingRecordSummary.css'

const CORRECTION_URL = 'https://github.com/Shoberman2/politalapp/issues/new?template=data_correction.yml'

function partyName(party) {
  const normalized = String(party || '').toLowerCase()
  if (normalized.startsWith('d')) return 'Democratic'
  if (normalized.startsWith('r')) return 'Republican'
  if (normalized.startsWith('i')) return 'Independent'
  return party || 'Not listed'
}

export default function VotingRecordSummary({ bioguideId, party, displayName }) {
  const [state, setState] = useState({ loading: true, data: null, ideology: null })

  useEffect(() => {
    let active = true

    Promise.allSettled([
      getMemberDashboardData(bioguideId),
      getVotingIdeology(bioguideId),
    ]).then(([dashboardResult, ideologyResult]) => {
      if (!active) return
      setState({
        loading: false,
        data: dashboardResult.status === 'fulfilled' ? dashboardResult.value : null,
        ideology: ideologyResult.status === 'fulfilled' ? ideologyResult.value : null,
      })
    })

    return () => { active = false }
  }, [bioguideId])

  if (state.loading) {
    return (
      <section className="pol-record-summary" aria-label="Loading voting history summary">
        <div className="pol-record-skeleton" />
      </section>
    )
  }

  const stats = state.data?.stats
  const votes = state.data?.votes || []
  const ideology = state.ideology
  const crossover = computePartyCrossover({ bioguideId, partyCode: party, votes })
  const votesCast = stats
    ? (stats.yea_count || 0) + (stats.nay_count || 0) + (stats.present_count || 0)
    : votes.filter(vote => ['Yea', 'Yes', 'Nay', 'No', 'Present'].includes(vote.position)).length
  const totalVotes = stats?.total_votes || votes.length
  const participation = totalVotes > 0 ? Math.round((votesCast / totalVotes) * 100) : null

  return (
    <section className="pol-record-summary" aria-labelledby="record-summary-title">
      <div className="pol-section-label">Voting history · at a glance</div>
      <div className="pol-record-heading-row">
        <h2 id="record-summary-title" className="pol-section-title">The record, up front</h2>
        {ideology?.congress && <span className="pol-record-congress">{ideology.congress}th Congress</span>}
      </div>

      <div className="pol-record-grid">
        <div className="pol-ideology-summary">
          <span className="pol-record-eyebrow">Voting record most closely aligns with</span>
          <strong className="pol-ideology-label">
            {ideology?.label || 'Ideology estimate unavailable'}
          </strong>
          <div className="pol-ideology-scale" aria-label={ideology?.available ? `${ideology.label}, ${ideology.confidence} confidence` : ideology?.label}>
            <span className="pol-ideology-line">
              {ideology?.placement != null && (
                <span className="pol-ideology-marker" style={{ left: `${ideology.placement}%` }} />
              )}
            </span>
            <span className="pol-ideology-endpoints"><span>Liberal</span><span>Conservative</span></span>
          </div>
          <div className="pol-record-source-line">
            <span>Official party: {partyName(party)}</span>
            {ideology?.available && <span>{ideology.confidence} model confidence</span>}
          </div>
        </div>

        <dl className="pol-record-stats">
          <div><dt>Roll calls</dt><dd>{totalVotes || '—'}</dd></div>
          <div><dt>Participation</dt><dd>{participation == null ? '—' : `${participation}%`}</dd></div>
          <div><dt>Party-majority match</dt><dd>{stats?.party_loyalty_pct == null ? '—' : `${Math.round(stats.party_loyalty_pct)}%`}</dd></div>
          <div><dt>Different from party</dt><dd>{crossover.substantiveCount ? `${crossover.crossoverRate}%` : '—'}</dd></div>
        </dl>
      </div>

      <details className="pol-record-method">
        <summary>How this estimate works</summary>
        <div className="pol-record-method-body">
          <p>
            Voteview estimates a member’s position from recorded congressional roll calls.
            BallotWatch translates its modern first dimension into a plain-language range;
            {ideology?.votes ? ` this estimate uses ${ideology.votes.toLocaleString()} Voteview-coded votes.` : ' no label is shown without enough coded votes.'}
          </p>
          <p>
            This is BallotWatch analysis, not an official affiliation or self-identification.
            Narrower labels such as “populist” or “neoconservative” are not inferred from party
            alone because this model does not measure those ideas reliably.
          </p>
          <p>
            <a href={ideology?.methodologyUrl || 'https://voteview.com/articles/data_help_members'} target="_blank" rel="noopener noreferrer">Read the Voteview methodology ↗</a>
            {' · '}
            <a href={CORRECTION_URL} target="_blank" rel="noopener noreferrer">Request a source-linked correction ↗</a>
          </p>
        </div>
      </details>
    </section>
  )
}
