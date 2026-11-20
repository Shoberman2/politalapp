import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import SEO from './SEO'
import { getMembersIndex, membersFromPrerender, groupMembers } from '../services/membersIndex'
import { MEMBER_GROUPS, MEMBERS_CONGRESS, memberSeat } from '../../shared/membersIndex.js'
import { memberPath } from '../../shared/memberSlug.js'
import { ordinalCongress, partyLetter } from '../../shared/memberRecord.js'
import { toStateName } from '../utils/states'
import '../styles/InfoPage.css'
import '../styles/MembersIndex.css'

const DESCRIPTION = `Every member of the ${ordinalCongress(MEMBERS_CONGRESS)} U.S. Congress with a recorded vote: senators, representatives and delegates, each linked to a source-cited voting record.`

// The server-rendered page embeds its list; the first render needs no fetch.
function readEmbedded() {
  try {
    const el = typeof document !== 'undefined' ? document.getElementById('__bw_page') : null
    if (!el) return null
    return membersFromPrerender(JSON.parse(el.textContent || 'null'))
  } catch {
    return null
  }
}

export default function MembersIndex() {
  const [data, setData] = useState(() => readEmbedded() ?? undefined)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (data) return undefined
    let cancelled = false
    getMembersIndex()
      .then((d) => { if (!cancelled) setData(d) })
      .catch((err) => {
        console.error('[MembersIndex] load failed:', err)
        if (!cancelled) setFailed(true)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const groups = useMemo(() => (data ? groupMembers(data.members) : null), [data])

  return (
    <div className="bw info-page ip-wide members-index">
      <SEO title={`Members of Congress, ${ordinalCongress(MEMBERS_CONGRESS)} Congress`} description={DESCRIPTION} path="/members" />
      <section className="ip-hero">
        <div className="ip-inner">
          <h1 className="ip-title">Members Of Congress</h1>
          <p className="ip-lede">
            {data
              ? `${data.total} members with a recorded vote in the ${ordinalCongress(MEMBERS_CONGRESS)} Congress. Each page lists the member's votes, linked to the official roll call.`
              : failed ? 'The list could not be loaded. Try again in a moment.' : 'Loading the list of members.'}
          </p>
        </div>
      </section>
      {groups && MEMBER_GROUPS.filter(([key]) => groups[key]?.length).map(([key, label]) => (
        <section key={key}>
          <div className="ip-inner">
            <h2>{label}</h2>
            <p className="mi-count">{groups[key].length} members</p>
            <ul className="mi-list">
              {groups[key].map((m) => (
                <li key={m.id}>
                  <Link to={memberPath(m.id, m.name)}>{m.name}</Link>{' '}
                  <span className="mi-meta">{partyLetter(m.party)} · {toStateName(m.state) || m.state} · {memberSeat(m)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  )
}
