import { Link } from 'react-router-dom'
import SEO from './SEO'
import { BRAND } from '../config/brand'
import '../styles/InfoPage.css'

const GITHUB_URL = 'https://github.com/Shoberman2/politalapp'

function AboutPage() {
  return (
    <div className="bw info-page about-page">
      <SEO
        title="About"
        description={`${BRAND.name} is an open-source, nonpartisan record of the U.S. Congress and a direct line to your representatives. Not affiliated with Congress or any party.`}
        path="/about"
      />

      <section className="ip-hero">
        <div className="ip-inner">
          <span className="ip-kicker">About</span>
          <h1 className="ip-title">An open, nonpartisan record of Congress, and a direct line to the people in it.</h1>
          <blockquote className="ip-quote">
            <p className="about-mission">{BRAND.mission}</p>
          </blockquote>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>What {BRAND.name} is</h2>
          <p>
            Who represents you, how they voted on every recorded roll call, and what the bills in front of them do,
            with every fact linked to its official source. When you want to say something about a vote, you write
            to your representative yourself.
          </p>
          <div className="ip-links">
            <Link className="btn-text btn-go" to="/how-it-works">How it works</Link>
            <Link className="btn-text btn-go" to="/data-sources">How we get our data</Link>
          </div>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Independent and nonpartisan</h2>
          <p>
            {BRAND.name} is not affiliated with the U.S. Congress, any government agency, or any political party or
            campaign. Every member gets the same template. We don’t score, rank, or endorse anyone.
          </p>
          <div className="ip-links">
            <Link className="btn-text btn-go" to="/methodology/corrections">Corrections policy</Link>
          </div>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Open source</h2>
          <p>
            The code is MIT licensed and public on GitHub, including the data pipeline and the methodology behind
            every number. Anyone can read how it works, reuse it, or propose a fix.
          </p>
          <div className="ip-links">
            <a className="btn-text btn-go" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">Source on GitHub</a>
            <Link className="btn-text btn-go" to="/open">Open data</Link>
            <Link className="btn-text btn-go" to="/developers">API</Link>
          </div>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>For congressional offices</h2>
          <p>
            We’re also building a channel that helps offices answer constituents from their own published record.
            It is in development and not offered for use yet.
          </p>
          <div className="ip-links">
            <Link className="btn-text btn-go" to="/offices">For offices</Link>
            <Link className="btn-text btn-go" to="/contact">Contact</Link>
          </div>
        </div>
      </section>
    </div>
  )
}

export default AboutPage
