import { Link } from 'react-router-dom'
import SEO from './SEO'
import { BRAND } from '../config/brand'
import '../styles/InfoPage.css'

const REPO = 'https://github.com/Shoberman2/politalapp'
const CORRECTION_ISSUE_URL = `${REPO}/issues/new?template=data_correction.yml`
const SECURITY_URL = `${REPO}/blob/main/SECURITY.md`
const ISSUES_URL = `${REPO}/issues`

function ContactPage() {
  const email = BRAND.contactEmail

  return (
    <div className="bw info-page contact-page">
      <SEO
        title="Contact"
        description={`How to reach ${BRAND.name}: data corrections, security reports, and general questions.`}
        path="/contact"
      />

      <section className="ip-hero">
        <div className="ip-inner">
          <span className="ip-kicker">Contact</span>
          <h1 className="ip-title">How to reach us</h1>
          <p className="ip-lede">
            {BRAND.name} is a small, open-source project. The fastest way to reach us depends on what you need.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <ul className="ip-list">
            <li>
              <h2>A correction to the record</h2>
              <p>
                If a vote, bill, or member detail looks wrong, open a correction with the page, the field, the value
                you expected, and a public source that shows it.
              </p>
              <div className="ip-links">
                <a className="btn-text btn-go" href={CORRECTION_ISSUE_URL} target="_blank" rel="noopener noreferrer">Open a correction</a>
                <Link className="btn-text btn-go" to="/methodology/corrections">Corrections policy</Link>
              </div>
            </li>
            <li>
              <h2>A security issue</h2>
              <p>
                Please don’t report vulnerabilities, exposed keys, or user data in a public issue. Follow the
                security policy for a private report.
              </p>
              <div className="ip-links">
                <a className="btn-text btn-go" href={SECURITY_URL} target="_blank" rel="noopener noreferrer">Security policy</a>
              </div>
            </li>
            <li>
              <h2>Everything else</h2>
              {email ? (
                <p>
                  Questions, privacy or deletion requests, and press: email{' '}
                  <a href={`mailto:${email}`}>{email}</a>.
                </p>
              ) : (
                <p>
                  Questions, feedback, and bug reports go to GitHub issues. We don’t have a public email address yet.
                  For a privacy or account deletion request, open an issue asking for a private contact, and leave
                  out any personal details.
                </p>
              )}
              <div className="ip-links">
                <a className="btn-text btn-go" href={ISSUES_URL} target="_blank" rel="noopener noreferrer">GitHub issues</a>
                <Link className="btn-text btn-go" to="/offices">For congressional offices</Link>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <p className="ip-muted">
            {BRAND.name} can’t pass messages to members of Congress. To contact your representative, use the
            “Tell your rep” panel on a vote, bill, or member page, which opens their office’s official contact page.
          </p>
        </div>
      </section>
    </div>
  )
}

export default ContactPage
