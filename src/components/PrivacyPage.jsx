import { Link } from 'react-router-dom'
import SEO from './SEO'
import { BRAND } from '../config/brand'
import '../styles/InfoPage.css'

// NOTE FOR MAINTAINERS: this notice was written from an audit of the code on
// 2026-10-04 (AuthContext, userService, TellYourRep, api/_lib/auth.js +
// usage.js, server/alerts, api/briefings, App.jsx analytics). It has NOT been
// reviewed by counsel. Have counsel review it before relying on it, and update
// it whenever data handling changes.

const LAST_UPDATED = 'October 4, 2026'
const REPO_URL = 'https://github.com/Shoberman2/politalapp'

function ContactLine() {
  if (BRAND.contactEmail) {
    return <>email <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a></>
  }
  return <>see our <Link to="/contact">contact page</Link></>
}

function PrivacyPage() {
  return (
    <div className="bw info-page ip-compact legal-page">
      <SEO
        title="Privacy"
        description={`What ${BRAND.name} collects, what it doesn't, and why. Tell your rep messages are never sent to or stored by us.`}
        path="/privacy"
      />

      <section className="ip-hero">
        <div className="ip-inner">
          <span className="ip-kicker">Privacy</span>
          <h1 className="ip-title">Privacy notice</h1>
          <p className="ip-lede">
            You can read the whole congressional record on {BRAND.name} without an account. This page explains, in
            plain language, the small amount of information we do handle and why.
          </p>
          <p className="ip-updated">Last updated: {LAST_UPDATED}</p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>The short version</h2>
          <ul className="ip-bullets">
            <li>Reading the site requires no account and sets no tracking or advertising cookies.</li>
            <li>
              <strong>Tell your rep messages are never sent to or stored by us.</strong> You write the text in your
              browser and send it yourself through your representative’s official contact page.
            </li>
            <li>If you enter an address to find your representatives, it is saved on your device, not on our servers.</li>
            <li>We don’t sell personal information, and we don’t use it for advertising.</li>
          </ul>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Finding your representatives</h2>
          <p>
            When you enter a ZIP code or street address, your browser sends it directly to the U.S. Census Bureau’s
            public geocoder (and, for some ZIP codes, the free Zippopotam.us lookup) to find your district. We save
            the address in your browser’s local storage so you don’t have to type it again. It is not sent to our
            servers or linked to an account. You can remove it by clearing this site’s data in your browser.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Tell your rep</h2>
          <p>
            The Tell your rep panel prefills a factual outline of a vote or bill. You write the message, copy it, and
            open your representative’s official contact page to send it. The text you write stays in your browser:
            we never receive it, store it, or send it anywhere.
          </p>
          <p>
            To understand whether the feature is useful, we count three anonymous events: <code>draft_opened</code>,{' '}
            <code>contact_page_opened</code>, and <code>message_sent_confirmed</code> (when you mark a message as
            sent). Each carries only a reference to the vote or bill and the member’s public Bioguide ID. They
            contain no message text, address, or account information.
          </p>
          <p>
            When you mark a message as sent, your browser also keeps a short note of it in local storage so the
            “You wrote; they voted” list can show what that member did on the bill afterwards: the member, the bill,
            vote, or member page it was about, and when you marked it. It never includes what you wrote, and it is not
            sent to our servers.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Accounts</h2>
          <p>
            Signing in is optional and only needed for features like bill alerts, API keys, and briefings. Accounts
            are handled by Supabase Auth, using either an email address and password or Google sign-in. We store
            your email address and a profile record. Passwords are managed by Supabase; we never see them. Your
            signed-in session is kept in your browser’s local storage.
          </p>
          <p>
            If you buy a paid plan, payment is handled by Stripe on its own checkout page. We store your Stripe
            customer ID and subscription status, never your card details.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Bill alerts</h2>
          <p>
            If you watch a bill, we store which bills you follow and your alert settings, linked to your account. If
            you turn on email alerts, we send them to your account email address through Resend, our email delivery
            provider. Resend reports back whether each email was delivered or bounced, and we keep those delivery
            events for up to 90 days. Queued and sent alert records are deleted after about 31 days.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Civic briefings and Gmail</h2>
          <p>
            Civic briefings are an optional paid feature that emails you a summary about a member or district you
            choose. If you connect Gmail to deliver them, we ask Google only for your email address and permission
            to send email (<code>gmail.send</code>). We cannot read your inbox. We store your Gmail address and the
            access tokens Google issues, encrypted, and use them only to send briefings to your own account email.
            You can disconnect Gmail at any time, which revokes our access.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Analytics</h2>
          <p>
            We use Vercel Web Analytics to count page views in aggregate. It is cookieless and does not build a
            profile of you across sites. These are the only custom events, with every field each one carries:
          </p>
          <ul className="ip-bullets" data-testid="analytics-events">
            <li><code>draft_opened</code>: the vote or bill reference and the member’s Bioguide ID.</li>
            <li><code>contact_page_opened</code>: the vote or bill reference and the member’s Bioguide ID.</li>
            <li><code>message_sent_confirmed</code>: the vote or bill reference and the member’s Bioguide ID.</li>
            <li>
              <code>record_shared</code>: the member’s Bioguide ID and how the record card was shared (copy, native
              share, X, Bluesky, Facebook, or email). Never the share text.
            </li>
          </ul>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>The API and MCP server</h2>
          <p>
            The public API and MCP server work without a key. To enforce rate limits, we compute a keyed hash of the
            caller’s IP address (a salted HMAC, so the address can’t be recovered from it) and keep short-lived
            counters. For API requests without a key we log the endpoint path, the response status and time, and that
            hashed IP. For requests with a key we log the same details against the key instead. We store API keys
            only as a one-way hash.
          </p>
          <p>
            Like any website, our hosting provider (Vercel) and database provider (Supabase) process standard request
            information, such as IP addresses, to deliver and secure the service.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Cookies and local storage</h2>
          <p>
            We don’t set advertising or tracking cookies. Everything below stays in your browser; you can remove it
            at any time by clearing this site’s data. The site’s local storage holds:
          </p>
          <ul className="ip-bullets" data-testid="storage-keys">
            <li><code>userData</code>: the address you entered to find your representatives, and any members you saved as favorites.</li>
            <li>
              <code>wrote:v1</code>: the messages you marked as sent: the member, the bill, vote, or member page it was
              about, and when you marked it. Never the message text. Up to 200 entries.
            </li>
            <li><code>bw-theme</code>: your light or dark theme choice.</li>
            <li><code>chamber_scrubber_taught_v1</code>: that you have seen the chamber chart hint.</li>
            <li>Your signed-in session (Supabase’s <code>sb-…-auth-token</code>), only if you sign in.</li>
            <li>
              Cached copies of public data so pages load faster: campaign-finance lookups (<code>fec_…</code>),
              voting-pattern analyses (<code>vpa_…</code>, <code>vpa_index</code>), and bill editorial summaries
              (<code>nb_editorial_…</code>).
            </li>
          </ul>
          <p>
            Session storage (cleared when you close the tab) remembers whether you dismissed the shutdown banner
            (<code>shutdownBannerDismissed</code>). Google and Stripe may set their own cookies on their pages when you
            sign in with Google or pay.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Who we share data with</h2>
          <p>
            Only the service providers that run the features above: Supabase (accounts and database), Vercel
            (hosting and analytics), Resend (alert email), Stripe (payments), Google (sign-in and Gmail delivery, if
            you use them), and Upstash (rate-limit counters, where enabled). Bill text and public summaries are sent to an AI
            provider to write explanations; no personal information is included. We may disclose information if the
            law requires it.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Retention and deletion</h2>
          <p>
            Account data is kept while your account exists. Alert delivery records are deleted on the schedule
            above. API usage logs are kept to operate and secure the API. To delete your account and the data linked
            to it, or to ask what we hold about you, <ContactLine />. Deleting your account removes your profile,
            followed bills, alert settings, API keys, briefing preferences, and Gmail connection.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Children</h2>
          <p>
            {BRAND.name} is a general-audience civic reference and is not directed to children under 13. We don’t
            knowingly collect personal information from children under 13. If you believe a child has created an
            account, <ContactLine /> and we will delete it.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Changes and contact</h2>
          <p>
            If we change how we handle information, we’ll update this page and the date at the top. Because the code
            is open source, you can also check what the site does on{' '}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>.
            Questions about this notice: <ContactLine />.
          </p>
          <div className="ip-links">
            <Link className="btn-text btn-go" to="/terms">Terms of use</Link>
            <Link className="btn-text btn-go" to="/contact">Contact</Link>
          </div>
        </div>
      </section>
    </div>
  )
}

export default PrivacyPage
