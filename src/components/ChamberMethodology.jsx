import SEO from './SEO'
import '../styles/Chamber.css'

/**
 * ChamberMethodology — the public methodology page for the chamber feature.
 *
 * Per /plan-ceo-review 4.A: hand-curated moments require a visible
 * methodology page listing criteria + every included moment + why.
 *
 * Per /plan-design-review Pass 5: reuses the existing MethodologyModal
 * pattern but as a full page (rather than a modal) so it's deep-linkable
 * from chamber pages and external links.
 *
 * Route: /chamber/methodology
 */

function ChamberMethodology() {
  return (
    <div className="chamber-page chamber-methodology-page">
      <SEO
        title="Chamber methodology · BallotWatch"
        description="How BallotWatch reconstructs the historical Senate chamber, how we pick historic moments, and what fidelity tiers mean."
      />

      <header className="chamber-header">
        <div className="chamber-eyebrow">BALLOTWATCH</div>
        <h1 className="chamber-title"><em>Chamber methodology</em></h1>
        <div className="chamber-subtitle">
          How we reconstructed 50 years of Senate seating
        </div>
      </header>

      <hr className="chamber-rule" />

      <article className="chamber-methodology-body">
        <section>
          <h2>Data sources</h2>
          <p>
            The chamber chart is reconstructed from four sources, each with
            different coverage:
          </p>
          <dl>
            <dt>Congress.gov member API</dt>
            <dd>
              Authoritative for current and post-1993 member data — party,
              state, district, chamber. Coverage thins pre-1993 (some members
              have records without sponsors or terms).
            </dd>
            <dt>UCSD Voteview (HSall_members.csv)</dt>
            <dd>
              Hand-maintained ICPSR ↔ bioguide ID crosswalk used by
              political-science researchers since the 1980s. Resolves pre-1993
              identity reconciliation. Freely licensed for research use.
            </dd>
            <dt>Senate Historical Office</dt>
            <dd>
              Senate desk assignments and famous-desk lineage. Machine-readable
              for recent Congresses; pre-1989 data is hand-curated from SHO
              publications.
            </dd>
            <dt>Senate.gov roll-call XML</dt>
            <dd>
              Per-Congress roll-call vote records. Used by the historic
              moments overlay once vote backfill completes.
            </dd>
          </dl>
        </section>

        <section>
          <h2>Fidelity tiers</h2>
          <p>
            Every Congress has one of three fidelity tiers, surfaced in the
            chart header:
          </p>
          <dl>
            <dt>
              <span className="chamber-fidelity-dot-inline" style={{ backgroundColor: '#16A34A' }} />
              Full record
            </dt>
            <dd>
              Member-Congress data complete, Senate desk assignments present,
              roll-call votes available. Chamber renders all 100 desks with
              senator names + party tints.
            </dd>
            <dt>
              <span className="chamber-fidelity-dot-inline" style={{ backgroundColor: '#D97706' }} />
              Partial record
            </dt>
            <dd>
              Some senators or roll-call votes are missing for this Congress.
              Chart renders what we have with a caveat banner.
            </dd>
            <dt>
              <span className="chamber-fidelity-dot-inline" style={{ backgroundColor: '#9C9789' }} />
              Composition only
            </dt>
            <dd>
              Desk-level data unavailable. Chart falls back to a party-block
              hemicycle showing only composition (counts on each side). We
              do <strong>not</strong> show fictional desk assignments.
            </dd>
          </dl>
        </section>

        <section>
          <h2>Historic moments curation</h2>
          <p>
            The historic moments overlay highlights notable Senate roll-call
            votes that the chamber chart can "freeze on." Selection is
            hand-curated against four criteria:
          </p>
          <ol>
            <li>Nationally discussed within 90 days of the vote</li>
            <li>AP/NYT front-page coverage at the time</li>
            <li>Lasting policy impact (measured 12+ months after the vote)</li>
            <li>Cross-decade balance across the Bush, Obama, Trump, and Biden eras</li>
          </ol>
          <p>
            We deliberately do <strong>not</strong> use an algorithm to pick
            moments — the criteria above are editorial, and the list above
            is the full disclosure of which votes we included and why.
          </p>
        </section>

        <section>
          <h2>What the chart does <em>not</em> show</h2>
          <ul>
            <li>
              <strong>House individual seat assignments.</strong> The U.S.
              House of Representatives does not have assigned seats —
              members sit anywhere within their party's section. Any chart
              showing per-seat House data would be invented. We show party
              composition only, with an explicit disclosure on the House view.
            </li>
            <li>
              <strong>Live "where senators are sitting today."</strong> No
              such data feed exists. The chart shows per-Congress assignments
              (where each senator sat during the entire Congress).
            </li>
            <li>
              <strong>Editorial judgments about votes.</strong> Vote outcomes
              are displayed as plain text (e.g. "60-39 · Senate Yea") without
              gauges, dials, or color-by-significance. We trust the user to
              interpret the tallies.
            </li>
          </ul>
        </section>

        <section>
          <h2>Corrections</h2>
          <p>
            Spot a desk assignment that's wrong, a lineage row missing, or a
            historic moment we missed? Open an issue or PR against the public
            repo. Data sources are cited per record in the database, and the
            <em>{' '}member_reconciliation_log{' '}</em>
            table is an open audit of cross-source identity conflicts and how
            we resolved them.
          </p>
        </section>
      </article>
    </div>
  )
}

export default ChamberMethodology
