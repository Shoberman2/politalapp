import { Link } from 'react-router-dom'
import SEO from './SEO'
import { BRAND } from '../config/brand'
import '../styles/InfoPage.css'
import '../styles/HowItWorksPage.css'

// Plain-English walkthrough of the product. Keep the AI lists in step with
// the landing page's "How we use AI" section.

const STEPS = [
  {
    title: 'Find who represents you',
    body: 'Enter a ZIP code or a street address. The U.S. Census Bureau geocoder maps it to your congressional district, and the district gives you your House member and your two senators. When a ZIP code alone can’t pin down your district, a street address settles it.',
    links: [
      { label: 'Find your representatives', to: '/my-representative' },
      { label: 'Data sources', to: '/methodology/data-sources' },
    ],
  },
  {
    title: 'See every vote',
    body: 'Every recorded roll call in the House and the Senate, from the House Clerk and the Senate, with the tally, the result, and how each member voted. Each record links to its official source so you can check it.',
    links: [
      { label: 'Browse members', to: '/all' },
      { label: 'Methodology', to: '/methodology' },
    ],
  },
  {
    title: 'Read bills in plain English',
    body: 'Each bill shows its official title, status, and actions from Congress.gov. Where the Congressional Research Service has published its official summary, we add a short plain-English explanation written with AI from that summary, and the official summary is one click away. When there is no summary yet, we say so rather than guess from the title.',
    links: [
      { label: 'Browse bills', to: '/bills' },
      { label: 'How AI explanations are made', to: '/methodology/ai-explanations' },
    ],
  },
  {
    title: 'This week on the floor',
    body: 'The House publishes its weekly floor schedule at docs.house.gov. We show this week and next, next to the latest recorded votes. The Senate publishes no equivalent schedule, so Senate items appear once they are voted on.',
    links: [{ label: 'This week', to: '/this-week' }],
  },
  {
    title: 'A record in 60 seconds',
    body: 'Every member gets the same short card: their seat, votes cast and not voting this Congress, and their ten most recent recorded votes, each linked to the roll call. The template is identical for everyone, so no member is framed differently from another.',
    links: [{ label: 'Find a member', to: '/all' }],
  },
  {
    title: 'Tell your rep',
    body: 'From a vote, a bill, or a member page, open a short factual outline of what happened. You write the message, copy it, and send it yourself through the office’s official contact page. We never send it, and we never store what you wrote.',
    links: [{ label: 'Privacy', to: '/privacy' }],
  },
  {
    title: 'Bill alerts',
    body: 'Sign in and watch a bill. When it reaches a committee, the floor schedule, or a recorded vote, it shows up on your alerts page, with an email if you turn email on.',
    links: [{ label: 'Bill alerts', to: '/alerts' }],
  },
]

const SOURCES = [
  { name: 'Congress.gov', detail: 'Members, bills, actions, and CRS summaries' },
  { name: 'Office of the Clerk, U.S. House', detail: 'House roll-call votes' },
  { name: 'U.S. Senate', detail: 'Senate roll-call votes' },
  { name: 'docs.house.gov', detail: 'The House weekly floor schedule' },
  { name: 'U.S. Census Bureau', detail: 'Address and ZIP code to district' },
  { name: 'Federal Election Commission', detail: 'Campaign finance context' },
]

const AI_USES = [
  'Explain bills from the official summary, with the source beside it',
  'Explain what a procedural vote actually decided',
  'Help you, or your AI assistant, find the right roll call',
]

const AI_NEVER = [
  'Write in your representative’s voice or guess their positions',
  'Send anything you haven’t read and approved',
  'Choose a side for you, or rank and score constituents',
]

function HowItWorksPage() {
  return (
    <div className="bw info-page how-page">
      <SEO
        title="How It Works"
        description={`How ${BRAND.name} works: find who represents you, see every recorded vote, read bills in plain English, and contact your representatives yourself. Where the data comes from and how AI is used.`}
        path="/how-it-works"
      />

      <section className="ip-hero">
        <div className="ip-inner">
          <span className="ip-kicker">How it works</span>
          <h1>The public record, made easy to read and easy to act on.</h1>
          <p className="ip-lede">
            {BRAND.name} takes the official record of Congress, links every fact to its source, and puts it next
            to the people who represent you. Here is what it does, step by step.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <ol className="how-steps">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span className="how-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h2>{step.title}</h2>
                  <p>{step.body}</p>
                  <div className="ip-links">
                    {step.links.map((l) => <Link key={l.to + l.label} to={l.to}>{l.label}</Link>)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <span className="ip-kicker">Where the data comes from</span>
          <h2>Official public sources, refreshed daily</h2>
          <dl className="how-sources">
            {SOURCES.map((s) => (
              <div key={s.name}>
                <dt>{s.name}</dt>
                <dd>{s.detail}</dd>
              </div>
            ))}
          </dl>
          <p className="ip-muted how-note">
            The record is shown as published. The only value we compute is a roll call’s result, from its tally and
            question. Spot an error? <Link to="/methodology/corrections">Send a correction</Link>.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <span className="ip-kicker">How we use AI</span>
          <div className="how-ai">
            <div className="how-ai-col how-ai-use">
              <h3>We use AI to</h3>
              <ul>{AI_USES.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            <div className="how-ai-col how-ai-never">
              <h3>We never use AI to</h3>
              <ul>{AI_NEVER.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          </div>
          <div className="ip-links">
            <Link to="/methodology/ai-explanations">How AI explanations are made</Link>
            <Link to="/about">About {BRAND.name}</Link>
          </div>
        </div>
      </section>
    </div>
  )
}

export default HowItWorksPage
