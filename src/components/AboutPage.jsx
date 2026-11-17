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
          <h1 className="ip-title">An Open, Nonpartisan Record Of Congress</h1>
          <blockquote className="ip-quote">
            <p className="about-mission">{BRAND.mission}</p>
          </blockquote>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>What {BRAND.name} Is</h2>
          <p>
            Who represents you, how they voted on every recorded roll call, and what the bills in front of them do,
            with every fact linked to its official source. When you want to say something about a vote, you write
            to your representative yourself.
          </p>
          <div className="ip-links">
            <Link className="btn-text" to="/how-it-works">How it works</Link>
            <Link className="btn-text" to="/data-sources">How we get our data</Link>
          </div>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Independent And Nonpartisan</h2>
          <p>
            {BRAND.name} is not affiliated with the U.S. Congress, any government agency, or any political party or
            campaign. Every member gets the same template. We don’t score, rank, or endorse anyone.
          </p>
          <div className="ip-links">
            <Link className="btn-text" to="/methodology/corrections">Corrections policy</Link>
          </div>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Open Source</h2>
          <p>
            The code is MIT licensed and public on GitHub, including the data pipeline and the methodology behind
            every number. Anyone can read how it works, reuse it, or propose a fix.
          </p>
          <div className="ip-links">
            <a className="btn-text" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">Source on GitHub</a>
            <Link className="btn-text" to="/open">Open data</Link>
            <Link className="btn-text" to="/developers">API</Link>
          </div>
        </div>
      </section>

    </div>
  )
}

export default AboutPage
