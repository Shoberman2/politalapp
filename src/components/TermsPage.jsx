import { Link } from 'react-router-dom'
import SEO from './SEO'
import { BRAND } from '../config/brand'
import '../styles/InfoPage.css'

// NOTE FOR MAINTAINERS: plain-language terms drafted 2026-10-04. They have NOT
// been reviewed by counsel. Have counsel review them before relying on them.
// API limits quoted here mirror api/_lib/auth.js defaults; keep them in sync.

const LAST_UPDATED = 'October 6, 2026'
const REPO_URL = 'https://github.com/Shoberman2/politalapp'

function ContactLine() {
  if (BRAND.contactEmail) {
    return <>email <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a></>
  }
  return <>see our <Link to="/contact">contact page</Link></>
}

function TermsPage() {
  return (
    <div className="bw info-page ip-compact legal-page">
      <SEO
        title="Terms of Use"
        description={`Plain-language terms for using ${BRAND.name}, its API, and its data.`}
        path="/terms"
      />

      <section className="ip-hero">
        <div className="ip-inner">
          <span className="ip-kicker">Terms</span>
          <h1 className="ip-title">Terms of use</h1>
          <p className="ip-lede">
            By using {BRAND.name}, its API, or its MCP server, you agree to these terms. We’ve kept them short and
            plain.
          </p>
          <p className="ip-updated">Last updated: {LAST_UPDATED}</p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>An informational service</h2>
          <p>
            {BRAND.name} presents the public record of the U.S. Congress for information only. It is not legal,
            political, or professional advice, and it is not an official government record. For anything that
            matters, check the official source linked on every record.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Public data can contain errors</h2>
          <p>
            Our data comes from public sources such as Congress.gov, the House Clerk, the Senate, the Census Bureau,
            and the FEC. Those sources, and our processing of them, can contain errors or lag behind events. If you
            find a mistake, please tell us through our <Link to="/methodology/corrections">corrections process</Link>.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>AI explanations</h2>
          <p>
            Some explanations are written with AI from official summaries and records. They are explanatory, they can
            be wrong or incomplete, and they don’t replace the official text. See{' '}
            <Link to="/methodology/ai-explanations">how AI explanations are made</Link>.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>No affiliation with government</h2>
          <p>
            {BRAND.name} is independent. It is not affiliated with, endorsed by, or speaking for the U.S. Congress,
            any member or office, any government agency, or any political party.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Messages you send</h2>
          <p>
            Tell your rep helps you draft a message, but you write it and you send it, through your representative’s
            official contact page. You are responsible for what you send. Don’t use {BRAND.name} to harass anyone,
            impersonate someone, or send messages on behalf of people who haven’t approved them.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Accounts and acceptable use</h2>
          <p>
            An account is free. You need one for the app’s tools (your representatives, the bills browser, the district map, the shutdown
            tracker, campaign-finance comparison and AI Congress); member
            profiles, record cards, bills, votes, the members list and the public API don’t need one. Keep your account credentials
            secure and give accurate information. Don’t try to break, overload, or get
            around the security or limits of the service, and don’t use it for anything unlawful.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>The API and MCP server</h2>
          <ul className="ip-bullets">
            <li>
              Without a key, use is limited to 60 requests per minute and 5,000 per day per IP address. A free key
              raises the limit; paid plans carry the quotas shown on the <Link to="/developers">developer page</Link>.
            </li>
            <li>Don’t share keys publicly or use multiple keys or addresses to get around limits.</li>
            <li>
              When you publish data from the API, please credit {BRAND.name} and the official source URL included
              with each record.
            </li>
            <li>We may change limits, or suspend access that harms the service, with or without notice.</li>
          </ul>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Licenses</h2>
          <p>
            The {BRAND.name} source code is available under the MIT License on{' '}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>. Congressional data is drawn from
            public sources and remains subject to those sources’ own terms. Member photos and third-party content
            belong to their respective owners.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>No warranty</h2>
          <p>
            The service is provided “as is” and “as available,” without warranties of any kind, express or implied,
            including accuracy, completeness, availability, fitness for a particular purpose, and non-infringement.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Limitation of liability</h2>
          <p>
            To the fullest extent the law allows, {BRAND.name} and its contributors are not liable for any indirect,
            incidental, special, consequential, or punitive damages, or for any loss arising from your use of, or
            reliance on, the service or its data.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Changes and contact</h2>
          <p>
            We may update these terms. When we do, we’ll change the date at the top; continuing to use the service
            means you accept the updated terms. Questions: <ContactLine />.
          </p>
          <div className="ip-links">
            <Link className="btn-text btn-go" to="/privacy">Privacy notice</Link>
            <Link className="btn-text btn-go" to="/contact">Contact</Link>
          </div>
        </div>
      </section>
    </div>
  )
}

export default TermsPage
