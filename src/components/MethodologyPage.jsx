import { Link, Navigate, useParams } from 'react-router-dom'
import SEO from './SEO'
import { METHODOLOGY_PAGES } from '../data/openSource'
import '../styles/OpenSourcePage.css'

function MethodologyIndex() {
  return (
    <div className="open-page methodology-page">
      <SEO
        title="BallotWatch Methodology"
        description="Source, caveat, cadence, and code-reference notes for BallotWatch congressional data features."
        path="/methodology"
      />
      <section className="open-hero methodology-hero">
        <div className="open-hero-copy">
          <span className="open-kicker">Methodology</span>
          <h1>How BallotWatch earns trust.</h1>
          <p>
            Every computed or AI-assisted feature should explain what question it
            answers, what source backs it, how often it updates, and what caveat
            belongs beside the number.
          </p>
        </div>
      </section>

      <section className="open-band">
        <div className="open-method-grid open-method-grid-large">
          {METHODOLOGY_PAGES.map(page => (
            <Link className="open-method-link" key={page.slug} to={`/methodology/${page.slug}`}>
              <span>{page.title}</span>
              <p>{page.dek}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

function MethodologyDetail({ page }) {
  return (
    <div className="open-page methodology-page">
      <SEO
        title={`${page.title} Methodology`}
        description={page.dek}
        path={`/methodology/${page.slug}`}
      />
      <Link className="methodology-back" to="/methodology">
        Back to methodology
      </Link>
      <article className="methodology-article">
        <header>
          <span className="open-kicker">Methodology</span>
          <h1>{page.title}</h1>
          <p>{page.dek}</p>
        </header>

        <dl className="methodology-facts">
          <div>
            <dt>Source</dt>
            <dd>{page.source}</dd>
          </div>
          <div>
            <dt>Cadence</dt>
            <dd>{page.cadence}</dd>
          </div>
          <div>
            <dt>Caveat</dt>
            <dd>{page.caveat}</dd>
          </div>
        </dl>

        {page.sections.map(section => (
          <section key={section.heading} className="methodology-section-block">
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </section>
        ))}

        <section className="methodology-code">
          <h2>Code references</h2>
          <ul>
            {page.codeRefs.map(ref => (
              <li key={ref}><code>{ref}</code></li>
            ))}
          </ul>
        </section>
      </article>
    </div>
  )
}

function MethodologyPage() {
  const { slug } = useParams()

  if (!slug) return <MethodologyIndex />

  const page = METHODOLOGY_PAGES.find(item => item.slug === slug)
  if (!page) return <Navigate to="/methodology" replace />

  return <MethodologyDetail page={page} />
}

export default MethodologyPage
