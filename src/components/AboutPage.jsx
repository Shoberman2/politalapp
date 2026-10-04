import { Link } from 'react-router-dom'
import SEO from './SEO'
import { BRAND } from '../config/brand'
import '../styles/InfoPage.css'
import '../styles/AboutPage.css'

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
          <h1>An open, nonpartisan record of Congress, and a direct line to the people in it.</h1>
          <p className="about-mission">{BRAND.mission}</p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>What {BRAND.name} is</h2>
          <p>
            {BRAND.name} shows who represents you, how they voted on every recorded roll call, and what the bills
            in front of them actually do. Every fact links to its official source: Congress.gov, the House Clerk,
            the Senate, and the Census Bureau.
          </p>
          <p>
            When you want to say something about a vote, we help you write to your representative yourself, through
            their office’s official contact page. A person writes every message.
          </p>
          <div className="ip-links">
            <Link to="/how-it-works">How it works</Link>
            <Link to="/methodology">Methodology</Link>
          </div>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Independent and nonpartisan</h2>
          <p>
            {BRAND.name} is not affiliated with the U.S. Congress, any government agency, or any political party or
            campaign. Every member gets the same template. We don’t score, rank, or endorse anyone, and corrections
            are about the record, not about political agreement.
          </p>
          <div className="ip-links">
            <Link to="/methodology/corrections">Corrections policy</Link>
          </div>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Open source</h2>
          <p>
            The code is MIT licensed and public on GitHub, including the data pipeline and the methodology behind
            every number. The data comes from public sources under their own terms. Anyone can read how it works,
            reuse it, or propose a fix.
          </p>
          <div className="ip-links">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">Source on GitHub</a>
            <Link to="/open">Open data</Link>
            <Link to="/developers">API</Link>
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
            <Link to="/offices">For offices</Link>
            <Link to="/contact">Contact</Link>
          </div>
        </div>
      </section>
    </div>
  )
}

export default AboutPage
