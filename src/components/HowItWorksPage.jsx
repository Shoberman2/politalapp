import { Link } from 'react-router-dom'
import SEO from './SEO'
import InfoIndex from './InfoIndex'
import { BRAND } from '../config/brand'
import { SHOW_BILL_ALERTS } from '../config/features'
import { AI_NEVER, AI_USES } from '../data/infoPages'
import '../styles/InfoPage.css'

// The concept in four ideas, not a manual. Detail lives on /data-sources and
// /methodology; keep this page short.

const LOOP = [
  {
    title: 'Read the record',
    body: 'See how your members voted on every roll call, each linked to its official source.',
    link: { to: '/my-representative', label: 'Find my reps' },
  },
  {
    title: 'Write to your rep',
    body: 'Start from the facts of a vote, add your own words, and send it yourself.',
    link: { to: '/this-week', label: 'Pick a vote' },
  },
  {
    title: 'Offices answer from their own words',
    tag: 'Where we’re headed',
    body: 'Offices reply from what they have published, never in a voice they didn’t write.',
    link: { to: '/offices', label: 'For offices' },
  },
  {
    title: 'See how they vote next',
    body: 'Follow a bill with a free account and hear when it reaches committee, the floor, or a recorded vote.',
    link: SHOW_BILL_ALERTS ? { to: '/alerts', label: 'Follow a bill' } : { to: '/this-week', label: 'This week' },
  },
]

const LIVE = [
  { label: 'Your representatives', to: '/my-representative' },
  { label: 'Every House and Senate roll call', to: '/this-week' },
  { label: 'Bills in plain English', to: '/bills' },
  { label: 'This week on the floor', to: '/this-week' },
  { label: 'A record in 60 seconds', to: '/all' },
  { label: 'Tell your rep', to: '/this-week' },
  SHOW_BILL_ALERTS && { label: 'Bill alerts (free account)', to: '/alerts' },
  { label: 'Free API and MCP server', to: '/developers' },
].filter(Boolean)

const DEEPER = [
  { to: '/data-sources', title: 'How we get our data', dek: 'Every source, what we take from it, and how often.' },
  { to: '/methodology', title: 'Methodology', dek: 'How each number and explanation is made.' },
  { to: '/about', title: `About ${BRAND.name}`, dek: 'Independent, nonpartisan, and open source.' },
]

function HowItWorksPage() {
  return (
    <div className="bw info-page how-page">
      <SEO
        title="How It Works"
        description={`How ${BRAND.name} works: read your members' voting record, write to them yourself, and follow what they vote on next. Every fact links to its official source.`}
        path="/how-it-works"
      />

      <section className="ip-hero">
        <div className="ip-inner">
          <span className="ip-kicker">How it works</span>
          <h1 className="ip-title">Read the record. Reach the people in it.</h1>
          <p className="ip-lede">
            {BRAND.name} takes the official record of Congress, links every fact to its source, and puts it next to
            the people who represent you.
          </p>
        </div>
      </section>

      <section aria-label="How it works, in four steps">
        <div className="ip-inner">
          <ol className="ip-steps">
            {LOOP.map((step) => (
              <li key={step.title}>
                {step.tag && <p className="ip-tag">{step.tag}</p>}
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                <div className="ip-links">
                  <Link className="btn-text btn-go" to={step.link.to}>{step.link.label}</Link>
                </div>
              </li>
            ))}
          </ol>
          <p className="ip-loop">Then the next vote, and the loop starts again.</p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>What’s live today</h2>
          <ul className="ip-checks">
            {LIVE.map((item) => (
              <li key={item.label}><Link to={item.to}>{item.label}</Link></li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>AI that explains. It never speaks for anyone.</h2>
          <div className="ip-pair">
            <div className="ip-pair-info">
              <h3>We use AI to</h3>
              <ul>{AI_USES.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            <div>
              <h3>We never use AI to</h3>
              <ul>{AI_NEVER.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Go deeper</h2>
          <InfoIndex items={DEEPER} />
        </div>
      </section>
    </div>
  )
}

export default HowItWorksPage
